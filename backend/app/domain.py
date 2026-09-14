"""Plain records passed between the repository, the service and the calculations.

Repositories return these rather than ORM objects, so nothing above the storage
layer depends on SQLAlchemy.
"""

import datetime as dt
from dataclasses import dataclass

MAX_MEMBERS = 8
MAX_AMOUNT_CENTS = 100_000_000  # 1,000,000.00


@dataclass(frozen=True, slots=True)
class GroupRecord:
    id: str
    code: str
    name: str
    currency: str
    created_at: dt.datetime


@dataclass(frozen=True, slots=True)
class MemberRecord:
    id: str
    group_id: str
    name: str
    position: int
    created_at: dt.datetime


@dataclass(frozen=True, slots=True)
class ShareRecord:
    id: str
    expense_id: str
    member_id: str
    amount_cents: int


@dataclass(frozen=True, slots=True)
class ExpenseRecord:
    id: str
    group_id: str
    payer_member_id: str
    amount_cents: int
    description: str
    date: dt.date
    split_type: str
    shares: tuple[ShareRecord, ...]
    created_at: dt.datetime
    updated_at: dt.datetime


@dataclass(frozen=True, slots=True)
class SettlementRecord:
    id: str
    group_id: str
    from_member_id: str
    to_member_id: str
    amount_cents: int
    date: dt.date
    created_at: dt.datetime
    updated_at: dt.datetime


@dataclass(frozen=True, slots=True)
class GroupContents:
    """Everything inside a group, in the order the snapshot lists it."""

    members: tuple[MemberRecord, ...]  # ascending position
    expenses: tuple[ExpenseRecord, ...]  # newest first; shares in ascending member position
    settlements: tuple[SettlementRecord, ...]  # newest first


@dataclass(frozen=True, slots=True)
class ExpenseData:
    """A validated expense ready to store, with its shares already computed."""

    payer_member_id: str
    amount_cents: int
    description: str
    date: dt.date
    split_type: str
    shares: tuple[tuple[str, int], ...]  # (member_id, amount_cents)


@dataclass(frozen=True, slots=True)
class SettlementData:
    from_member_id: str
    to_member_id: str
    amount_cents: int
    date: dt.date
