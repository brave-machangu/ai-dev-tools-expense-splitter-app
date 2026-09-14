"""Shared helpers for the endpoint tests."""

import functools
import re
import uuid
from pathlib import Path
from typing import Any

import yaml
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator

OPENAPI_PATH = Path(__file__).resolve().parents[2] / "_docs" / "openapi.yaml"
CODE_RE = re.compile(r"[0-9A-HJKMNP-TV-Z]{8}")


@functools.cache
def load_openapi() -> dict[str, Any]:
    return yaml.safe_load(OPENAPI_PATH.read_text(encoding="utf-8"))


def assert_matches_schema(body: Any, schema_name: str) -> None:
    """Validate a response body against a schema in _docs/openapi.yaml."""
    schema = {
        "$ref": f"#/components/schemas/{schema_name}",
        "components": load_openapi()["components"],
    }
    validator = Draft202012Validator(schema, format_checker=Draft202012Validator.FORMAT_CHECKER)
    errors = sorted(validator.iter_errors(body), key=lambda e: list(e.absolute_path))
    assert not errors, "\n".join(f"{list(e.absolute_path)}: {e.message}" for e in errors[:5])


def random_id() -> str:
    return str(uuid.uuid4())


def create_group(client: TestClient, name: str = "Lisbon weekend", currency: str = "EUR") -> str:
    response = client.post("/api/groups", json={"name": name, "currency": currency})
    assert response.status_code == 201, response.text
    return response.json()["code"]


def add_members(client: TestClient, code: str, *names: str) -> dict[str, str]:
    """Adds members in order and returns {name: member_id}."""
    snapshot: dict[str, Any] = {}
    for name in names:
        response = client.post(f"/api/groups/{code}/members", json={"name": name})
        assert response.status_code == 201, response.text
        snapshot = response.json()
    return {m["name"]: m["id"] for m in snapshot["members"]}


def expense_body(
    payer: str,
    amount: Any,
    participants: list[str],
    *,
    description: str = "Dinner",
    date: str = "2026-09-12",
    split_type: str = "equal",
    exact: dict[str, int] | None = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "payer_member_id": payer,
        "amount_cents": amount,
        "description": description,
        "date": date,
        "split_type": split_type,
        "participant_ids": participants,
    }
    if exact is not None:
        body["exact_shares"] = [
            {"member_id": member_id, "amount_cents": cents} for member_id, cents in exact.items()
        ]
    return body


def add_expense(client: TestClient, code: str, body: dict[str, Any]) -> dict[str, Any]:
    response = client.post(f"/api/groups/{code}/expenses", json=body)
    assert response.status_code == 201, response.text
    snapshot = response.json()
    assert_matches_schema(snapshot, "GroupSnapshot")
    return snapshot


def settlement_body(
    from_id: str, to_id: str, amount: Any, date: str = "2026-09-13"
) -> dict[str, Any]:
    return {
        "from_member_id": from_id,
        "to_member_id": to_id,
        "amount_cents": amount,
        "date": date,
    }


def add_settlement(
    client: TestClient, code: str, from_id: str, to_id: str, amount: int
) -> dict[str, Any]:
    response = client.post(
        f"/api/groups/{code}/settlements", json=settlement_body(from_id, to_id, amount)
    )
    assert response.status_code == 201, response.text
    snapshot = response.json()
    assert_matches_schema(snapshot, "GroupSnapshot")
    return snapshot


def get_snapshot(client: TestClient, code: str) -> dict[str, Any]:
    response = client.get(f"/api/groups/{code}")
    assert response.status_code == 200, response.text
    snapshot = response.json()
    assert_matches_schema(snapshot, "GroupSnapshot")
    return snapshot


def nets_by_name(snapshot: dict[str, Any]) -> dict[str, int]:
    names = {m["id"]: m["name"] for m in snapshot["members"]}
    return {names[b["member_id"]]: b["net_cents"] for b in snapshot["balances"]}


def transfers_by_name(snapshot: dict[str, Any], key: str) -> list[tuple[str, str, int]]:
    names = {m["id"]: m["name"] for m in snapshot["members"]}
    return [
        (names[t["from_member_id"]], names[t["to_member_id"]], t["amount_cents"])
        for t in snapshot[key]
    ]


def assert_error(response: Any, status: int) -> None:
    """Checks the status and that the body has a `detail` field (spec error shape)."""
    assert response.status_code == status, response.text
    body = response.json()
    assert "detail" in body, body
    schema = "ValidationError" if status == 422 else "Error"
    assert_matches_schema(body, schema)
