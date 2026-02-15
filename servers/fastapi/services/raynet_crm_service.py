import base64
import logging
import os
from typing import List, Optional

import aiohttp
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from models.sql.crm_company import CrmCompanyModel
from models.sql.crm_contact import CrmContactModel
from utils.get_env import (
    get_raynet_api_url_env,
    get_raynet_api_key_env,
    get_raynet_login_env,
)

logger = logging.getLogger(__name__)

DEFAULT_BASE_URL = "https://app.raynetcrm.com/api/v2"


class RaynetCrmService:
    """Integration with Raynet CRM – read (cache) + write (opportunity, document, activity)."""

    def __init__(self):
        self.base_url = (get_raynet_api_url_env() or DEFAULT_BASE_URL).rstrip("/")
        self.api_key = get_raynet_api_key_env()
        self.login = get_raynet_login_env()

    # ──────────────────────────────────────────────
    # Auth helpers
    # ──────────────────────────────────────────────

    def _get_headers(self) -> dict:
        """Basic Auth = base64(login:API_KEY)"""
        headers = {"Content-Type": "application/json"}
        if self.login and self.api_key:
            credentials = base64.b64encode(
                f"{self.login}:{self.api_key}".encode()
            ).decode()
            headers["Authorization"] = f"Basic {credentials}"
        return headers

    def _is_configured(self) -> bool:
        return bool(self.login and self.api_key)

    # ──────────────────────────────────────────────
    # READ – sync companies / contacts to local cache
    # ──────────────────────────────────────────────

    async def sync_companies(self, session: AsyncSession) -> List[CrmCompanyModel]:
        """GET /company → upsert into local cache."""
        if not self._is_configured():
            logger.warning("Raynet credentials not configured, skipping company sync")
            return []

        try:
            async with aiohttp.ClientSession() as http:
                async with http.get(
                    f"{self.base_url}/company",
                    headers=self._get_headers(),
                    timeout=aiohttp.ClientTimeout(total=30),
                ) as resp:
                    if resp.status != 200:
                        body = await resp.text()
                        logger.error(f"Raynet GET /company → {resp.status}: {body}")
                        return []
                    data = await resp.json()

            companies = data.get("data", [])
            synced: list[CrmCompanyModel] = []

            for item in companies:
                raynet_id = str(item.get("id", ""))
                if not raynet_id:
                    continue

                result = await session.exec(
                    select(CrmCompanyModel).where(CrmCompanyModel.raynet_id == raynet_id)
                )
                existing = result.first()

                if existing:
                    existing.name = item.get("name", existing.name)
                    existing.nip = item.get("regNumber", existing.nip)
                    existing.address = self._format_address(item)
                    session.add(existing)
                    synced.append(existing)
                else:
                    company = CrmCompanyModel(
                        raynet_id=raynet_id,
                        name=item.get("name", ""),
                        nip=item.get("regNumber"),
                        address=self._format_address(item),
                    )
                    session.add(company)
                    synced.append(company)

            await session.commit()
            logger.info(f"Synced {len(synced)} companies from Raynet")
            return synced

        except Exception as e:
            logger.error(f"Failed to sync companies: {e}")
            return []

    async def sync_contacts_for_company(
        self, session: AsyncSession, raynet_company_id: str
    ) -> List[CrmContactModel]:
        """GET /person?companyId=X → upsert contacts for one company."""
        if not self._is_configured():
            return []

        try:
            # Resolve local company
            result = await session.exec(
                select(CrmCompanyModel).where(
                    CrmCompanyModel.raynet_id == raynet_company_id
                )
            )
            local_company = result.first()
            local_company_id = local_company.id if local_company else None

            async with aiohttp.ClientSession() as http:
                async with http.get(
                    f"{self.base_url}/person",
                    params={"companyId": raynet_company_id},
                    headers=self._get_headers(),
                    timeout=aiohttp.ClientTimeout(total=30),
                ) as resp:
                    if resp.status != 200:
                        body = await resp.text()
                        logger.error(f"Raynet GET /person?companyId={raynet_company_id} → {resp.status}: {body}")
                        return []
                    data = await resp.json()

            contacts = data.get("data", [])
            synced: list[CrmContactModel] = []

            for item in contacts:
                raynet_id = str(item.get("id", ""))
                if not raynet_id:
                    continue

                result = await session.exec(
                    select(CrmContactModel).where(CrmContactModel.raynet_id == raynet_id)
                )
                existing = result.first()

                contact_info = item.get("contactInfo", {})

                if existing:
                    existing.first_name = item.get("firstName", existing.first_name)
                    existing.last_name = item.get("lastName", existing.last_name)
                    existing.phone = contact_info.get("tel1") or existing.phone
                    existing.email = contact_info.get("email") or existing.email
                    if local_company_id:
                        existing.company_id = local_company_id
                    session.add(existing)
                    synced.append(existing)
                else:
                    contact = CrmContactModel(
                        raynet_id=raynet_id,
                        company_id=local_company_id,
                        first_name=item.get("firstName"),
                        last_name=item.get("lastName"),
                        phone=contact_info.get("tel1"),
                        email=contact_info.get("email"),
                    )
                    session.add(contact)
                    synced.append(contact)

            await session.commit()
            logger.info(f"Synced {len(synced)} contacts for company {raynet_company_id}")
            return synced

        except Exception as e:
            logger.error(f"Failed to sync contacts for company {raynet_company_id}: {e}")
            return []

    async def sync_all_contacts(self, session: AsyncSession) -> List[CrmContactModel]:
        """Sync contacts for every cached company."""
        companies = await self.get_companies(session)
        all_contacts: list[CrmContactModel] = []
        for company in companies:
            contacts = await self.sync_contacts_for_company(session, company.raynet_id)
            all_contacts.extend(contacts)
        return all_contacts

    # ──────────────────────────────────────────────
    # WRITE – Opportunity / Document / Activity
    # ──────────────────────────────────────────────

    async def create_opportunity(
        self,
        *,
        name: str,
        company_raynet_id: str,
        person_raynet_id: Optional[str] = None,
        estimated_value: Optional[float] = None,
        valid_from: Optional[str] = None,
        valid_till: Optional[str] = None,
    ) -> dict:
        """POST /opportunity – create a sales opportunity in CRM."""
        if not self._is_configured():
            raise RuntimeError("Raynet credentials not configured")

        body: dict = {
            "name": name,
            "company": {"id": int(company_raynet_id)},
            "state": "OPEN",
        }
        if person_raynet_id:
            body["person"] = {"id": int(person_raynet_id)}
        if estimated_value is not None:
            body["estimatedValue"] = estimated_value
            body["currency"] = "PLN"
        if valid_from:
            body["validFrom"] = valid_from
        if valid_till:
            body["validTill"] = valid_till

        async with aiohttp.ClientSession() as http:
            async with http.post(
                f"{self.base_url}/opportunity",
                json=body,
                headers=self._get_headers(),
                timeout=aiohttp.ClientTimeout(total=30),
            ) as resp:
                resp_data = await resp.json() if resp.content_type == "application/json" else {}
                if resp.status not in (200, 201):
                    text = await resp.text() if not resp_data else str(resp_data)
                    raise RuntimeError(f"Raynet POST /opportunity → {resp.status}: {text}")
                logger.info(f"Created opportunity in Raynet: {resp_data}")
                return resp_data

    async def upload_document(
        self,
        *,
        name: str,
        opportunity_raynet_id: int,
        pdf_path: str,
    ) -> dict:
        """POST /document – attach PDF as a document to an opportunity."""
        if not self._is_configured():
            raise RuntimeError("Raynet credentials not configured")

        headers = {
            "Authorization": self._get_headers()["Authorization"],
        }

        form = aiohttp.FormData()
        form.add_field("name", name)
        form.add_field("opportunity", str(opportunity_raynet_id))
        form.add_field("type", "QUOTE")
        form.add_field(
            "file",
            open(pdf_path, "rb"),
            filename=os.path.basename(pdf_path),
            content_type="application/pdf",
        )

        async with aiohttp.ClientSession() as http:
            async with http.post(
                f"{self.base_url}/document",
                data=form,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=60),
            ) as resp:
                resp_data = await resp.json() if resp.content_type == "application/json" else {}
                if resp.status not in (200, 201):
                    text = await resp.text() if not resp_data else str(resp_data)
                    raise RuntimeError(f"Raynet POST /document → {resp.status}: {text}")
                logger.info(f"Uploaded document to Raynet: {resp_data}")
                return resp_data

    async def create_activity(
        self,
        *,
        subject: str,
        company_raynet_id: str,
        person_raynet_id: Optional[str] = None,
        opportunity_raynet_id: Optional[int] = None,
        note: str = "",
    ) -> dict:
        """POST /activity – log an email/task in CRM."""
        if not self._is_configured():
            raise RuntimeError("Raynet credentials not configured")

        body: dict = {
            "subject": subject,
            "type": "EMAIL",
            "company": {"id": int(company_raynet_id)},
            "note": note,
        }
        if person_raynet_id:
            body["person"] = {"id": int(person_raynet_id)}
        if opportunity_raynet_id:
            body["opportunity"] = {"id": opportunity_raynet_id}

        async with aiohttp.ClientSession() as http:
            async with http.post(
                f"{self.base_url}/activity",
                json=body,
                headers=self._get_headers(),
                timeout=aiohttp.ClientTimeout(total=30),
            ) as resp:
                resp_data = await resp.json() if resp.content_type == "application/json" else {}
                if resp.status not in (200, 201):
                    text = await resp.text() if not resp_data else str(resp_data)
                    raise RuntimeError(f"Raynet POST /activity → {resp.status}: {text}")
                logger.info(f"Created activity in Raynet: {resp_data}")
                return resp_data

    # ──────────────────────────────────────────────
    # Local cache query methods
    # ──────────────────────────────────────────────

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

    # ──────────────────────────────────────────────
    # Helpers
    # ──────────────────────────────────────────────

    @staticmethod
    def _format_address(company: dict) -> Optional[str]:
        addr = company.get("primaryAddress") or company.get("address") or {}
        if not addr:
            return None
        if isinstance(addr, str):
            return addr
        parts = [
            addr.get("street", ""),
            addr.get("city", ""),
            addr.get("zipCode", ""),
            addr.get("country", ""),
        ]
        return ", ".join(p for p in parts if p) or None
