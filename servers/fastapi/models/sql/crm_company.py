import uuid
from datetime import datetime
from sqlalchemy import Column, DateTime, String
from sqlmodel import Field, SQLModel
from utils.datetime_utils import get_current_utc_datetime


class CrmCompanyModel(SQLModel, table=True):
    __tablename__ = "crm_companies"

    id: uuid.UUID = Field(primary_key=True, default_factory=uuid.uuid4)
    raynet_id: str = Field(sa_column=Column(String, unique=True, nullable=False))
    name: str
    nip: str | None = None
    address: str | None = None
    created_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True), nullable=False, default=get_current_utc_datetime
        ),
    )
