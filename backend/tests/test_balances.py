"""End-to-end balance scenarios through the HTTP API (spec §7, §8.7)."""

import random

from fastapi.testclient import TestClient

from tests.helpers import (
    add_expense,
    add_members,
    add_settlement,
    create_group,
    expense_body,
    get_snapshot,
    nets_by_name,
    transfers_by_name,
)


def build_lisbon_weekend(client: TestClient) -> tuple[str, dict[str, str]]:
    """The same scenario as the frontend's sample data, so both must agree."""
    code = create_group(client)
    ids = add_members(client, code, "Priya", "Sam", "Ana", "Carl")
    everyone = list(ids.values())
    add_expense(client, code, expense_body(ids["Priya"], 48000, everyone, description="Villa"))
    add_expense(
        client,
        code,
        expense_body(
            ids["Sam"], 3650, [ids["Priya"], ids["Sam"], ids["Carl"]], description="Taxis"
        ),
    )
    add_expense(client, code, expense_body(ids["Ana"], 6235, everyone, description="Groceries"))
    add_expense(client, code, expense_body(ids["Ana"], 18000, everyone, description="Boat tour"))
    add_expense(
        client,
        code,
        expense_body(
            ids["Carl"],
            9400,
            [ids["Priya"], ids["Sam"], ids["Carl"]],
            description="Tuesday dinner",
            split_type="exact",
            exact={ids["Priya"]: 3000, ids["Sam"]: 3400, ids["Carl"]: 3000},
        ),
    )
    add_settlement(client, code, ids["Sam"], ids["Priya"], 5000)
    return code, ids


def test_sample_scenario_balances(client: TestClient) -> None:
    code, _ = build_lisbon_weekend(client)

    snapshot = get_snapshot(client, code)

    assert nets_by_name(snapshot) == {"Priya": 20724, "Sam": -14026, "Ana": 6176, "Carl": -12874}
    assert sum(b["net_cents"] for b in snapshot["balances"]) == 0


def test_sample_scenario_suggested_transfers(client: TestClient) -> None:
    code, _ = build_lisbon_weekend(client)

    assert transfers_by_name(get_snapshot(client, code), "suggested_transfers") == [
        ("Sam", "Priya", 14026),
        ("Carl", "Priya", 6698),
        ("Carl", "Ana", 6176),
    ]


def test_sample_scenario_raw_pairwise(client: TestClient) -> None:
    code, _ = build_lisbon_weekend(client)

    assert transfers_by_name(get_snapshot(client, code), "pairwise") == [
        ("Sam", "Priya", 5783),
        ("Ana", "Priya", 5941),
        ("Carl", "Priya", 9000),
        ("Sam", "Ana", 6059),
        ("Sam", "Carl", 2184),
        ("Carl", "Ana", 6058),
    ]


def test_pairwise_debts_add_up_to_each_net_balance(client: TestClient) -> None:
    code, _ = build_lisbon_weekend(client)
    snapshot = get_snapshot(client, code)

    from_pairwise = {m["name"]: 0 for m in snapshot["members"]}
    for debtor, creditor, amount in transfers_by_name(snapshot, "pairwise"):
        from_pairwise[debtor] -= amount
        from_pairwise[creditor] += amount

    assert from_pairwise == nets_by_name(snapshot)


def test_suggested_transfers_settle_everyone(client: TestClient) -> None:
    code, _ = build_lisbon_weekend(client)
    snapshot = get_snapshot(client, code)

    remaining = nets_by_name(snapshot)
    for debtor, creditor, amount in transfers_by_name(snapshot, "suggested_transfers"):
        remaining[debtor] += amount
        remaining[creditor] -= amount

    assert set(remaining.values()) == {0}


def test_editing_after_settling_unsettles_the_group(client: TestClient) -> None:
    """Spec §8.7: nothing locks after settling; the settlement row still counts."""
    code = create_group(client)
    ids = add_members(client, code, "Priya", "Sam")
    snapshot = add_expense(
        client, code, expense_body(ids["Priya"], 6000, list(ids.values()), description="Dinner")
    )
    expense_id = snapshot["expenses"][0]["id"]
    settled = add_settlement(client, code, ids["Sam"], ids["Priya"], 3000)
    assert set(nets_by_name(settled).values()) == {0}

    response = client.put(
        f"/api/groups/{code}/expenses/{expense_id}",
        json=expense_body(ids["Priya"], 7500, list(ids.values()), description="Dinner"),
    )

    assert response.status_code == 200
    snapshot = response.json()
    assert nets_by_name(snapshot) == {"Priya": 750, "Sam": -750}
    assert transfers_by_name(snapshot, "suggested_transfers") == [("Sam", "Priya", 750)]
    assert len(snapshot["settlements"]) == 1


def test_nets_always_sum_to_zero_after_random_operations(client: TestClient) -> None:
    rng = random.Random(20260915)
    code = create_group(client)
    ids = list(add_members(client, code, *[f"M{i}" for i in range(6)]).values())

    for _ in range(40):
        payer = rng.choice(ids)
        participants = rng.sample(ids, rng.randint(1, len(ids)))
        amount = rng.randint(1, 250_000)
        if rng.random() < 0.5:
            body = expense_body(payer, amount, participants)
        else:
            cuts = sorted(rng.randint(0, amount) for _ in range(len(participants) - 1))
            parts = [b - a for a, b in zip([0, *cuts], [*cuts, amount], strict=True)]
            body = expense_body(
                payer,
                amount,
                participants,
                split_type="exact",
                exact=dict(zip(participants, parts, strict=True)),
            )
        snapshot = add_expense(client, code, body)
        if rng.random() < 0.3:
            a, b = rng.sample(ids, 2)
            snapshot = add_settlement(client, code, a, b, rng.randint(1, 50_000))

        assert sum(b["net_cents"] for b in snapshot["balances"]) == 0
        for expense in snapshot["expenses"]:
            assert sum(s["amount_cents"] for s in expense["shares"]) == expense["amount_cents"]
