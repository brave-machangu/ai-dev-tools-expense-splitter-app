"""Business rules for groups, members, expenses and settlements (spec §4–§7).

The service checks what request schemas can't (rules that need stored data),
computes shares and balances, and reaches storage only through `Repository`.
"""

import secrets
from collections.abc import Callable, Iterable
from datetime import UTC, datetime
from typing import Protocol
from uuid import UUID, uuid4

from app import calc
from app.errors import ConflictError, NotFoundError, RuleViolationError
from app.models import ExpenseRecord, GroupRecord, MemberRecord, SettlementRecord, ShareRecord
from app.repository import Repository
from app.schemas import (
    Balance,
    CreateGroupInput,
    Expense,
    ExpenseInput,
    Group,
    GroupSnapshot,
    Member,
    MemberNameInput,
    Settlement,
    SettlementInput,
    Transfer,
)

CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"  # Crockford base32: no I, L, O, U
CODE_LENGTH = 8
MAX_MEMBERS = 8


def generate_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))


def utc_now() -> datetime:
    return datetime.now(UTC)


class _HasId(Protocol):
    id: UUID


class GroupService:
    def __init__(
        self,
        repository: Repository,
        *,
        clock: Callable[[], datetime] = utc_now,
        new_code: Callable[[], str] = generate_code,
    ) -> None:
        self._repo = repository
        self._clock = clock
        self._new_code = new_code

    # --- groups ---------------------------------------------------------------

    def create_group(self, data: CreateGroupInput) -> str:
        for _ in range(20):
            code = self._new_code()
            if self._repo.get_group_by_code(code) is None:
                break
        else:
            raise RuntimeError("Could not generate a unique group code")

        self._repo.add_group(
            GroupRecord(
                id=uuid4(),
                code=code,
                name=data.name,
                currency=data.currency,
                created_at=self._clock(),
            )
        )
        return code

    def get_snapshot(self, code: str) -> GroupSnapshot:
        return self._snapshot(self._group(code))

    # --- members --------------------------------------------------------------

    def add_member(self, code: str, data: MemberNameInput) -> GroupSnapshot:
        group = self._group(code)
        if len(self._repo.list_members(group.id)) >= MAX_MEMBERS:
            raise RuleViolationError("A group can have at most 8 people")
        self._repo.save_member(
            MemberRecord(
                id=uuid4(),
                group_id=group.id,
                name=data.name,
                position=self._repo.allocate_member_position(group.id),
                created_at=self._clock(),
            )
        )
        return self._snapshot(group)

    def rename_member(self, code: str, member_id: UUID, data: MemberNameInput) -> GroupSnapshot:
        group = self._group(code)
        member = _find(self._repo.list_members(group.id), member_id, "Member not found")
        member.name = data.name
        self._repo.save_member(member)
        return self._snapshot(group)

    def delete_member(self, code: str, member_id: UUID) -> GroupSnapshot:
        group = self._group(code)
        _find(self._repo.list_members(group.id), member_id, "Member not found")
        expenses = self._repo.list_expenses(group.id)
        settlements = self._repo.list_settlements(group.id)
        if _is_referenced(member_id, expenses, settlements):
            raise ConflictError(
                "This person is part of an expense or payment, so they can't be removed."
            )
        self._repo.delete_member(group.id, member_id)
        return self._snapshot(group)

    # --- expenses -------------------------------------------------------------

    def create_expense(self, code: str, data: ExpenseInput) -> GroupSnapshot:
        group = self._group(code)
        shares = _resolve_shares(data, self._repo.list_members(group.id))
        now = self._clock()
        expense_id = uuid4()
        self._repo.save_expense(
            ExpenseRecord(
                id=expense_id,
                group_id=group.id,
                payer_member_id=data.payer_member_id,
                amount_cents=data.amount_cents,
                description=data.description,
                date=data.date,
                split_type=data.split_type,
                created_at=now,
                updated_at=now,
                shares=_share_records(expense_id, shares),
            )
        )
        return self._snapshot(group)

    def update_expense(self, code: str, expense_id: UUID, data: ExpenseInput) -> GroupSnapshot:
        group = self._group(code)
        expense = _find(self._repo.list_expenses(group.id), expense_id, "Expense not found")
        shares = _resolve_shares(data, self._repo.list_members(group.id))

        expense.payer_member_id = data.payer_member_id
        expense.amount_cents = data.amount_cents
        expense.description = data.description
        expense.date = data.date
        expense.split_type = data.split_type
        expense.updated_at = self._clock()
        expense.shares = _share_records(expense.id, shares)
        self._repo.save_expense(expense)
        return self._snapshot(group)

    def delete_expense(self, code: str, expense_id: UUID) -> GroupSnapshot:
        group = self._group(code)
        _find(self._repo.list_expenses(group.id), expense_id, "Expense not found")
        self._repo.delete_expense(group.id, expense_id)
        return self._snapshot(group)

    # --- settlements ----------------------------------------------------------

    def create_settlement(self, code: str, data: SettlementInput) -> GroupSnapshot:
        group = self._group(code)
        _check_settlement(data, self._repo.list_members(group.id))
        now = self._clock()
        self._repo.save_settlement(
            SettlementRecord(
                id=uuid4(),
                group_id=group.id,
                from_member_id=data.from_member_id,
                to_member_id=data.to_member_id,
                amount_cents=data.amount_cents,
                date=data.date,
                created_at=now,
                updated_at=now,
            )
        )
        return self._snapshot(group)

    def update_settlement(
        self, code: str, settlement_id: UUID, data: SettlementInput
    ) -> GroupSnapshot:
        group = self._group(code)
        settlement = _find(
            self._repo.list_settlements(group.id), settlement_id, "Payment not found"
        )
        _check_settlement(data, self._repo.list_members(group.id))

        settlement.from_member_id = data.from_member_id
        settlement.to_member_id = data.to_member_id
        settlement.amount_cents = data.amount_cents
        settlement.date = data.date
        settlement.updated_at = self._clock()
        self._repo.save_settlement(settlement)
        return self._snapshot(group)

    def delete_settlement(self, code: str, settlement_id: UUID) -> GroupSnapshot:
        group = self._group(code)
        _find(self._repo.list_settlements(group.id), settlement_id, "Payment not found")
        self._repo.delete_settlement(group.id, settlement_id)
        return self._snapshot(group)

    # --- helpers --------------------------------------------------------------

    def _group(self, code: str) -> GroupRecord:
        group = self._repo.get_group_by_code(code)
        if group is None:
            raise NotFoundError("Group not found")
        return group

    def _snapshot(self, group: GroupRecord) -> GroupSnapshot:
        members = self._repo.list_members(group.id)
        expenses = self._repo.list_expenses(group.id)
        settlements = self._repo.list_settlements(group.id)
        balances = calc.compute_balances(members, expenses, settlements)

        return GroupSnapshot(
            group=Group.model_validate(group),
            members=[Member.model_validate(m) for m in members],
            expenses=[Expense.model_validate(e) for e in expenses],
            settlements=[Settlement.model_validate(s) for s in settlements],
            balances=[Balance(member_id=b.member_id, net_cents=b.net_cents) for b in balances],
            suggested_transfers=_transfers(calc.simplify_transfers(balances)),
            pairwise=_transfers(calc.compute_pairwise(members, expenses, settlements)),
        )


def _find[T: _HasId](records: Iterable[T], record_id: UUID, message: str) -> T:
    for record in records:
        if record.id == record_id:
            return record
    raise NotFoundError(message)


def _resolve_shares(data: ExpenseInput, members: list[MemberRecord]) -> list[tuple[UUID, int]]:
    """The share rows to store, in position order (spec §5, §7.1)."""
    by_id = {m.id: m for m in members}
    if data.payer_member_id not in by_id:
        raise RuleViolationError("The payer is not a member of this group")
    if any(member_id not in by_id for member_id in data.participant_ids):
        raise RuleViolationError("Every participant must be a member of this group")

    if data.split_type == "equal":
        participants = [calc.Participant(m, by_id[m].position) for m in data.participant_ids]
        return [
            (UUID(str(m)), amount)
            for m, amount in calc.split_equal(data.amount_cents, participants)
        ]

    exact = data.exact_shares or []
    exact_ids = [share.member_id for share in exact]
    if len(set(exact_ids)) != len(exact_ids) or set(exact_ids) != set(data.participant_ids):
        raise RuleViolationError("Exact amounts must list each participant exactly once")
    if sum(share.amount_cents for share in exact) != data.amount_cents:
        raise RuleViolationError("Exact amounts must add up to the total")
    ordered = sorted(exact, key=lambda share: by_id[share.member_id].position)
    return [(share.member_id, share.amount_cents) for share in ordered]


def _share_records(expense_id: UUID, shares: list[tuple[UUID, int]]) -> list[ShareRecord]:
    return [
        ShareRecord(id=uuid4(), expense_id=expense_id, member_id=member_id, amount_cents=amount)
        for member_id, amount in shares
    ]


def _check_settlement(data: SettlementInput, members: list[MemberRecord]) -> None:
    if data.from_member_id == data.to_member_id:
        raise RuleViolationError("A payment needs two different people")
    member_ids = {m.id for m in members}
    if data.from_member_id not in member_ids or data.to_member_id not in member_ids:
        raise RuleViolationError("Both people must be members of this group")


def _is_referenced(
    member_id: UUID, expenses: list[ExpenseRecord], settlements: list[SettlementRecord]
) -> bool:
    return any(
        e.payer_member_id == member_id or any(s.member_id == member_id for s in e.shares)
        for e in expenses
    ) or any(member_id in (s.from_member_id, s.to_member_id) for s in settlements)


def _transfers(transfers: list[calc.Transfer]) -> list[Transfer]:
    return [
        Transfer(
            from_member_id=t.from_member_id,
            to_member_id=t.to_member_id,
            amount_cents=t.amount_cents,
        )
        for t in transfers
    ]
