"""Unit tests for the pure calculation rules in spec §7."""

import random

import pytest

from app.calc import NetBalance, Participant, Transfer, simplify_transfers, split_equal


def test_ten_pounds_three_ways_is_334_333_333_by_position() -> None:
    participants = [Participant("c", 2), Participant("a", 0), Participant("b", 1)]

    assert split_equal(1000, participants) == [("a", 334), ("b", 333), ("c", 333)]


def test_split_equal_with_no_participants() -> None:
    assert split_equal(1000, []) == []


@pytest.mark.parametrize("seed", range(20))
def test_split_equal_properties(seed: int) -> None:
    rng = random.Random(seed)
    n = rng.randint(1, 8)
    total = rng.randint(1, 100_000_000)
    participants = [Participant(f"m{i}", i) for i in range(n)]
    rng.shuffle(participants)

    result = split_equal(total, participants)

    amounts = [amount for _, amount in result]
    assert sum(amounts) == total
    assert max(amounts) - min(amounts) <= 1
    assert amounts == sorted(amounts, reverse=True)  # extra cents go to the lowest positions
    assert [member for member, _ in result] == [f"m{i}" for i in range(n)]
    assert split_equal(total, participants) == result


def test_simplify_breaks_ties_by_position() -> None:
    balances = [NetBalance("b", 1, -100), NetBalance("c", 2, 200), NetBalance("a", 0, -100)]

    assert simplify_transfers(balances) == [Transfer("a", "c", 100), Transfer("b", "c", 100)]


def test_simplify_matches_largest_debtor_with_largest_creditor() -> None:
    balances = [
        NetBalance("a", 0, -50),
        NetBalance("b", 1, -150),
        NetBalance("c", 2, 120),
        NetBalance("d", 3, 80),
    ]

    assert simplify_transfers(balances) == [
        Transfer("b", "c", 120),
        Transfer("b", "d", 30),
        Transfer("a", "d", 50),
    ]


def test_simplify_with_everyone_settled() -> None:
    assert simplify_transfers([NetBalance("a", 0, 0), NetBalance("b", 1, 0)]) == []


@pytest.mark.parametrize("seed", range(25))
def test_simplify_clears_every_balance(seed: int) -> None:
    rng = random.Random(seed)
    n = rng.randint(2, 8)
    nets = [rng.randint(-100_000, 100_000) for _ in range(n - 1)]
    nets.append(-sum(nets))
    balances = [NetBalance(f"m{i}", i, net) for i, net in enumerate(nets)]

    transfers = simplify_transfers(balances)

    remaining = {b.member_id: b.net_cents for b in balances}
    for t in transfers:
        assert t.amount_cents > 0
        assert t.from_member_id != t.to_member_id
        remaining[t.from_member_id] += t.amount_cents
        remaining[t.to_member_id] -= t.amount_cents
    assert set(remaining.values()) == {0}
    assert len(transfers) <= n - 1
