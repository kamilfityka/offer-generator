import logging
import os
import uuid
from datetime import date as date_type
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from models.sql.offer import OfferModel
from services.database import get_async_session
from services.offer_generation_service import OfferGenerationService
from services.raynet_crm_service import RaynetCrmService
from utils.get_env import get_app_data_directory_env

logger = logging.getLogger(__name__)

OFFERS_ROUTER = APIRouter(prefix="/offers", tags=["Offers"])

offer_gen_service = OfferGenerationService()
crm_service = RaynetCrmService()

ALLOWED_STATUSES = {"draft", "generated", "sent", "accepted", "expired"}


# ── Request models ──────────────────────────────────────

class CreateOfferRequest(BaseModel):
    # Raynet IDs (needed for CRM write-back)
    raynet_company_id: Optional[str] = None
    raynet_contact_id: Optional[str] = None
    # Client snapshot
    company_name: str
    company_nip: Optional[str] = None
    company_address: Optional[str] = None
    contact_first_name: Optional[str] = None
    contact_last_name: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    # Offer data
    title: str
    valid_until: Optional[str] = None  # YYYY-MM-DD


class UpdateStatusRequest(BaseModel):
    status: str


class SendToCrmRequest(BaseModel):
    estimated_value: Optional[float] = None


# ── CRUD ────────────────────────────────────────────────

@OFFERS_ROUTER.post("")
async def create_offer(
    request: CreateOfferRequest,
    session: AsyncSession = Depends(get_async_session),
):
    """Create a new offer (draft) with client data snapshot."""
    valid_until = None
    if request.valid_until:
        try:
            valid_until = date_type.fromisoformat(request.valid_until)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")

    offer = OfferModel(
        raynet_company_id=request.raynet_company_id,
        raynet_contact_id=request.raynet_contact_id,
        company_name=request.company_name,
        company_nip=request.company_nip,
        company_address=request.company_address,
        contact_first_name=request.contact_first_name,
        contact_last_name=request.contact_last_name,
        contact_phone=request.contact_phone,
        contact_email=request.contact_email,
        title=request.title,
        valid_until=valid_until,
        status="draft",
    )
    session.add(offer)
    await session.commit()
    await session.refresh(offer)

    return _offer_to_dict(offer)


@OFFERS_ROUTER.get("")
async def list_offers(session: AsyncSession = Depends(get_async_session)):
    """List all offers."""
    result = await session.exec(select(OfferModel).order_by(OfferModel.created_at.desc()))
    offers = result.all()
    return [_offer_to_dict(o) for o in offers]


@OFFERS_ROUTER.get("/{offer_id}")
async def get_offer(
    offer_id: str,
    session: AsyncSession = Depends(get_async_session),
):
    """Get a single offer by ID."""
    offer = await _get_offer_or_404(session, offer_id)
    return _offer_to_dict(offer)


# ── File upload ─────────────────────────────────────────

@OFFERS_ROUTER.post("/{offer_id}/upload-description")
async def upload_description(
    offer_id: str,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_async_session),
):
    """Upload a source text/markdown file for the offer description."""
    offer = await _get_offer_or_404(session, offer_id)

    if file.content_type not in ("text/plain", "text/markdown", "application/octet-stream"):
        raise HTTPException(
            status_code=400,
            detail="Only .txt and .md files are accepted.",
        )

    app_data = get_app_data_directory_env() or "/app_data"
    upload_dir = os.path.join(app_data, "uploads", "offers")
    os.makedirs(upload_dir, exist_ok=True)

    ext = ".md" if file.filename and file.filename.endswith(".md") else ".txt"
    file_path = os.path.join(upload_dir, f"offer_{offer.id}{ext}")

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    offer.description_file_path = file_path
    session.add(offer)
    await session.commit()
    await session.refresh(offer)

    return {"message": "Description uploaded", "file_path": file_path}


# ── AI + PDF generation ────────────────────────────────

@OFFERS_ROUTER.post("/{offer_id}/generate-pdf")
async def generate_pdf(
    offer_id: str,
    session: AsyncSession = Depends(get_async_session),
):
    """Generate offer content via AI and convert to PDF."""
    offer = await _get_offer_or_404(session, offer_id)

    # Read description file
    description_text = ""
    if offer.description_file_path and os.path.exists(offer.description_file_path):
        with open(offer.description_file_path, "r", encoding="utf-8") as f:
            description_text = f.read()

    if not description_text:
        raise HTTPException(
            status_code=400,
            detail="No description file found. Upload a description first.",
        )

    # Step 1: AI content
    ai_content = await offer_gen_service.generate_content(
        company_name=offer.company_name,
        company_nip=offer.company_nip,
        contact_first_name=offer.contact_first_name,
        contact_last_name=offer.contact_last_name,
        description_text=description_text,
        valid_until=str(offer.valid_until) if offer.valid_until else None,
    )

    # Step 2: Render HTML
    html_content = offer_gen_service.render_html(
        title=offer.title,
        company_name=offer.company_name,
        company_nip=offer.company_nip,
        company_address=offer.company_address,
        contact_first_name=offer.contact_first_name,
        contact_last_name=offer.contact_last_name,
        contact_email=offer.contact_email,
        contact_phone=offer.contact_phone,
        valid_until=str(offer.valid_until) if offer.valid_until else None,
        ai_generated_content=ai_content,
    )

    # Step 3: PDF via Gotenberg
    app_data = get_app_data_directory_env() or "/app_data"
    pdf_dir = os.path.join(app_data, "offers", "pdf")
    os.makedirs(pdf_dir, exist_ok=True)
    pdf_path = os.path.join(pdf_dir, f"offer_{offer.id}.pdf")

    await offer_gen_service.generate_pdf(html_content, pdf_path)

    # Step 4: Update record
    offer.ai_generated_content = ai_content
    offer.document_path = pdf_path
    offer.status = "generated"
    session.add(offer)
    await session.commit()
    await session.refresh(offer)

    return _offer_to_dict(offer)


# ── Send to CRM (Opportunity + Document + Activity) ────

@OFFERS_ROUTER.post("/{offer_id}/send-to-crm")
async def send_to_crm(
    offer_id: str,
    request: SendToCrmRequest,
    session: AsyncSession = Depends(get_async_session),
):
    """
    Full CRM write-back flow:
    1. POST /opportunity  – create sales opportunity
    2. POST /document     – attach offer PDF
    3. POST /activity     – log the email/action
    4. Update offer status to 'sent'
    """
    offer = await _get_offer_or_404(session, offer_id)

    if not offer.raynet_company_id:
        raise HTTPException(
            status_code=400,
            detail="Offer has no Raynet company ID. Select a CRM company when creating the offer.",
        )

    if not offer.document_path or not os.path.exists(offer.document_path):
        raise HTTPException(
            status_code=400,
            detail="PDF not generated yet. Generate the PDF first.",
        )

    try:
        # 1. Create Opportunity
        valid_from = str(offer.created_at.date()) if offer.created_at else None
        valid_till = str(offer.valid_until) if offer.valid_until else None

        opp_result = crm_service.create_opportunity(
            name=f"Oferta: {offer.title}",
            company_raynet_id=offer.raynet_company_id,
            person_raynet_id=offer.raynet_contact_id,
            estimated_value=request.estimated_value,
            valid_from=valid_from,
            valid_till=valid_till,
        )
        opp_data = await opp_result

        # Extract opportunity ID from response
        opp_id = opp_data.get("data", {}).get("id") or opp_data.get("id")
        if not opp_id:
            raise RuntimeError(f"Could not extract opportunity ID from response: {opp_data}")

        offer.raynet_opportunity_id = int(opp_id)

        # 2. Upload Document (PDF) to opportunity
        await crm_service.upload_document(
            name=f"Oferta {offer.title}",
            opportunity_raynet_id=int(opp_id),
            pdf_path=offer.document_path,
        )

        # 3. Create Activity (email log)
        contact_name = " ".join(filter(None, [offer.contact_first_name, offer.contact_last_name]))
        await crm_service.create_activity(
            subject=f"Wysłanie oferty: {offer.title}",
            company_raynet_id=offer.raynet_company_id,
            person_raynet_id=offer.raynet_contact_id,
            opportunity_raynet_id=int(opp_id),
            note=f"Oferta PDF wysłana do klienta{f' ({contact_name})' if contact_name else ''}.",
        )

        # 4. Update status
        offer.status = "sent"
        session.add(offer)
        await session.commit()
        await session.refresh(offer)

        return {
            **_offer_to_dict(offer),
            "crm_opportunity_id": int(opp_id),
            "message": "Offer sent to CRM successfully",
        }

    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))


# ── Status & delete ────────────────────────────────────

@OFFERS_ROUTER.patch("/{offer_id}/status")
async def update_status(
    offer_id: str,
    request: UpdateStatusRequest,
    session: AsyncSession = Depends(get_async_session),
):
    """Update offer status."""
    if request.status not in ALLOWED_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Allowed: {', '.join(sorted(ALLOWED_STATUSES))}",
        )

    offer = await _get_offer_or_404(session, offer_id)
    offer.status = request.status
    session.add(offer)
    await session.commit()
    await session.refresh(offer)

    return _offer_to_dict(offer)


@OFFERS_ROUTER.delete("/{offer_id}")
async def delete_offer(
    offer_id: str,
    session: AsyncSession = Depends(get_async_session),
):
    """Delete an offer."""
    offer = await _get_offer_or_404(session, offer_id)

    for path in [offer.description_file_path, offer.document_path]:
        if path and os.path.exists(path):
            os.remove(path)

    await session.delete(offer)
    await session.commit()
    return {"message": "Offer deleted"}


@OFFERS_ROUTER.get("/{offer_id}/download-pdf")
async def download_pdf(
    offer_id: str,
    session: AsyncSession = Depends(get_async_session),
):
    """Download the generated PDF for an offer."""
    from fastapi.responses import FileResponse

    offer = await _get_offer_or_404(session, offer_id)

    if not offer.document_path or not os.path.exists(offer.document_path):
        raise HTTPException(status_code=404, detail="PDF not found. Generate it first.")

    return FileResponse(
        path=offer.document_path,
        media_type="application/pdf",
        filename=f"offer_{offer.title}.pdf",
    )


# ── Helpers ─────────────────────────────────────────────

async def _get_offer_or_404(session: AsyncSession, offer_id: str) -> OfferModel:
    try:
        uid = uuid.UUID(offer_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid offer ID format")

    result = await session.exec(select(OfferModel).where(OfferModel.id == uid))
    offer = result.first()
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    return offer


def _offer_to_dict(offer: OfferModel) -> dict:
    return {
        "id": str(offer.id),
        "raynet_company_id": offer.raynet_company_id,
        "raynet_contact_id": offer.raynet_contact_id,
        "raynet_opportunity_id": offer.raynet_opportunity_id,
        "company_name": offer.company_name,
        "company_nip": offer.company_nip,
        "company_address": offer.company_address,
        "contact_first_name": offer.contact_first_name,
        "contact_last_name": offer.contact_last_name,
        "contact_phone": offer.contact_phone,
        "contact_email": offer.contact_email,
        "title": offer.title,
        "valid_until": str(offer.valid_until) if offer.valid_until else None,
        "description_file_path": offer.description_file_path,
        "status": offer.status,
        "document_path": offer.document_path,
        "ai_generated_content": offer.ai_generated_content,
        "created_at": offer.created_at.isoformat() if offer.created_at else None,
        "updated_at": offer.updated_at.isoformat() if offer.updated_at else None,
    }
