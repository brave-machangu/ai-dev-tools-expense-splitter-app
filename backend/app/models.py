"""Storage records — what a repository saves and loads.

Plain dataclasses, independent of both the HTTP schemas and any database
library, so a SQLAlchemy repository can map them to tables without touching the
service layer. Fields mirror the data model in spec §5.
"""

import datetime as dt
from dataclasses import dataclass, field
from uuid import UUID


@dataclass(slots=True)
class GroupRecord:
    id: UUID
    code: str
    name: str
    currency: str
    created_at: dt.datetime


@dataclass(slots=True)
class MemberRecord:
    id: UUID
    group_id: UUID
    name: str
    position: int
    created_at: dt.datetime


@dataclass(slots=True)
class ShareRecord:
    id: UUID
    expense_id: UUID
    member_id: UUID
    amount_cents: int


@dataclass(slots=True)
class ExpenseRecord:
    id: UUID
    group_id: UUID
    payer_member_id: UUID
    amount_cents: int
    description: str
    date: dt.date
    split_type: str
    created_at: dt.datetime
    updated_at: dt.datetime
    shares: list[ShareRecord] = field(default_factory=list)


@dataclass(slots=True)
class SettlementRecord:
    id: UUID
    group_id: UUID
    from_member_id: UUID
    to_member_id: UUID
    amount_cents: int
    date: dt.date
    created_at: dt.datetime
    updated_at: dt.datetime
