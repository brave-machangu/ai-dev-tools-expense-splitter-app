from typing import Any

import pytest
from fastapi.testclient import TestClient

from tests.helpers import (
    add_expense,
    add_members,
    assert_error,
    create_group,
    expense_body,
    get_snapshot,
    nets_by_name,
    random_id,
)


@pytest.fixture
def group(client: TestClient) -> tuple[str, dict[str, str]]:
    code = create_group(client)
    return code, add_members(client, code, "Priya", "Sam", "Ana", "Carl")


def expenses_path(code: str, expense_id: str | None = None) -> str:
    base = f"/api/groups/{code}/expenses"
    return f"{base}/{expense_id}" if expense_id else base


def shares(expense: dict[str, Any]) -> list[tuple[str, int]]:
    return [(s["member_id"], s["amount_cents"]) for s in expense["shares"]]


# ----------------------------------------------------------------- equal splits


def test_equal_split_hands_the_remainder_out_by_position(client: TestClient, group) -> None:
    code, ids = group
    participants = [ids["Carl"], ids["Sam"], ids["Priya"]]  # deliberately not in position order

    snapshot = add_expense(client, code, expense_body(ids["Priya"], 1000, participants))

    expense = snapshot["expenses"][0]
    assert expense["split_type"] == "equal"
    assert shares(expense) == [(ids["Priya"], 334), (ids["Sam"], 333), (ids["Carl"], 333)]


def test_equal_split_without_remainder(client: TestClient, group) -> None:
    code, ids = group
    snapshot = add_expense(client, code, expense_body(ids["Ana"], 1200, list(ids.values())))
    assert [amount for _, amount in shares(snapshot["expenses"][0])] == [300, 300, 300, 300]


def test_equal_split_is_deterministic(client: TestClient, group) -> None:
    code, ids = group
    body = expense_body(ids["Sam"], 6235, list(ids.values()))

    first = add_expense(client, code, body)["expenses"][0]
    second = add_expense(client, code, body)["expenses"][0]

    assert (
        shares(first)
        == shares(second)
        == [
            (ids["Priya"], 1559),
            (ids["Sam"], 1559),
            (ids["Ana"], 1559),
            (ids["Carl"], 1558),
        ]
    )


def test_payer_does_not_have_to_participate(client: TestClient, group) -> None:
    code, ids = group

    snapshot = add_expense(client, code, expense_body(ids["Priya"], 900, [ids["Sam"], ids["Ana"]]))

    assert shares(snapshot["expenses"][0]) == [(ids["Sam"], 450), (ids["Ana"], 450)]
    assert nets_by_name(snapshot) == {"Priya": 900, "Sam": -450, "Ana": -450, "Carl": 0}


def test_equal_split_ignores_exact_shares(client: TestClient, group) -> None:
    code, ids = group
    body = expense_body(
        ids["Priya"], 1000, [ids["Priya"], ids["Sam"]], exact={ids["Priya"]: 1, ids["Sam"]: 999}
    )

    snapshot = add_expense(client, code, body)

    assert shares(snapshot["expenses"][0]) == [(ids["Priya"], 500), (ids["Sam"], 500)]


# ----------------------------------------------------------------- exact splits


def test_exact_split_is_stored_verbatim(client: TestClient, group) -> None:
    code, ids = group
    body = expense_body(
        ids["Carl"],
        9400,
        [ids["Sam"], ids["Priya"], ids["Carl"]],
        split_type="exact",
        exact={ids["Sam"]: 3400, ids["Carl"]: 3000, ids["Priya"]: 3000},
    )

    expense = add_expense(client, code, body)["expenses"][0]

    assert expense["split_type"] == "exact"
    assert shares(expense) == [(ids["Priya"], 3000), (ids["Sam"], 3400), (ids["Carl"], 3000)]
    assert sum(amount for _, amount in shares(expense)) == expense["amount_cents"]


def test_exact_shares_may_be_zero(client: TestClient, group) -> None:
    code, ids = group
    body = expense_body(
        ids["Priya"],
        500,
        [ids["Priya"], ids["Sam"]],
        split_type="exact",
        exact={ids["Priya"]: 500, ids["Sam"]: 0},
    )
    assert shares(add_expense(client, code, body)["expenses"][0]) == [
        (ids["Priya"], 500),
        (ids["Sam"], 0),
    ]


def test_exact_shares_must_add_up_to_the_total(client: TestClient, group) -> None:
    code, ids = group
    body = expense_body(
        ids["Priya"],
        1000,
        [ids["Priya"], ids["Sam"]],
        split_type="exact",
        exact={ids["Priya"]: 500, ids["Sam"]: 499},
    )

    response = client.post(expenses_path(code), json=body)

    assert_error(response, 422)
    assert isinstance(response.json()["detail"], str)
    assert get_snapshot(client, code)["expenses"] == []


def test_exact_split_requires_exact_shares(client: TestClient, group) -> None:
    code, ids = group
    body = expense_body(ids["Priya"], 1000, [ids["Priya"]], split_type="exact")
    assert_error(client.post(expenses_path(code), json=body), 422)


@pytest.mark.parametrize("case", ["extra", "missing", "duplicate"])
def test_exact_shares_must_match_the_participants(client: TestClient, group, case: str) -> None:
    code, ids = group
    body = expense_body(
        ids["Priya"], 1000, [ids["Priya"], ids["Sam"]], split_type="exact", exact={}
    )
    if case == "extra":
        entries = [(ids["Priya"], 500), (ids["Sam"], 300), (ids["Ana"], 200)]
    elif case == "missing":
        entries = [(ids["Priya"], 1000)]
    else:
        entries = [(ids["Priya"], 500), (ids["Priya"], 500)]
    body["exact_shares"] = [{"member_id": m, "amount_cents": c} for m, c in entries]

    assert_error(client.post(expenses_path(code), json=body), 422)


def test_exact_share_amounts_cannot_be_negative(client: TestClient, group) -> None:
    code, ids = group
    body = expense_body(
        ids["Priya"],
        1000,
        [ids["Priya"], ids["Sam"]],
        split_type="exact",
        exact={ids["Priya"]: 1100, ids["Sam"]: -100},
    )
    assert_error(client.post(expenses_path(code), json=body), 422)


# ------------------------------------------------------------------- validation


@pytest.mark.parametrize("amount", [0, -100, 100_000_001, 10.5, "1000", None, True])
def test_amount_must_be_a_positive_integer_within_the_limit(
    client: TestClient, group, amount: Any
) -> None:
    code, ids = group
    body = expense_body(ids["Priya"], amount, [ids["Priya"]])
    assert_error(client.post(expenses_path(code), json=body), 422)


def test_amount_may_be_one_million(client: TestClient, group) -> None:
    code, ids = group
    add_expense(client, code, expense_body(ids["Priya"], 100_000_000, [ids["Priya"]]))


@pytest.mark.parametrize("description", ["", "   ", "x" * 121])
def test_description_must_be_1_to_120_characters(
    client: TestClient, group, description: str
) -> None:
    code, ids = group
    body = expense_body(ids["Priya"], 100, [ids["Priya"]], description=description)
    assert_error(client.post(expenses_path(code), json=body), 422)


def test_description_is_trimmed(client: TestClient, group) -> None:
    code, ids = group
    body = expense_body(ids["Priya"], 100, [ids["Priya"]], description="  Coffee  ")
    assert add_expense(client, code, body)["expenses"][0]["description"] == "Coffee"


@pytest.mark.parametrize("date", ["2026-13-01", "2026-02-30", "12/09/2026", ""])
def test_date_must_be_a_valid_calendar_date(client: TestClient, group, date: str) -> None:
    code, ids = group
    body = expense_body(ids["Priya"], 100, [ids["Priya"]], date=date)
    assert_error(client.post(expenses_path(code), json=body), 422)


def test_split_type_must_be_equal_or_exact(client: TestClient, group) -> None:
    code, ids = group
    body = expense_body(ids["Priya"], 100, [ids["Priya"]], split_type="percent")
    assert_error(client.post(expenses_path(code), json=body), 422)


def test_at_least_one_participant_is_required(client: TestClient, group) -> None:
    code, ids = group
    assert_error(client.post(expenses_path(code), json=expense_body(ids["Priya"], 100, [])), 422)


def test_participants_must_be_unique(client: TestClient, group) -> None:
    code, ids = group
    body = expense_body(ids["Priya"], 100, [ids["Sam"], ids["Sam"]])
    assert_error(client.post(expenses_path(code), json=body), 422)


def test_payer_must_be_a_member_of_the_group(client: TestClient, group) -> None:
    code, ids = group
    body = expense_body(random_id(), 100, [ids["Priya"]])
    assert_error(client.post(expenses_path(code), json=body), 422)


def test_participants_must_be_members_of_the_group(client: TestClient, group) -> None:
    code, ids = group
    other_code = create_group(client)
    outsider = add_members(client, other_code, "Zed")["Zed"]

    body = expense_body(ids["Priya"], 100, [ids["Priya"], outsider])
    assert_error(client.post(expenses_path(code), json=body), 422)


def test_expense_in_unknown_group_is_404(client: TestClient) -> None:
    body = expense_body(random_id(), 100, [random_id()])
    assert_error(client.post(expenses_path("ZZZZZZZZ"), json=body), 404)


# --------------------------------------------------------------- list behaviour


def test_new_members_are_not_added_to_existing_expenses(client: TestClient, group) -> None:
    code, ids = group
    before = add_expense(client, code, expense_body(ids["Priya"], 1000, list(ids.values())))

    add_members(client, code, "Late arrival")

    after = get_snapshot(client, code)
    assert after["expenses"][0]["shares"] == before["expenses"][0]["shares"]
    assert nets_by_name(after)["Late arrival"] == 0


def test_expenses_are_listed_newest_first(client: TestClient, group) -> None:
    code, ids = group
    for description in ("First", "Second", "Third"):
        add_expense(
            client, code, expense_body(ids["Priya"], 100, [ids["Sam"]], description=description)
        )

    expenses = get_snapshot(client, code)["expenses"]

    assert [e["description"] for e in expenses] == ["Third", "Second", "First"]


# ---------------------------------------------------------------- update/delete


def test_update_replaces_the_expense_and_recomputes_shares(client: TestClient, group) -> None:
    code, ids = group
    original = add_expense(
        client, code, expense_body(ids["Priya"], 900, [ids["Priya"], ids["Sam"], ids["Ana"]])
    )["expenses"][0]
    add_expense(client, code, expense_body(ids["Sam"], 100, [ids["Sam"]], description="Later"))

    body = expense_body(
        ids["Carl"],
        1000,
        [ids["Priya"], ids["Carl"]],
        description="Corrected",
        date="2026-09-01",
        split_type="exact",
        exact={ids["Priya"]: 600, ids["Carl"]: 400},
    )
    response = client.put(expenses_path(code, original["id"]), json=body)

    assert response.status_code == 200, response.text
    snapshot = response.json()
    updated = next(e for e in snapshot["expenses"] if e["id"] == original["id"])
    assert updated["payer_member_id"] == ids["Carl"]
    assert updated["description"] == "Corrected"
    assert updated["date"] == "2026-09-01"
    assert updated["split_type"] == "exact"
    assert shares(updated) == [(ids["Priya"], 600), (ids["Carl"], 400)]
    assert updated["created_at"] == original["created_at"]
    assert updated["updated_at"] >= original["updated_at"]
    # Editing doesn't move it in the list.
    assert [e["description"] for e in snapshot["expenses"]] == ["Later", "Corrected"]


def test_update_validates_like_create(client: TestClient, group) -> None:
    code, ids = group
    expense_id = add_expense(client, code, expense_body(ids["Priya"], 100, [ids["Sam"]]))[
        "expenses"
    ][0]["id"]

    body = expense_body(ids["Priya"], 0, [ids["Sam"]])
    assert_error(client.put(expenses_path(code, expense_id), json=body), 422)


def test_update_unknown_expense_is_404(client: TestClient, group) -> None:
    code, ids = group
    body = expense_body(ids["Priya"], 100, [ids["Sam"]])
    assert_error(client.put(expenses_path(code, random_id()), json=body), 404)


def test_expense_from_another_group_is_404(client: TestClient, group) -> None:
    code, ids = group
    expense_id = add_expense(client, code, expense_body(ids["Priya"], 100, [ids["Sam"]]))[
        "expenses"
    ][0]["id"]
    other_code = create_group(client)

    body = expense_body(ids["Priya"], 100, [ids["Sam"]])
    assert_error(client.put(expenses_path(other_code, expense_id), json=body), 404)
    assert_error(client.delete(expenses_path(other_code, expense_id)), 404)


def test_delete_expense_recomputes_balances(client: TestClient, group) -> None:
    code, ids = group
    expense_id = add_expense(client, code, expense_body(ids["Priya"], 1000, [ids["Sam"]]))[
        "expenses"
    ][0]["id"]

    response = client.delete(expenses_path(code, expense_id))

    assert response.status_code == 200
    snapshot = response.json()
    assert snapshot["expenses"] == []
    assert set(nets_by_name(snapshot).values()) == {0}
    assert snapshot["suggested_transfers"] == []
    assert_error(client.delete(expenses_path(code, expense_id)), 404)
