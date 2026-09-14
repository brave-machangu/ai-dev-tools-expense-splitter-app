"""The Repository protocol implemented with SQLAlchemy, for any database it supports."""

from uuid import UUID

from sqlalchemy import Engine, delete, select, update
from sqlalchemy.orm import InstrumentedAttribute, Session, selectinload, sessionmaker

from app.models import ExpenseRecord, GroupRecord, MemberRecord, SettlementRecord, ShareRecord
from app.tables import ExpenseRow, ExpenseShareRow, GroupRow, MemberRow, SettlementRow


class SqlAlchemyRepository:
    """Each method runs in its own transaction and commits before returning.

    Loaded records are built fresh from rows, so callers may mutate them; nothing
    changes in the database until the record is saved.
    """

    def __init__(self, engine: Engine) -> None:
        self._sessions = sessionmaker(engine)

    # --- groups ---------------------------------------------------------------

    def add_group(self, group: GroupRecord) -> None:
        with self._sessions.begin() as session:
            session.add(
                GroupRow(
                    id=group.id,
                    code=group.code,
                    name=group.name,
                    currency=group.currency,
                    created_at=group.created_at,
                )
            )

    def get_group_by_code(self, code: str) -> GroupRecord | None:
        with self._sessions() as session:
            row = session.scalar(select(GroupRow).where(GroupRow.code == code))
            if row is None:
                return None
            return GroupRecord(
                id=row.id,
                code=row.code,
                name=row.name,
                currency=row.currency,
                created_at=row.created_at,
            )

    # --- members --------------------------------------------------------------

    def allocate_member_position(self, group_id: UUID) -> int:
        with self._sessions.begin() as session:
            return _take_next(session, group_id, GroupRow.next_member_position)

    def list_members(self, group_id: UUID) -> list[MemberRecord]:
        with self._sessions() as session:
            rows = session.scalars(
                select(MemberRow).where(MemberRow.group_id == group_id).order_by(MemberRow.position)
            )
            return [
                MemberRecord(
                    id=row.id,
                    group_id=row.group_id,
                    name=row.name,
                    position=row.position,
                    created_at=row.created_at,
                )
                for row in rows
            ]

    def save_member(self, member: MemberRecord) -> None:
        with self._sessions.begin() as session:
            row = session.get(MemberRow, member.id)
            if row is None:
                row = MemberRow(id=member.id, group_id=member.group_id)
                session.add(row)
            row.name = member.name
            row.position = member.position
            row.created_at = member.created_at

    def delete_member(self, group_id: UUID, member_id: UUID) -> None:
        with self._sessions.begin() as session:
            session.execute(
                delete(MemberRow).where(MemberRow.group_id == group_id, MemberRow.id == member_id)
            )

    # --- expenses -------------------------------------------------------------

    def list_expenses(self, group_id: UUID) -> list[ExpenseRecord]:
        with self._sessions() as session:
            positions = {
                member_id: position
                for member_id, position in session.execute(
                    select(MemberRow.id, MemberRow.position).where(MemberRow.group_id == group_id)
                )
            }
            rows = session.scalars(
                select(ExpenseRow)
                .where(ExpenseRow.group_id == group_id)
                .options(selectinload(ExpenseRow.shares))
                .order_by(ExpenseRow.created_at.desc(), ExpenseRow.sort_seq.desc())
            )
            return [_expense_record(row, positions) for row in rows]

    def save_expense(self, expense: ExpenseRecord) -> None:
        with self._sessions.begin() as session:
            row = session.get(ExpenseRow, expense.id)
            if row is None:
                sort_seq = _take_next(session, expense.group_id, GroupRow.next_sort_seq)
                row = ExpenseRow(id=expense.id, group_id=expense.group_id, sort_seq=sort_seq)
                session.add(row)
            else:
                # Delete the old share rows before inserting the new ones: a member
                # who stays in the split would otherwise briefly have two rows.
                row.shares.clear()
                session.flush()
            row.payer_member_id = expense.payer_member_id
            row.amount_cents = expense.amount_cents
            row.description = expense.description
            row.date = expense.date
            row.split_type = expense.split_type
            row.created_at = expense.created_at
            row.updated_at = expense.updated_at
            row.shares.extend(
                ExpenseShareRow(
                    id=share.id, member_id=share.member_id, amount_cents=share.amount_cents
                )
                for share in expense.shares
            )

    def delete_expense(self, group_id: UUID, expense_id: UUID) -> None:
        with self._sessions.begin() as session:
            # Share rows go with it through ON DELETE CASCADE.
            session.execute(
                delete(ExpenseRow).where(
                    ExpenseRow.group_id == group_id, ExpenseRow.id == expense_id
                )
            )

    # --- settlements ----------------------------------------------------------

    def list_settlements(self, group_id: UUID) -> list[SettlementRecord]:
        with self._sessions() as session:
            rows = session.scalars(
                select(SettlementRow)
                .where(SettlementRow.group_id == group_id)
                .order_by(SettlementRow.created_at.desc(), SettlementRow.sort_seq.desc())
            )
            return [
                SettlementRecord(
                    id=row.id,
                    group_id=row.group_id,
                    from_member_id=row.from_member_id,
                    to_member_id=row.to_member_id,
                    amount_cents=row.amount_cents,
                    date=row.date,
                    created_at=row.created_at,
                    updated_at=row.updated_at,
                )
                for row in rows
            ]

    def save_settlement(self, settlement: SettlementRecord) -> None:
        with self._sessions.begin() as session:
            row = session.get(SettlementRow, settlement.id)
            if row is None:
                sort_seq = _take_next(session, settlement.group_id, GroupRow.next_sort_seq)
                row = SettlementRow(
                    id=settlement.id, group_id=settlement.group_id, sort_seq=sort_seq
                )
                session.add(row)
            row.from_member_id = settlement.from_member_id
            row.to_member_id = settlement.to_member_id
            row.amount_cents = settlement.amount_cents
            row.date = settlement.date
            row.created_at = settlement.created_at
            row.updated_at = settlement.updated_at

    def delete_settlement(self, group_id: UUID, settlement_id: UUID) -> None:
        with self._sessions.begin() as session:
            session.execute(
                delete(SettlementRow).where(
                    SettlementRow.group_id == group_id, SettlementRow.id == settlement_id
                )
            )


def _take_next(session: Session, group_id: UUID, counter: InstrumentedAttribute[int]) -> int:
    """Returns one of the group's counters and increments it.

    The UPDATE runs before the read, so the transaction holds the write lock (a
    row lock on PostgreSQL) when it reads, and concurrent callers never get the
    same number.
    """
    session.execute(update(GroupRow).where(GroupRow.id == group_id).values({counter: counter + 1}))
    return session.execute(select(counter).where(GroupRow.id == group_id)).scalar_one() - 1


def _expense_record(row: ExpenseRow, positions: dict[UUID, int]) -> ExpenseRecord:
    # Shares are listed in ascending member position (openapi Expense.shares).
    shares = sorted(row.shares, key=lambda share: positions.get(share.member_id, len(positions)))
    return ExpenseRecord(
        id=row.id,
        group_id=row.group_id,
        payer_member_id=row.payer_member_id,
        amount_cents=row.amount_cents,
        description=row.description,
        date=row.date,
        split_type=row.split_type,
        created_at=row.created_at,
        updated_at=row.updated_at,
        shares=[
            ShareRecord(
                id=share.id,
                expense_id=share.expense_id,
                member_id=share.member_id,
                amount_cents=share.amount_cents,
            )
            for share in shares
        ],
    )
