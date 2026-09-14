import pytest
from fastapi.testclient import TestClient

from tests.helpers import (
    add_expense,
    add_members,
    add_settlement,
    assert_error,
    assert_matches_schema,
    create_group,
    expense_body,
    get_snapshot,
    random_id,
)


def members_path(code: str, member_id: str | None = None) -> str:
    base = f"/api/groups/{code}/members"
    return f"{base}/{member_id}" if member_id else base


def test_add_member_returns_201_and_the_snapshot(client: TestClient) -> None:
    code = create_group(client)

    response = client.post(members_path(code), json={"name": "Priya"})

    assert response.status_code == 201
    snapshot = response.json()
    assert_matches_schema(snapshot, "GroupSnapshot")
    assert [m["name"] for m in snapshot["members"]] == ["Priya"]
    assert snapshot["balances"] == [{"member_id": snapshot["members"][0]["id"], "net_cents": 0}]


def test_members_get_increasing_positions(client: TestClient) -> None:
    code = create_group(client)
    add_members(client, code, "Priya", "Sam", "Ana")

    members = get_snapshot(client, code)["members"]

    assert [(m["name"], m["position"]) for m in members] == [("Priya", 0), ("Sam", 1), ("Ana", 2)]


def test_member_name_is_trimmed(client: TestClient) -> None:
    code = create_group(client)
    snapshot = client.post(members_path(code), json={"name": "  Sam  "}).json()
    assert snapshot["members"][0]["name"] == "Sam"


def test_member_name_may_be_40_characters(client: TestClient) -> None:
    code = create_group(client)
    assert client.post(members_path(code), json={"name": "x" * 40}).status_code == 201


@pytest.mark.parametrize("body", [{"name": ""}, {"name": "   "}, {"name": "x" * 41}, {}])
def test_add_member_rejects_invalid_names(client: TestClient, body: dict) -> None:
    code = create_group(client)
    assert_error(client.post(members_path(code), json=body), 422)


def test_group_holds_at_most_8_members(client: TestClient) -> None:
    code = create_group(client)
    add_members(client, code, *[f"Person {i}" for i in range(8)])

    response = client.post(members_path(code), json={"name": "One too many"})

    assert_error(response, 422)
    assert isinstance(response.json()["detail"], str)
    assert len(get_snapshot(client, code)["members"]) == 8


def test_add_member_to_unknown_group_is_404(client: TestClient) -> None:
    assert_error(client.post(members_path("ZZZZZZZZ"), json={"name": "Sam"}), 404)


def test_rename_member_keeps_id_and_position(client: TestClient) -> None:
    code = create_group(client)
    ids = add_members(client, code, "Priya", "Smm")

    response = client.patch(members_path(code, ids["Smm"]), json={"name": "Sam"})

    assert response.status_code == 200
    snapshot = response.json()
    assert_matches_schema(snapshot, "GroupSnapshot")
    assert [(m["id"], m["name"], m["position"]) for m in snapshot["members"]] == [
        (ids["Priya"], "Priya", 0),
        (ids["Smm"], "Sam", 1),
    ]


def test_rename_rejects_invalid_name(client: TestClient) -> None:
    code = create_group(client)
    ids = add_members(client, code, "Sam")
    assert_error(client.patch(members_path(code, ids["Sam"]), json={"name": " "}), 422)


def test_rename_unknown_member_is_404(client: TestClient) -> None:
    code = create_group(client)
    assert_error(client.patch(members_path(code, random_id()), json={"name": "Sam"}), 404)


def test_member_id_must_be_a_uuid(client: TestClient) -> None:
    code = create_group(client)
    assert_error(client.patch(members_path(code, "not-a-uuid"), json={"name": "Sam"}), 422)
    assert_error(client.delete(members_path(code, "not-a-uuid")), 422)


def test_member_from_another_group_is_404(client: TestClient) -> None:
    code_a = create_group(client)
    code_b = create_group(client)
    ids = add_members(client, code_a, "Priya")

    assert_error(client.patch(members_path(code_b, ids["Priya"]), json={"name": "X"}), 404)
    assert_error(client.delete(members_path(code_b, ids["Priya"])), 404)


def test_delete_unreferenced_member(client: TestClient) -> None:
    code = create_group(client)
    ids = add_members(client, code, "Priya", "Typo")

    response = client.delete(members_path(code, ids["Typo"]))

    assert response.status_code == 200
    snapshot = response.json()
    assert_matches_schema(snapshot, "GroupSnapshot")
    assert [m["name"] for m in snapshot["members"]] == ["Priya"]
    assert_error(client.delete(members_path(code, ids["Typo"])), 404)


def test_positions_are_never_reused(client: TestClient) -> None:
    code = create_group(client)
    ids = add_members(client, code, "A", "B", "C")
    client.delete(members_path(code, ids["C"]))
    client.delete(members_path(code, ids["B"]))

    add_members(client, code, "D")

    positions = {m["name"]: m["position"] for m in get_snapshot(client, code)["members"]}
    assert positions == {"A": 0, "D": 3}


def test_cannot_delete_a_payer(client: TestClient) -> None:
    code = create_group(client)
    ids = add_members(client, code, "Priya", "Sam")
    add_expense(client, code, expense_body(ids["Priya"], 1000, [ids["Sam"]]))

    assert_error(client.delete(members_path(code, ids["Priya"])), 409)


def test_cannot_delete_a_participant(client: TestClient) -> None:
    code = create_group(client)
    ids = add_members(client, code, "Priya", "Sam")
    add_expense(client, code, expense_body(ids["Priya"], 1000, [ids["Sam"]]))

    assert_error(client.delete(members_path(code, ids["Sam"])), 409)


def test_cannot_delete_a_member_with_a_zero_exact_share(client: TestClient) -> None:
    code = create_group(client)
    ids = add_members(client, code, "Priya", "Sam", "Ana")
    add_expense(
        client,
        code,
        expense_body(
            ids["Priya"],
            1000,
            [ids["Sam"], ids["Ana"]],
            split_type="exact",
            exact={ids["Sam"]: 1000, ids["Ana"]: 0},
        ),
    )

    assert_error(client.delete(members_path(code, ids["Ana"])), 409)


@pytest.mark.parametrize("role", ["from", "to"])
def test_cannot_delete_a_member_in_a_payment(client: TestClient, role: str) -> None:
    code = create_group(client)
    ids = add_members(client, code, "Priya", "Sam")
    add_settlement(client, code, ids["Sam"], ids["Priya"], 500)

    target = ids["Sam"] if role == "from" else ids["Priya"]
    assert_error(client.delete(members_path(code, target)), 409)


def test_can_delete_member_once_their_expense_is_gone(client: TestClient) -> None:
    code = create_group(client)
    ids = add_members(client, code, "Priya", "Sam")
    snapshot = add_expense(client, code, expense_body(ids["Priya"], 1000, [ids["Sam"]]))
    expense_id = snapshot["expenses"][0]["id"]

    assert client.delete(f"/api/groups/{code}/expenses/{expense_id}").status_code == 200
    assert client.delete(members_path(code, ids["Sam"])).status_code == 200
