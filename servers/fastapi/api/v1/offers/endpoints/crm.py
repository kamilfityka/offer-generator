from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from services.database import get_async_session
from services.raynet_crm_service import RaynetCrmService

CRM_ROUTER = APIRouter(prefix="/crm", tags=["CRM"])

crm_service = RaynetCrmService()


@CRM_ROUTER.get("/companies")
async def get_companies(session: AsyncSession = Depends(get_async_session)):
    """Get all companies from local CRM cache."""
    companies = await crm_service.get_companies(session)
    return [
        {
            "id": str(c.id),
            "raynet_id": c.raynet_id,
            "name": c.name,
            "nip": c.nip,
            "address": c.address,
        }
        for c in companies
    ]


@CRM_ROUTER.get("/companies/{company_id}/contacts")
async def get_company_contacts(
    company_id: str,
    session: AsyncSession = Depends(get_async_session),
):
    """Get contacts for a specific company."""
    contacts = await crm_service.get_contacts_for_company(session, company_id)
    return [
        {
            "id": str(c.id),
            "raynet_id": c.raynet_id,
            "first_name": c.first_name,
            "last_name": c.last_name,
            "phone": c.phone,
            "email": c.email,
        }
        for c in contacts
    ]


@CRM_ROUTER.post("/sync")
async def sync_crm_data(session: AsyncSession = Depends(get_async_session)):
    """Trigger manual sync from Raynet CRM."""
    companies = await crm_service.sync_companies(session)
    contacts = await crm_service.sync_contacts(session)
    return {
        "synced_companies": len(companies),
        "synced_contacts": len(contacts),
    }
