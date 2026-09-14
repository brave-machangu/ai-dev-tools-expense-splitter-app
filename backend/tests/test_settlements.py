from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.helpers import (
    add_expense,
    add_members,
    add_settlement,
    assert_error,
    create_group,
    expense_body,
    get_snapshot,
    nets_by_name,
    random_id,
    settlement_body,
    transfers_by_name,
)


@pytest.fixture
def group(client: TestClient) -> tuple[str, dict[str, str]]:
    """Priya paid 30.00 for all three, so Sam and Ana each owe her 10.00."""
    code = create_group(client)
    ids = add_members(client, code, "Priya", "Sam", "Ana")
    add_expense(client, code, expense_body(ids["Priya"], 3000, list(ids.values())))
    return code, ids


def settlements_path(code: str, settlement_id: str | None = None) -> str:
    base = f"/api/groups/{code}/settlements"
    return f"{base}/{settlement_id}" if settlement_id else base


def test_recording_a_payment_updates_balances(client: TestClient, group) -> None:
    code, ids = group

    snapshot = add_settlement(client, code, ids["Sam"], ids["Priya"], 1000)

    assert nets_by_name(snapshot) == {"Priya": 1000, "Sam": 0, "Ana": -1000}
    assert transfers_by_name(snapshot, "suggested_transfers") == [("Ana", "Priya", 1000)]
    [settlement] = snapshot["settlements"]
    assert (settlement["from_member_id"], settlement["to_member_id"]) == (ids["Sam"], ids["Priya"])
    assert settlement["amount_cents"] == 1000
    assert settlement["date"] == "2026-09-13"


def test_overpaying_reverses_the_balance(client: TestClient, group) -> None:
    code, ids = group

    snapshot = add_settlement(client, code, ids["Sam"], ids["Priya"], 1500)

    assert nets_by_name(snapshot) == {"Priya": 500, "Sam": 500, "Ana": -1000}
    # Equal creditors: the tie is broken by position, so Priya comes first.
    assert transfers_by_name(snapshot, "suggested_transfers") == [
        ("Ana", "Priya", 500),
        ("Ana", "Sam", 500),
    ]


def test_settling_everyone_clears_all_suggestions(client: TestClient, group) -> None:
    code, ids = group
    add_settlement(client, code, ids["Sam"], ids["Priya"], 1000)

    snapshot = add_settlement(client, code, ids["Ana"], ids["Priya"], 1000)

    assert set(nets_by_name(snapshot).values()) == {0}
    assert snapshot["suggested_transfers"] == []
    assert snapshot["pairwise"] == []


def test_payment_needs_two_different_people(client: TestClient, group) -> None:
    code, ids = group
    body = settlement_body(ids["Sam"], ids["Sam"], 100)
    assert_error(client.post(settlements_path(code), json=body), 422)


def test_payment_members_must_belong_to_the_group(client: TestClient, group) -> None:
    code, ids = group
    assert_error(
        client.post(settlements_path(code), json=settlement_body(random_id(), ids["Sam"], 100)),
        422,
    )
    assert_error(
        client.post(settlements_path(code), json=settlement_body(ids["Sam"], random_id(), 100)),
        422,
    )


@pytest.mark.parametrize("amount", [0, -5, 100_000_001, 12.5, "100"])
def test_payment_amount_must_be_valid(client: TestClient, group, amount: Any) -> None:
    code, ids = group
    body = settlement_body(ids["Sam"], ids["Priya"], amount)
    assert_error(client.post(settlements_path(code), json=body), 422)


@pytest.mark.parametrize("field", ["from_member_id", "to_member_id", "amount_cents", "date"])
def test_payment_fields_are_required(client: TestClient, group, field: str) -> None:
    code, ids = group
    body = settlement_body(ids["Sam"], ids["Priya"], 100)
    del body[field]
    assert_error(client.post(settlements_path(code), json=body), 422)


def test_payment_in_unknown_group_is_404(client: TestClient) -> None:
    body = settlement_body(random_id(), random_id(), 100)
    assert_error(client.post(settlements_path("ZZZZZZZZ"), json=body), 404)


def test_payments_are_listed_newest_first(client: TestClient, group) -> None:
    code, ids = group
    for amount in (100, 200, 300):
        add_settlement(client, code, ids["Sam"], ids["Priya"], amount)

    amounts = [s["amount_cents"] for s in get_snapshot(client, code)["settlements"]]

    assert amounts == [300, 200, 100]


def test_update_payment(client: TestClient, group) -> None:
    code, ids = group
    original = add_settlement(client, code, ids["Sam"], ids["Priya"], 1000)["settlements"][0]

    response = client.put(
        settlements_path(code, original["id"]),
        json=settlement_body(ids["Ana"], ids["Priya"], 400, date="2026-09-14"),
    )

    assert response.status_code == 200, response.text
    snapshot = response.json()
    [updated] = snapshot["settlements"]
    assert updated["id"] == original["id"]
    assert (updated["from_member_id"], updated["amount_cents"], updated["date"]) == (
        ids["Ana"],
        400,
        "2026-09-14",
    )
    assert updated["created_at"] == original["created_at"]
    assert updated["updated_at"] >= original["updated_at"]
    assert nets_by_name(snapshot) == {"Priya": 1600, "Sam": -1000, "Ana": -600}


def test_update_payment_validates_like_create(client: TestClient, group) -> None:
    code, ids = group
    settlement_id = add_settlement(client, code, ids["Sam"], ids["Priya"], 1000)["settlements"][0][
        "id"
    ]
    body = settlement_body(ids["Priya"], ids["Priya"], 1000)
    assert_error(client.put(settlements_path(code, settlement_id), json=body), 422)


def test_delete_payment_restores_balances(client: TestClient, group) -> None:
    code, ids = group
    settlement_id = add_settlement(client, code, ids["Sam"], ids["Priya"], 1000)["settlements"][0][
        "id"
    ]

    response = client.delete(settlements_path(code, settlement_id))

    assert response.status_code == 200
    snapshot = response.json()
    assert snapshot["settlements"] == []
    assert nets_by_name(snapshot) == {"Priya": 2000, "Sam": -1000, "Ana": -1000}
    assert_error(client.delete(settlements_path(code, settlement_id)), 404)


def test_unknown_or_foreign_payment_is_404(client: TestClient, group) -> None:
    code, ids = group
    settlement_id = add_settlement(client, code, ids["Sam"], ids["Priya"], 1000)["settlements"][0][
        "id"
    ]
    other_code = create_group(client)
    body = settlement_body(ids["Sam"], ids["Priya"], 1000)

    assert_error(client.put(settlements_path(code, random_id()), json=body), 404)
    assert_error(client.delete(settlements_path(code, random_id())), 404)
    assert_error(client.put(settlements_path(other_code, settlement_id), json=body), 404)
    assert_error(client.delete(settlements_path(other_code, settlement_id)), 404)
