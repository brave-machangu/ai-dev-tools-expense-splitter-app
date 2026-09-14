"""Request and response models, mirroring components/schemas in openapi.yaml.

Request models enforce everything a single request can prove on its own (types,
ranges, lengths, formats). Rules that need stored data — such as "the payer is a
member of this group" — are checked in the service layer.
"""

import datetime as dt
from typing import Annotated, Literal, get_args
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    Strict,
    StringConstraints,
    field_validator,
    model_validator,
)

type Currency = Literal[
    "USD", "EUR", "GBP", "CHF", "CAD", "AUD", "NZD", "ZAR", "SEK", "NOK", "DKK",
    "PLN", "CZK", "MXN", "BRL", "INR", "SGD", "HKD", "THB", "TRY", "ILS",
]  # fmt: skip
SUPPORTED_CURRENCIES: tuple[str, ...] = get_args(Currency.__value__)

type SplitType = Literal["equal", "exact"]

MAX_AMOUNT_CENTS = 100_000_000  # 1,000,000.00
GROUP_CODE_PATTERN = r"^[0-9A-HJKMNP-TV-Z]{8}$"

# Strict: JSON floats, numeric strings and booleans are rejected, never coerced.
AmountCents = Annotated[int, Strict(), Field(ge=1, le=MAX_AMOUNT_CENTS)]
ShareCents = Annotated[int, Strict(), Field(ge=0, le=MAX_AMOUNT_CENTS)]

# Text is trimmed before its length is checked, so whitespace-only is rejected.
GroupName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
MemberName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
Description = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]


# ------------------------------------------------------------------ requests


class CreateGroupInput(BaseModel):
    name: GroupName
    currency: Currency


class MemberNameInput(BaseModel):
    name: MemberName


class ShareInput(BaseModel):
    member_id: UUID
    amount_cents: ShareCents


class ExpenseInput(BaseModel):
    payer_member_id: UUID
    amount_cents: AmountCents
    description: Description
    date: dt.date
    split_type: SplitType
    participant_ids: Annotated[list[UUID], Field(min_length=1, max_length=8)]
    exact_shares: Annotated[list[ShareInput], Field(min_length=1, max_length=8)] | None = None

    @field_validator("participant_ids")
    @classmethod
    def participants_are_unique(cls, value: list[UUID]) -> list[UUID]:
        if len(set(value)) != len(value):
            raise ValueError("participant_ids must not contain duplicates")
        return value

    @model_validator(mode="after")
    def exact_split_has_shares(self) -> ExpenseInput:
        if self.split_type == "exact" and self.exact_shares is None:
            raise ValueError("exact_shares is required when split_type is exact")
        return self


class SettlementInput(BaseModel):
    from_member_id: UUID
    to_member_id: UUID
    amount_cents: AmountCents
    date: dt.date


# ----------------------------------------------------------------- responses


class ResponseModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class CreateGroupResult(ResponseModel):
    code: str


class Group(ResponseModel):
    id: UUID
    code: str
    name: str
    currency: str
    created_at: dt.datetime


class Member(ResponseModel):
    id: UUID
    group_id: UUID
    name: str
    position: int
    created_at: dt.datetime


class ExpenseShare(ResponseModel):
    id: UUID
    expense_id: UUID
    member_id: UUID
    amount_cents: int


class Expense(ResponseModel):
    id: UUID
    group_id: UUID
    payer_member_id: UUID
    amount_cents: int
    description: str
    date: dt.date
    split_type: SplitType
    shares: list[ExpenseShare]
    created_at: dt.datetime
    updated_at: dt.datetime


class Settlement(ResponseModel):
    id: UUID
    group_id: UUID
    from_member_id: UUID
    to_member_id: UUID
    amount_cents: int
    date: dt.date
    created_at: dt.datetime
    updated_at: dt.datetime


class Balance(ResponseModel):
    member_id: UUID
    net_cents: int


class Transfer(ResponseModel):
    from_member_id: UUID
    to_member_id: UUID
    amount_cents: int


class GroupSnapshot(ResponseModel):
    group: Group
    members: list[Member]
    expenses: list[Expense]
    settlements: list[Settlement]
    balances: list[Balance]
    suggested_transfers: list[Transfer]
    pairwise: list[Transfer]


class ErrorResponse(BaseModel):
    detail: str


# ------------------------------------------------------------------- service


class ServiceInfo(BaseModel):
    name: str
    version: str
    docs: str
    openapi: str
    health: str


class HealthStatus(BaseModel):
    status: Literal["ok"]
