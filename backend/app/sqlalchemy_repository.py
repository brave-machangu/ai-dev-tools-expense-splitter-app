"""Repository implementation on SQLAlchemy, for any database it supports."""

from sqlalchemy import Engine, delete, exists, or_, select
from sqlalchemy.orm import selectinload, sessionmaker

from app.domain import (
    ExpenseData,
    ExpenseRecord,
    GroupContents,
    GroupRecord,
    MemberRecord,
    SettlementData,
    SettlementRecord,
    ShareRecord,
)
from app.models import (
    ExpenseModel,
    ExpenseShareModel,
    GroupModel,
    MemberModel,
    SettlementModel,
    utc_now,
)


class SqlAlchemyRepository:
    def __init__(self, engine: Engine) -> None:
        self._session = sessionmaker(engine, expire_on_commit=False)

    # ------------------------------------------------------------------ groups

    def code_exists(self, code: str) -> bool:
        with self._session() as session:
            return bool(session.scalar(select(exists().where(GroupModel.code == code))))

    def create_group(self, *, code: str, name: str, currency: str) -> GroupRecord:
        with self._session.begin() as session:
            group = GroupModel(code=code, name=name, currency=currency)
            session.add(group)
            session.flush()
            return _group_record(group)

    def get_group_by_code(self, code: str) -> GroupRecord | None:
        with self._session() as session:
            group = session.scalar(select(GroupModel).where(GroupModel.code == code))
            return None if group is None else _group_record(group)

    def load_group_contents(self, group_id: str) -> GroupContents:
        with self._session() as session:
            members = [_member_record(m) for m in session.scalars(_members_query(group_id))]
            positions = {m.id: m.position for m in members}
            expenses = session.scalars(
                select(ExpenseModel)
                .where(ExpenseModel.group_id == group_id)
                .options(selectinload(ExpenseModel.shares))
                .order_by(ExpenseModel.created_at.desc(), ExpenseModel.id)
            )
            settlements = session.scalars(
                select(SettlementModel)
                .where(SettlementModel.group_id == group_id)
                .order_by(SettlementModel.created_at.desc(), SettlementModel.id)
            )
            return GroupContents(
                members=tuple(members),
                expenses=tuple(_expense_record(e, positions) for e in expenses),
                settlements=tuple(_settlement_record(s) for s in settlements),
            )

    # ----------------------------------------------------------------- members

    def list_members(self, group_id: str) -> list[MemberRecord]:
        with self._session() as session:
            return [_member_record(m) for m in session.scalars(_members_query(group_id))]

    def add_member(self, group_id: str, name: str) -> MemberRecord:
        with self._session.begin() as session:
            # FOR UPDATE (where supported) stops two concurrent adds taking the same position.
            group = session.get_one(GroupModel, group_id, with_for_update=True)
            member = MemberModel(group_id=group_id, name=name, position=group.next_member_position)
            group.next_member_position += 1
            session.add(member)
            session.flush()
            return _member_record(member)

    def rename_member(self, member_id: str, name: str) -> None:
        with self._session.begin() as session:
            session.get_one(MemberModel, member_id).name = name

    def member_is_referenced(self, member_id: str) -> bool:
        query = select(
            or_(
                exists().where(ExpenseModel.payer_member_id == member_id),
                exists().where(ExpenseShareModel.member_id == member_id),
                exists().where(
                    or_(
                        SettlementModel.from_member_id == member_id,
                        SettlementModel.to_member_id == member_id,
                    )
                ),
            )
        )
        with self._session() as session:
            return bool(session.scalar(query))

    def delete_member(self, member_id: str) -> None:
        with self._session.begin() as session:
            session.execute(delete(MemberModel).where(MemberModel.id == member_id))

    # ---------------------------------------------------------------- expenses

    def expense_exists(self, group_id: str, expense_id: str) -> bool:
        query = select(
            exists().where(ExpenseModel.id == expense_id, ExpenseModel.group_id == group_id)
        )
        with self._session() as session:
            return bool(session.scalar(query))

    def create_expense(self, group_id: str, data: ExpenseData) -> None:
        now = utc_now()
        with self._session.begin() as session:
            expense = ExpenseModel(group_id=group_id, created_at=now, updated_at=now)
            _apply_expense(expense, data)
            expense.shares = _share_models(data)
            session.add(expense)

    def update_expense(self, expense_id: str, data: ExpenseData) -> None:
        with self._session.begin() as session:
            expense = session.get_one(ExpenseModel, expense_id)
            _apply_expense(expense, data)
            expense.updated_at = utc_now()
            # Delete the old rows before inserting the new ones: a member who stays
            # in the split would otherwise briefly have two rows for this expense.
            expense.shares.clear()
            session.flush()
            expense.shares.extend(_share_models(data))

    def delete_expense(self, expense_id: str) -> None:
        with self._session.begin() as session:
            # Share rows go with it through ON DELETE CASCADE.
            session.execute(delete(ExpenseModel).where(ExpenseModel.id == expense_id))

    # ------------------------------------------------------------- settlements

    def settlement_exists(self, group_id: str, settlement_id: str) -> bool:
        query = select(
            exists().where(
                SettlementModel.id == settlement_id, SettlementModel.group_id == group_id
            )
        )
        with self._session() as session:
            return bool(session.scalar(query))

    def create_settlement(self, group_id: str, data: SettlementData) -> None:
        now = utc_now()
        with self._session.begin() as session:
            settlement = SettlementModel(group_id=group_id, created_at=now, updated_at=now)
            _apply_settlement(settlement, data)
            session.add(settlement)

    def update_settlement(self, settlement_id: str, data: SettlementData) -> None:
        with self._session.begin() as session:
            settlement = session.get_one(SettlementModel, settlement_id)
            _apply_settlement(settlement, data)
            settlement.updated_at = utc_now()

    def delete_settlement(self, settlement_id: str) -> None:
        with self._session.begin() as session:
            session.execute(delete(SettlementModel).where(SettlementModel.id == settlement_id))


# ---------------------------------------------------------------------------
# Row <-> record mapping
# ---------------------------------------------------------------------------


def _members_query(group_id: str):  # noqa: ANN202
    return select(MemberModel).where(MemberModel.group_id == group_id).order_by(MemberModel.position)


def _apply_expense(expense: ExpenseModel, data: ExpenseData) -> None:
    expense.payer_member_id = data.payer_member_id
    expense.amount_cents = data.amount_cents
    expense.description = data.description
    expense.date = data.date
    expense.split_type = data.split_type


def _share_models(data: ExpenseData) -> list[ExpenseShareModel]:
    return [
        ExpenseShareModel(member_id=member_id, amount_cents=amount_cents)
        for member_id, amount_cents in data.shares
    ]


def _apply_settlement(settlement: SettlementModel, data: SettlementData) -> None:
    settlement.from_member_id = data.from_member_id
    settlement.to_member_id = data.to_member_id
    settlement.amount_cents = data.amount_cents
    settlement.date = data.date


def _group_record(group: GroupModel) -> GroupRecord:
    return GroupRecord(
        id=group.id,
        code=group.code,
        name=group.name,
        currency=group.currency,
        created_at=group.created_at,
    )


def _member_record(member: MemberModel) -> MemberRecord:
    return MemberRecord(
        id=member.id,
        group_id=member.group_id,
        name=member.name,
        position=member.position,
        created_at=member.created_at,
    )


def _expense_record(expense: ExpenseModel, positions: dict[str, int]) -> ExpenseRecord:
    shares = sorted(expense.shares, key=lambda s: positions.get(s.member_id, len(positions)))
    return ExpenseRecord(
        id=expense.id,
        group_id=expense.group_id,
        payer_member_id=expense.payer_member_id,
        amount_cents=expense.amount_cents,
        description=expense.description,
        date=expense.date,
        split_type=expense.split_type,
        shares=tuple(
            ShareRecord(
                id=s.id, expense_id=s.expense_id, member_id=s.member_id, amount_cents=s.amount_cents
            )
            for s in shares
        ),
        created_at=expense.created_at,
        updated_at=expense.updated_at,
    )


def _settlement_record(settlement: SettlementModel) -> SettlementRecord:
    return SettlementRecord(
        id=settlement.id,
        group_id=settlement.group_id,
        from_member_id=settlement.from_member_id,
        to_member_id=settlement.to_member_id,
        amount_cents=settlement.amount_cents,
        date=settlement.date,
        created_at=settlement.created_at,
        updated_at=settlement.updated_at,
    )
