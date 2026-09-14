"""Test fixtures.

Every endpoint test runs twice: against the in-memory repository and against the
SQLAlchemy repository. Tests talk to the HTTP surface only, never to a
repository, so both must behave identically.

The SQL runs use a throwaway database, never the dev database from DATABASE_URL:
by default a fresh SQLite file in pytest's temp directory. To run against another
server such as PostgreSQL, set TEST_DATABASE_URL to a database you're happy to
lose. Its tables are dropped and recreated once per run and emptied before every
test.
"""

import os
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine

from app.database import create_schema, database_url, make_engine
from app.main import create_app
from app.repository import InMemoryRepository
from app.sqlalchemy_repository import SqlAlchemyRepository
from app.tables import Base


@pytest.fixture(scope="session")
def engine(tmp_path_factory: pytest.TempPathFactory) -> Iterator[Engine]:
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        url = f"sqlite:///{(tmp_path_factory.mktemp('db') / 'test.db').as_posix()}"
    elif url == database_url():
        pytest.exit("TEST_DATABASE_URL must not point at the DATABASE_URL database", returncode=2)

    engine = make_engine(url)
    Base.metadata.drop_all(engine)
    create_schema(engine)
    yield engine
    engine.dispose()


@pytest.fixture(params=["memory", "sqlalchemy"])
def client(request: pytest.FixtureRequest) -> TestClient:
    """A fresh app with an empty store for every test."""
    if request.param == "memory":
        return TestClient(create_app(InMemoryRepository()))

    engine: Engine = request.getfixturevalue("engine")
    with engine.begin() as connection:
        for table in reversed(Base.metadata.sorted_tables):
            connection.execute(table.delete())
    return TestClient(create_app(SqlAlchemyRepository(engine)))
