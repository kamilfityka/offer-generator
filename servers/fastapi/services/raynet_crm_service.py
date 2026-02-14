import logging
from typing import List, Optional
import aiohttp
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from models.sql.crm_company import CrmCompanyModel
from models.sql.crm_contact import CrmContactModel
from utils.get_env import get_raynet_api_url_env, get_raynet_api_key_env

logger = logging.getLogger(__name__)


class RaynetCrmService:
    """Read-only integration with Raynet CRM. Caches data locally."""

    def __init__(self):
        self.base_url = get_raynet_api_url_env() or "https://app.raynet.cz/api/v2"
        self.api_key = get_raynet_api_key_env()

    def _get_headers(self) -> dict:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["X-Instance-Name"] = self.api_key.split(":")[0] if ":" in self.api_key else ""
            # Raynet uses Basic Auth with username:api_key
            import base64
            credentials = base64.b64encode(self.api_key.encode()).decode()
            headers["Authorization"] = f"Basic {credentials}"
        return headers

    async def sync_companies(self, session: AsyncSession) -> List[CrmCompanyModel]:
        """Fetch companies from Raynet CRM and upsert into local cache."""
        if not self.api_key:
            logger.warning("Raynet API key not configured, skipping CRM sync")
            return []

        try:
            async with aiohttp.ClientSession() as http:
                async with http.get(
                    f"{self.base_url}/company/",
                    headers=self._get_headers(),
                    timeout=aiohttp.ClientTimeout(total=30),
                ) as resp:
                    if resp.status != 200:
                        logger.error(f"Raynet API returned {resp.status}")
                        return []
                    data = await resp.json()

            companies = data.get("data", [])
            synced = []
            for company in companies:
                raynet_id = str(company.get("id", ""))
                if not raynet_id:
                    continue

                existing = await session.exec(
                    select(CrmCompanyModel).where(CrmCompanyModel.raynet_id == raynet_id)
                )
                existing_company = existing.first()

                if existing_company:
                    existing_company.name = company.get("name", existing_company.name)
                    existing_company.nip = company.get("regNumber", existing_company.nip)
                    existing_company.address = self._format_address(company)
                    session.add(existing_company)
                    synced.append(existing_company)
                else:
                    new_company = CrmCompanyModel(
                        raynet_id=raynet_id,
                        name=company.get("name", ""),
                        nip=company.get("regNumber"),
                        address=self._format_address(company),
                    )
                    session.add(new_company)
                    synced.append(new_company)

            await session.commit()
            logger.info(f"Synced {len(synced)} companies from Raynet")
            return synced

        except Exception as e:
            logger.error(f"Failed to sync companies from Raynet: {e}")
            return []

    async def sync_contacts(self, session: AsyncSession) -> List[CrmContactModel]:
        """Fetch contacts from Raynet CRM and upsert into local cache."""
        if not self.api_key:
            logger.warning("Raynet API key not configured, skipping contacts sync")
            return []

        try:
            async with aiohttp.ClientSession() as http:
                async with http.get(
                    f"{self.base_url}/person/",
                    headers=self._get_headers(),
                    timeout=aiohttp.ClientTimeout(total=30),
                ) as resp:
                    if resp.status != 200:
                        logger.error(f"Raynet API returned {resp.status}")
                        return []
                    data = await resp.json()

            contacts = data.get("data", [])
            synced = []
            for contact in contacts:
                raynet_id = str(contact.get("id", ""))
                if not raynet_id:
                    continue

                # Find linked company
                company_id = None
                company_raynet_id = contact.get("company", {}).get("id")
                if company_raynet_id:
                    result = await session.exec(
                        select(CrmCompanyModel).where(
                            CrmCompanyModel.raynet_id == str(company_raynet_id)
                        )
                    )
                    company = result.first()
                    if company:
                        company_id = company.id

                existing = await session.exec(
                    select(CrmContactModel).where(CrmContactModel.raynet_id == raynet_id)
                )
                existing_contact = existing.first()

                if existing_contact:
                    existing_contact.first_name = contact.get("firstName", existing_contact.first_name)
                    existing_contact.last_name = contact.get("lastName", existing_contact.last_name)
                    existing_contact.phone = self._get_contact_phone(contact)
                    existing_contact.email = self._get_contact_email(contact)
                    if company_id:
                        existing_contact.company_id = company_id
                    session.add(existing_contact)
                    synced.append(existing_contact)
                else:
                    new_contact = CrmContactModel(
                        raynet_id=raynet_id,
                        company_id=company_id,
                        first_name=contact.get("firstName"),
                        last_name=contact.get("lastName"),
                        phone=self._get_contact_phone(contact),
                        email=self._get_contact_email(contact),
                    )
                    session.add(new_contact)
                    synced.append(new_contact)

            await session.commit()
            logger.info(f"Synced {len(synced)} contacts from Raynet")
            return synced

        except Exception as e:
            logger.error(f"Failed to sync contacts from Raynet: {e}")
            return []

    @staticmethod
    def _format_address(company: dict) -> Optional[str]:
        addr = company.get("primaryAddress", {})
        if not addr:
            return None
        parts = [
            addr.get("street", ""),
            addr.get("city", ""),
            addr.get("zipCode", ""),
            addr.get("country", ""),
        ]
        return ", ".join(p for p in parts if p) or None

    @staticmethod
    def _get_contact_phone(contact: dict) -> Optional[str]:
        phones = contact.get("contactInfo", {}).get("tel1", "")
        return phones or None

    @staticmethod
    def _get_contact_email(contact: dict) -> Optional[str]:
        email = contact.get("contactInfo", {}).get("email", "")
        return email or None

    # --- Local cache query methods ---

    @staticmethod
    async def get_companies(session: AsyncSession) -> List[CrmCompanyModel]:
        result = await session.exec(select(CrmCompanyModel))
        return list(result.all())

    @staticmethod
    async def get_company(session: AsyncSession, company_id: str) -> Optional[CrmCompanyModel]:
        result = await session.exec(
            select(CrmCompanyModel).where(CrmCompanyModel.id == company_id)
        )
        return result.first()

    @staticmethod
    async def get_contacts_for_company(
        session: AsyncSession, company_id: str
    ) -> List[CrmContactModel]:
        result = await session.exec(
            select(CrmContactModel).where(CrmContactModel.company_id == company_id)
        )
        return list(result.all())
