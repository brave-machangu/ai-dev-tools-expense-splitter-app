"""Split and balance maths from spec §7. Pure functions over integer cents.

These rules must produce exactly the same numbers as the frontend's
`src/domain/calc.ts`, which the mock API used.
"""

from collections.abc import Hashable, Iterable, Sequence
from typing import NamedTuple

from app.models import ExpenseRecord, MemberRecord, SettlementRecord

type MemberKey = Hashable


class Participant(NamedTuple):
    member_id: MemberKey
    position: int


class NetBalance(NamedTuple):
    member_id: MemberKey
    position: int
    net_cents: int


class Transfer(NamedTuple):
    from_member_id: MemberKey
    to_member_id: MemberKey
    amount_cents: int


def split_equal(
    total_cents: int, participants: Iterable[Participant]
) -> list[tuple[MemberKey, int]]:
    """§7.1: floor division, then the remainder goes one minor unit at a time to
    participants in ascending position. Returned in position order."""
    ordered = sorted(participants, key=lambda p: p.position)
    if not ordered:
        return []
    base, remainder = divmod(total_cents, len(ordered))
    return [(p.member_id, base + (1 if i < remainder else 0)) for i, p in enumerate(ordered)]


def compute_balances(
    members: Sequence[MemberRecord],
    expenses: Iterable[ExpenseRecord],
    settlements: Iterable[SettlementRecord],
) -> list[NetBalance]:
    """§7.2: net = paid − own shares + settlements paid − settlements received.

    One entry per member, in ascending position, zeros included."""
    net = {m.id: 0 for m in members}

    def bump(member_id: MemberKey, delta: int) -> None:
        if member_id in net:
            net[member_id] += delta

    for expense in expenses:
        bump(expense.payer_member_id, expense.amount_cents)
        for share in expense.shares:
            bump(share.member_id, -share.amount_cents)
    for settlement in settlements:
        bump(settlement.from_member_id, settlement.amount_cents)
        bump(settlement.to_member_id, -settlement.amount_cents)

    ordered = sorted(members, key=lambda m: m.position)
    return [NetBalance(m.id, m.position, net[m.id]) for m in ordered]


def simplify_transfers(balances: Iterable[NetBalance]) -> list[Transfer]:
    """§7.3: repeatedly match the largest debtor with the largest creditor.

    Both sides are sorted by absolute amount descending, ties broken by
    ascending position, which makes the output deterministic."""
    entries = list(balances)

    def order(b: NetBalance) -> tuple[int, int]:
        return (-abs(b.net_cents), b.position)

    debtors = [[b.member_id, -b.net_cents] for b in sorted(entries, key=order) if b.net_cents < 0]
    creditors = [[b.member_id, b.net_cents] for b in sorted(entries, key=order) if b.net_cents > 0]

    transfers: list[Transfer] = []
    d = c = 0
    while d < len(debtors) and c < len(creditors):
        debtor, creditor = debtors[d], creditors[c]
        amount = min(debtor[1], creditor[1])
        transfers.append(Transfer(debtor[0], creditor[0], amount))
        debtor[1] -= amount
        creditor[1] -= amount
        if debtor[1] == 0:
            d += 1
        if creditor[1] == 0:
            c += 1
    return transfers


def compute_pairwise(
    members: Sequence[MemberRecord],
    expenses: Iterable[ExpenseRecord],
    settlements: Iterable[SettlementRecord],
) -> list[Transfer]:
    """§7.4: raw debts between each pair, from share and settlement rows only.

    Every participant owes their share to the payer; a settlement from A to B
    reduces what A owes B. Reciprocal debts are netted, zero pairs dropped, and
    pairs are listed in position order."""
    owed: dict[tuple[MemberKey, MemberKey], int] = {}

    def add(debtor: MemberKey, creditor: MemberKey, amount: int) -> None:
        if debtor != creditor:
            owed[(debtor, creditor)] = owed.get((debtor, creditor), 0) + amount

    for expense in expenses:
        for share in expense.shares:
            add(share.member_id, expense.payer_member_id, share.amount_cents)
    for settlement in settlements:
        add(settlement.to_member_id, settlement.from_member_id, settlement.amount_cents)

    ordered = sorted(members, key=lambda m: m.position)
    result: list[Transfer] = []
    for i, a in enumerate(ordered):
        for b in ordered[i + 1 :]:
            net = owed.get((a.id, b.id), 0) - owed.get((b.id, a.id), 0)
            if net > 0:
                result.append(Transfer(a.id, b.id, net))
            elif net < 0:
                result.append(Transfer(b.id, a.id, -net))
    return result
