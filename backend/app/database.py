"""Engine setup and schema creation."""

from typing import Any

from sqlalchemy import Engine, create_engine, event, make_url

from app.models import Base


def make_engine(url: str) -> Engine:
    """Creates an engine for any SQLAlchemy URL, e.g. sqlite:///quits.db or
    postgresql+psycopg://user:password@host/quits."""
    connect_args: dict[str, Any] = {}
    if make_url(url).get_backend_name() == "sqlite":
        # FastAPI runs sync routes in a thread pool, so connections cross threads.
        connect_args["check_same_thread"] = False
    engine = create_engine(url, connect_args=connect_args)
    if engine.dialect.name == "sqlite":
        event.listen(engine, "connect", _enable_sqlite_foreign_keys)
    return engine


def _enable_sqlite_foreign_keys(dbapi_connection: Any, _connection_record: Any) -> None:
    # SQLite ignores foreign keys, including ON DELETE CASCADE, unless every
    # connection switches them on.
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys = ON")
    cursor.close()


def create_schema(engine: Engine) -> None:
    """Creates any missing tables. Existing tables are left as they are."""
    Base.metadata.create_all(engine)
