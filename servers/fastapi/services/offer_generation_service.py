import logging
import os
from typing import Optional

import aiohttp
from fastapi import HTTPException

from models.llm_message import LLMSystemMessage, LLMUserMessage
from services.llm_client import LLMClient
from utils.get_env import get_app_data_directory_env, get_gotenberg_url_env
from utils.llm_provider import get_model

logger = logging.getLogger(__name__)

OFFER_SYSTEM_PROMPT = """You are a senior sales consultant specializing in creating professional commercial offers.
Your task is to generate a well-structured, professional commercial offer in Polish language.
The offer should be persuasive yet professional, highlighting value propositions clearly.
Structure the content with clear sections using HTML tags for formatting.
Use <h2> for section headings, <p> for paragraphs, <ul>/<li> for bullet lists.
Do NOT include company header data or footer - these are handled by the template.
Focus only on the main body content of the offer."""

OFFER_TEMPLATE = """<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8">
<style>
  @page { margin: 2cm; size: A4; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #333; line-height: 1.6; font-size: 14px; }
  .header { border-bottom: 3px solid #2563eb; padding-bottom: 20px; margin-bottom: 30px; }
  .header h1 { color: #2563eb; font-size: 24px; margin: 0 0 5px 0; }
  .header .subtitle { color: #666; font-size: 14px; }
  .client-info { background: #f8fafc; padding: 15px 20px; border-radius: 8px; margin-bottom: 30px; }
  .client-info h3 { margin: 0 0 8px 0; color: #2563eb; font-size: 16px; }
  .client-info p { margin: 3px 0; font-size: 13px; }
  .content h2 { color: #1e40af; font-size: 18px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; }
  .content p { margin: 8px 0; }
  .content ul { padding-left: 20px; }
  .content li { margin: 4px 0; }
  .footer { margin-top: 40px; padding-top: 20px; border-top: 2px solid #e2e8f0; font-size: 12px; color: #666; }
  .footer .validity { font-weight: bold; color: #333; }
</style>
</head>
<body>
  <div class="header">
    <h1>{{title}}</h1>
    <div class="subtitle">Oferta handlowa</div>
  </div>

  <div class="client-info">
    <h3>Dane klienta</h3>
    <p><strong>{{company_name}}</strong></p>
    {{#company_nip}}<p>NIP: {{company_nip}}</p>{{/company_nip}}
    {{#company_address}}<p>{{company_address}}</p>{{/company_address}}
    {{#contact_name}}<p>Osoba kontaktowa: {{contact_name}}</p>{{/contact_name}}
    {{#contact_email}}<p>Email: {{contact_email}}</p>{{/contact_email}}
    {{#contact_phone}}<p>Tel: {{contact_phone}}</p>{{/contact_phone}}
  </div>

  <div class="content">
    {{ai_generated_content}}
  </div>

  <div class="footer">
    {{#valid_until}}<p class="validity">Oferta ważna do: {{valid_until}}</p>{{/valid_until}}
    <p>Dokument wygenerowany automatycznie.</p>
  </div>
</body>
</html>"""


class OfferGenerationService:
    """Handles AI content generation and PDF conversion for offers."""

    async def generate_content(
        self,
        company_name: str,
        company_nip: Optional[str],
        contact_first_name: Optional[str],
        contact_last_name: Optional[str],
        description_text: str,
        valid_until: Optional[str],
    ) -> str:
        """Use LLM to generate structured offer content from description text."""
        contact_name = " ".join(
            filter(None, [contact_first_name, contact_last_name])
        )

        user_prompt = f"""Generate a professional commercial offer in Polish based on the following data:

Company: {company_name}
{f'NIP: {company_nip}' if company_nip else ''}
{f'Contact person: {contact_name}' if contact_name else ''}
{f'Valid until: {valid_until}' if valid_until else ''}

Description / Scope of the offer:
{description_text}

Generate the body content of the offer with clear sections. Use HTML tags (<h2>, <p>, <ul>, <li>) for formatting.
Include sections like: Introduction, Scope of Services/Products, Benefits, Pricing (if mentioned), Terms, and Summary.
Write in a professional but approachable tone."""

        llm_client = LLMClient()
        model = get_model()

        messages = [
            LLMSystemMessage(role="system", content=OFFER_SYSTEM_PROMPT),
            LLMUserMessage(role="user", content=user_prompt),
        ]

        content = await llm_client.generate(
            model=model,
            messages=messages,
            max_tokens=4000,
        )

        return content

    def render_html(
        self,
        title: str,
        company_name: str,
        company_nip: Optional[str],
        company_address: Optional[str],
        contact_first_name: Optional[str],
        contact_last_name: Optional[str],
        contact_email: Optional[str],
        contact_phone: Optional[str],
        valid_until: Optional[str],
        ai_generated_content: str,
    ) -> str:
        """Render the offer HTML template with provided data."""
        contact_name = " ".join(
            filter(None, [contact_first_name, contact_last_name])
        )

        html = OFFER_TEMPLATE
        html = html.replace("{{title}}", title)
        html = html.replace("{{company_name}}", company_name)

        # Simple mustache-like conditional blocks
        for field, value in [
            ("company_nip", company_nip),
            ("company_address", company_address),
            ("contact_name", contact_name),
            ("contact_email", contact_email),
            ("contact_phone", contact_phone),
            ("valid_until", valid_until),
        ]:
            if value:
                html = html.replace(f"{{{{{{{field}}}}}}}", value)
                html = html.replace(f"{{{{#{field}}}}}", "")
                html = html.replace(f"{{{{/{field}}}}}", "")
            else:
                # Remove the entire conditional block
                import re
                pattern = rf"\{{\{{#{field}\}}\}}.*?\{{\{{/{field}\}}\}}"
                html = re.sub(pattern, "", html, flags=re.DOTALL)

        html = html.replace("{{ai_generated_content}}", ai_generated_content)
        return html

    async def generate_pdf(self, html_content: str, output_path: str) -> str:
        """Convert HTML to PDF using Gotenberg."""
        gotenberg_url = get_gotenberg_url_env() or "http://localhost:3100"

        os.makedirs(os.path.dirname(output_path), exist_ok=True)

        try:
            form = aiohttp.FormData()
            form.add_field(
                "files",
                html_content.encode("utf-8"),
                filename="index.html",
                content_type="text/html",
            )
            form.add_field("paperWidth", "8.27")
            form.add_field("paperHeight", "11.69")
            form.add_field("marginTop", "0")
            form.add_field("marginBottom", "0")
            form.add_field("marginLeft", "0")
            form.add_field("marginRight", "0")

            async with aiohttp.ClientSession() as http_session:
                async with http_session.post(
                    f"{gotenberg_url}/forms/chromium/convert/html",
                    data=form,
                    timeout=aiohttp.ClientTimeout(total=60),
                ) as resp:
                    if resp.status != 200:
                        error_body = await resp.text()
                        raise HTTPException(
                            status_code=502,
                            detail=f"Gotenberg returned {resp.status}: {error_body}",
                        )
                    pdf_bytes = await resp.read()

            with open(output_path, "wb") as f:
                f.write(pdf_bytes)

            logger.info(f"PDF generated: {output_path}")
            return output_path

        except aiohttp.ClientError as e:
            raise HTTPException(
                status_code=502,
                detail=f"Failed to connect to Gotenberg: {str(e)}",
            )
