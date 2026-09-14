"""SQLAlchemy tables for the data model in _docs/specs.md §5.

Only portable column types (String, Integer, Date, DateTime) are used, so the
same tables work on SQLite and PostgreSQL. Nothing outside the SQLAlchemy
repository sees these classes: it maps them to the records in app/models.py.
"""

import datetime as dt
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    Dialect,
    ForeignKey,
    Integer,
    MetaData,
    String,
    TypeDecorator,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class UUIDString(TypeDecorator[UUID]):
    """A UUID stored as its 36-character string and loaded back as a UUID."""

    impl = String(36)
    cache_ok = True

    def process_bind_param(self, value: UUID | str | None, dialect: Dialect) -> str | None:
        if value is None:
            return None
        return str(value if isinstance(value, UUID) else UUID(value))

    def process_result_value(self, value: str | None, dialect: Dialect) -> UUID | None:
        return None if value is None else UUID(value)


class UTCDateTime(TypeDecorator[dt.datetime]):
    """Stores UTC as a plain DATETIME and loads timezone-aware UTC values.

    SQLite has no timezone support, so every database stores naive UTC and the
    column behaves the same everywhere.
    """

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: dt.datetime | None, dialect: Dialect) -> dt.datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            raise ValueError("Timestamps must be timezone-aware")
        return value.astimezone(dt.UTC).replace(tzinfo=None)

    def process_result_value(
        self, value: dt.datetime | None, dialect: Dialect
    ) -> dt.datetime | None:
        return None if value is None else value.replace(tzinfo=dt.UTC)


class Base(DeclarativeBase):
    # Deterministic constraint names, so future migrations can refer to them.
    metadata = MetaData(
        naming_convention={
            "pk": "pk_%(table_name)s",
            "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
            "uq": "uq_%(table_name)s_%(column_0_N_name)s",
            "ck": "ck_%(table_name)s_%(constraint_name)s",
            "ix": "ix_%(table_name)s_%(column_0_N_name)s",
        }
    )


class GroupRow(Base):
    __tablename__ = "group"

    id: Mapped[UUID] = mapped_column(UUIDString, primary_key=True)
    code: Mapped[str] = mapped_column(String(8), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(60))
    currency: Mapped[str] = mapped_column(String(3))
    created_at: Mapped[dt.datetime] = mapped_column(UTCDateTime)
    # Counters not in spec §5. Positions are never reused (§F2), so the next one
    # can't be derived from the members that still exist.
    next_member_position: Mapped[int] = mapped_column(Integer, default=0)
    # Hands out sort_seq for expenses and settlements (see below).
    next_sort_seq: Mapped[int] = mapped_column(Integer, default=0)


class MemberRow(Base):
    __tablename__ = "member"
    __table_args__ = (UniqueConstraint("group_id", "position"),)

    id: Mapped[UUID] = mapped_column(UUIDString, primary_key=True)
    group_id: Mapped[UUID] = mapped_column(
        UUIDString, ForeignKey("group.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(40))
    position: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[dt.datetime] = mapped_column(UTCDateTime)


class ExpenseShareRow(Base):
    __tablename__ = "expense_share"
    __table_args__ = (
        UniqueConstraint("expense_id", "member_id"),
        CheckConstraint("amount_cents >= 0", name="amount_not_negative"),
    )

    id: Mapped[UUID] = mapped_column(UUIDString, primary_key=True)
    expense_id: Mapped[UUID] = mapped_column(
        UUIDString, ForeignKey("expense.id", ondelete="CASCADE"), index=True
    )
    member_id: Mapped[UUID] = mapped_column(UUIDString, ForeignKey("member.id"), index=True)
    amount_cents: Mapped[int] = mapped_column(Integer)


class ExpenseRow(Base):
    __tablename__ = "expense"
    __table_args__ = (CheckConstraint("amount_cents > 0", name="amount_positive"),)

    id: Mapped[UUID] = mapped_column(UUIDString, primary_key=True)
    group_id: Mapped[UUID] = mapped_column(
        UUIDString, ForeignKey("group.id", ondelete="CASCADE"), index=True
    )
    payer_member_id: Mapped[UUID] = mapped_column(UUIDString, ForeignKey("member.id"), index=True)
    amount_cents: Mapped[int] = mapped_column(Integer)
    description: Mapped[str] = mapped_column(String(120))
    date: Mapped[dt.date] = mapped_column(Date)
    split_type: Mapped[str] = mapped_column(String(10))
    created_at: Mapped[dt.datetime] = mapped_column(UTCDateTime)
    updated_at: Mapped[dt.datetime] = mapped_column(UTCDateTime)
    # Insertion order within the group. Breaks created_at ties, which happen when
    # requests arrive within the clock's resolution; random UUIDs can't do that.
    sort_seq: Mapped[int] = mapped_column(Integer)

    # The database deletes share rows with their expense (ON DELETE CASCADE);
    # delete-orphan removes rows dropped from the collection on update.
    shares: Mapped[list[ExpenseShareRow]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True
    )


class SettlementRow(Base):
    __tablename__ = "settlement"
    __table_args__ = (
        CheckConstraint("amount_cents > 0", name="amount_positive"),
        CheckConstraint("from_member_id <> to_member_id", name="different_members"),
    )

    id: Mapped[UUID] = mapped_column(UUIDString, primary_key=True)
    group_id: Mapped[UUID] = mapped_column(
        UUIDString, ForeignKey("group.id", ondelete="CASCADE"), index=True
    )
    from_member_id: Mapped[UUID] = mapped_column(UUIDString, ForeignKey("member.id"), index=True)
    to_member_id: Mapped[UUID] = mapped_column(UUIDString, ForeignKey("member.id"), index=True)
    amount_cents: Mapped[int] = mapped_column(Integer)
    date: Mapped[dt.date] = mapped_column(Date)
    created_at: Mapped[dt.datetime] = mapped_column(UTCDateTime)
    updated_at: Mapped[dt.datetime] = mapped_column(UTCDateTime)
    sort_seq: Mapped[int] = mapped_column(Integer)  # as on expense
