import uuid
from datetime import datetime
from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlmodel import Field, SQLModel
from utils.datetime_utils import get_current_utc_datetime


class CrmContactModel(SQLModel, table=True):
    __tablename__ = "crm_contacts"

    id: uuid.UUID = Field(primary_key=True, default_factory=uuid.uuid4)
    raynet_id: str = Field(sa_column=Column(String, unique=True, nullable=False))
    company_id: uuid.UUID = Field(
        sa_column=Column(ForeignKey("crm_companies.id"), nullable=True)
    )
    first_name: str | None = None
    last_name: str | None = None
    phone: str | None = None
    email: str | None = None
    created_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True), nullable=False, default=get_current_utc_datetime
        ),
    )
