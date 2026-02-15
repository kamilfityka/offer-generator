import uuid
from datetime import date, datetime
from typing import Optional
from sqlalchemy import Column, Date, DateTime, String, Text
from sqlmodel import Field, SQLModel
from utils.datetime_utils import get_current_utc_datetime


class OfferModel(SQLModel, table=True):
    __tablename__ = "offers"

    id: uuid.UUID = Field(primary_key=True, default_factory=uuid.uuid4)

    # Raynet CRM references (needed for write-back)
    raynet_company_id: Optional[str] = Field(
        sa_column=Column(String, nullable=True), default=None
    )
    raynet_contact_id: Optional[str] = Field(
        sa_column=Column(String, nullable=True), default=None
    )
    raynet_opportunity_id: Optional[int] = Field(default=None)

    # Client snapshot (frozen at offer creation time)
    company_name: str
    company_nip: Optional[str] = None
    company_address: Optional[str] = None
    contact_first_name: Optional[str] = None
    contact_last_name: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None

    # Offer data
    title: str
    valid_until: Optional[date] = Field(
        sa_column=Column(Date, nullable=True), default=None
    )
    description_file_path: Optional[str] = Field(
        sa_column=Column(Text, nullable=True), default=None
    )

    status: str = Field(
        sa_column=Column(
            String,
            nullable=False,
            default="draft",
        ),
        default="draft",
    )

    document_path: Optional[str] = Field(
        sa_column=Column(Text, nullable=True), default=None
    )

    ai_generated_content: Optional[str] = Field(
        sa_column=Column(Text, nullable=True), default=None
    )

    created_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True), nullable=False, default=get_current_utc_datetime
        ),
    )
    updated_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
            default=get_current_utc_datetime,
            onupdate=get_current_utc_datetime,
        ),
    )
