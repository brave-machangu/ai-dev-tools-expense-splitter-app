import pytest
from fastapi.testclient import TestClient

from tests.helpers import (
    CODE_RE,
    assert_error,
    assert_matches_schema,
    create_group,
    get_snapshot,
)


def test_create_group_returns_201_and_a_code(client: TestClient) -> None:
    response = client.post("/api/groups", json={"name": "Lisbon weekend", "currency": "EUR"})

    assert response.status_code == 201
    body = response.json()
    assert_matches_schema(body, "CreateGroupResult")
    assert CODE_RE.fullmatch(body["code"])


def test_group_codes_are_unique(client: TestClient) -> None:
    codes = {create_group(client) for _ in range(50)}
    assert len(codes) == 50


def test_new_group_snapshot_is_empty(client: TestClient) -> None:
    code = create_group(client, name="  Weekend in Porto  ", currency="GBP")

    snapshot = get_snapshot(client, code)

    assert snapshot["group"]["code"] == code
    assert snapshot["group"]["name"] == "Weekend in Porto"
    assert snapshot["group"]["currency"] == "GBP"
    for key in (
        "members",
        "expenses",
        "settlements",
        "balances",
        "suggested_transfers",
        "pairwise",
    ):
        assert snapshot[key] == []


def test_group_name_may_be_60_characters(client: TestClient) -> None:
    response = client.post("/api/groups", json={"name": "x" * 60, "currency": "EUR"})
    assert response.status_code == 201


@pytest.mark.parametrize(
    "payload",
    [
        {"name": "", "currency": "EUR"},
        {"name": "   ", "currency": "EUR"},
        {"name": "x" * 61, "currency": "EUR"},
        {"name": "Trip", "currency": "JPY"},
        {"name": "Trip", "currency": "KWD"},
        {"name": "Trip", "currency": "eur"},
        {"name": "Trip"},
        {"currency": "EUR"},
        {"name": 42, "currency": "EUR"},
    ],
)
def test_create_group_rejects_invalid_input(client: TestClient, payload: dict) -> None:
    assert_error(client.post("/api/groups", json=payload), 422)


def test_unknown_group_is_404(client: TestClient) -> None:
    assert_error(client.get("/api/groups/ZZZZZZZZ"), 404)


@pytest.mark.parametrize("bad_code", ["abc", "tr1p2026", "TR1P20261", "TRIP2026", "TR1P-026"])
def test_malformed_group_code_is_422(client: TestClient, bad_code: str) -> None:
    assert_error(client.get(f"/api/groups/{bad_code}"), 422)


def test_cors_preflight_allows_the_frontend(client: TestClient) -> None:
    response = client.options(
        "/api/groups",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "POST" in response.headers["access-control-allow-methods"]


def test_cors_headers_on_normal_responses(client: TestClient) -> None:
    response = client.get("/api/groups/ZZZZZZZZ", headers={"Origin": "http://localhost:5173"})
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_cors_does_not_allow_other_origins(client: TestClient) -> None:
    response = client.options(
        "/api/groups",
        headers={"Origin": "http://evil.example", "Access-Control-Request-Method": "POST"},
    )
    assert "access-control-allow-origin" not in response.headers
