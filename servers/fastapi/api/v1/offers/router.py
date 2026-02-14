from fastapi import APIRouter

from api.v1.offers.endpoints.crm import CRM_ROUTER
from api.v1.offers.endpoints.offers import OFFERS_ROUTER

API_V1_OFFERS_ROUTER = APIRouter(prefix="/api/v1")

API_V1_OFFERS_ROUTER.include_router(CRM_ROUTER)
API_V1_OFFERS_ROUTER.include_router(OFFERS_ROUTER)
