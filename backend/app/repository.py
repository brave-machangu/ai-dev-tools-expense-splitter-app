"""Storage interface and the in-memory implementation.

The service layer depends only on `Repository`. Replacing the in-memory store
with a real database means writing another class with these methods (e.g. a
SQLAlchemy one) and passing it to `create_app` — nothing else changes.
"""

import threading
from collections.abc import Iterable
from copy import deepcopy
from typing import Protocol
from uuid import UUID

from app.models import ExpenseRecord, GroupRecord, MemberRecord, SettlementRecord


class Repository(Protocol):
    """Stores and loads records. No validation or business rules live here.

    Contract for implementations:
    - Returned records are copies: mutating them has no effect until saved.
    - `list_members` is ordered by ascending position.
    - `list_expenses` and `list_settlements` are ordered newest first by
      `created_at`, ties broken by insertion order (newest first). Saving an
      existing record does not change its place.
    - `save_expense` writes the expense together with its shares, replacing any
      previous shares.
    - Deleting a group's child record that doesn't exist is a no-op.
    """

    def add_group(self, group: GroupRecord) -> None: ...

    def get_group_by_code(self, code: str) -> GroupRecord | None: ...

    def allocate_member_position(self, group_id: UUID) -> int:
        """Returns the next member position for the group. Positions are never
        handed out twice, even if the member holding one is later deleted."""
        ...

    def list_members(self, group_id: UUID) -> list[MemberRecord]: ...

    def save_member(self, member: MemberRecord) -> None: ...

    def delete_member(self, group_id: UUID, member_id: UUID) -> None: ...

    def list_expenses(self, group_id: UUID) -> list[ExpenseRecord]: ...

    def save_expense(self, expense: ExpenseRecord) -> None: ...

    def delete_expense(self, group_id: UUID, expense_id: UUID) -> None: ...

    def list_settlements(self, group_id: UUID) -> list[SettlementRecord]: ...

    def save_settlement(self, settlement: SettlementRecord) -> None: ...

    def delete_settlement(self, group_id: UUID, settlement_id: UUID) -> None: ...


class InMemoryRepository:
    """Mock database: dictionaries guarded by a lock. Data lasts as long as the
    process does."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._groups: dict[str, GroupRecord] = {}
        self._next_position: dict[UUID, int] = {}
        # group id -> record id -> record. Dicts keep insertion order.
        self._members: dict[UUID, dict[UUID, MemberRecord]] = {}
        self._expenses: dict[UUID, dict[UUID, ExpenseRecord]] = {}
        self._settlements: dict[UUID, dict[UUID, SettlementRecord]] = {}

    # --- groups ---------------------------------------------------------------

    def add_group(self, group: GroupRecord) -> None:
        with self._lock:
            self._groups[group.code] = deepcopy(group)
            self._next_position[group.id] = 0
            self._members[group.id] = {}
            self._expenses[group.id] = {}
            self._settlements[group.id] = {}

    def get_group_by_code(self, code: str) -> GroupRecord | None:
        with self._lock:
            group = self._groups.get(code)
            return deepcopy(group) if group else None

    # --- members --------------------------------------------------------------

    def allocate_member_position(self, group_id: UUID) -> int:
        with self._lock:
            position = self._next_position.get(group_id, 0)
            self._next_position[group_id] = position + 1
            return position

    def list_members(self, group_id: UUID) -> list[MemberRecord]:
        with self._lock:
            members = self._members.get(group_id, {}).values()
            return deepcopy(sorted(members, key=lambda m: m.position))

    def save_member(self, member: MemberRecord) -> None:
        with self._lock:
            self._members.setdefault(member.group_id, {})[member.id] = deepcopy(member)

    def delete_member(self, group_id: UUID, member_id: UUID) -> None:
        with self._lock:
            self._members.get(group_id, {}).pop(member_id, None)

    # --- expenses -------------------------------------------------------------

    def list_expenses(self, group_id: UUID) -> list[ExpenseRecord]:
        with self._lock:
            return deepcopy(_newest_first(self._expenses.get(group_id, {}).values()))

    def save_expense(self, expense: ExpenseRecord) -> None:
        with self._lock:
            self._expenses.setdefault(expense.group_id, {})[expense.id] = deepcopy(expense)

    def delete_expense(self, group_id: UUID, expense_id: UUID) -> None:
        with self._lock:
            self._expenses.get(group_id, {}).pop(expense_id, None)

    # --- settlements ----------------------------------------------------------

    def list_settlements(self, group_id: UUID) -> list[SettlementRecord]:
        with self._lock:
            return deepcopy(_newest_first(self._settlements.get(group_id, {}).values()))

    def save_settlement(self, settlement: SettlementRecord) -> None:
        with self._lock:
            by_id = self._settlements.setdefault(settlement.group_id, {})
            by_id[settlement.id] = deepcopy(settlement)

    def delete_settlement(self, group_id: UUID, settlement_id: UUID) -> None:
        with self._lock:
            self._settlements.get(group_id, {}).pop(settlement_id, None)


def _newest_first[T: (ExpenseRecord, SettlementRecord)](records: Iterable[T]) -> list[T]:
    # Reverse insertion order first; the stable sort then keeps the newest
    # record first among any identical timestamps.
    return sorted(reversed(list(records)), key=lambda r: r.created_at, reverse=True)
