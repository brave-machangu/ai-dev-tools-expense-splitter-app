"""Database connection: the configured URL, engine setup and schema creation.

DATABASE_URL selects the database. Unset, it is a SQLite file at
backend/prorata.db, anchored to backend/ rather than the working directory.
Switching to PostgreSQL is configuration only, for example
DATABASE_URL=postgresql+psycopg://user:password@localhost:5432/prorata, plus
installing the driver with `uv add "psycopg[binary]"`.
"""

import os
from pathlib import Path
from typing import Any

from sqlalchemy import Engine, create_engine, event, make_url

from app.tables import Base

BACKEND_DIR = Path(__file__).resolve().parents[1]
DEFAULT_DATABASE_URL = f"sqlite:///{(BACKEND_DIR / 'prorata.db').as_posix()}"


def database_url() -> str:
    return os.environ.get("DATABASE_URL") or DEFAULT_DATABASE_URL


def make_engine(url: str) -> Engine:
    """Creates an engine for any SQLAlchemy URL. Doesn't connect yet."""
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
    """Creates any missing tables. Existing tables are not altered: changing the
    schema of a database with data in it needs a migration tool such as Alembic."""
    Base.metadata.create_all(engine)
