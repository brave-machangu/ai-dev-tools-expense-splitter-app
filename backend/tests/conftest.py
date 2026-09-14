import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.repository import InMemoryRepository


@pytest.fixture
def client() -> TestClient:
    """A fresh app with an empty in-memory store for every test.

    Tests talk to the HTTP surface only, never to the repository, so the same
    suite must pass unchanged once a SQLAlchemy repository replaces this one.
    """
    return TestClient(create_app(InMemoryRepository()))
