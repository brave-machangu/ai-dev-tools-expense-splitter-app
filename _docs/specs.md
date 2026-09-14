# Quits — Specification

**Working name:** Quits *(single point of change; swap here and in the repo README)*
**Version:** 1.0 (v1 scope)
**Status:** Approved for build

---

## 1. Overview

Quits is a no-account web app for splitting shared costs within a small, short-lived
group — a trip, a weekend, a dinner series. One person creates a group and shares a
link. Anyone with the link picks who they are from a list of typed-in names, adds
expenses, and sees at a glance who owes whom and the shortest set of payments that
would clear everyone out.

The app **records** that a payment happened. It never moves money.

### Design posture

Three commitments shape every decision below:

1. **No authentication.** Possession of the group link is the only access control.
   This is a deliberate, documented limitation, not an oversight (see §11).
2. **Money is integer minor units.** No floats anywhere in the stack, from form
   input through database column.
3. **Determinism.** Given the same inputs, every derived number — per-person shares,
   balances, suggested transfers — is byte-identical on every recomputation. This is
   what makes the app testable.

---

## 2. Personas

### Priya — the organiser
Books the villa, fronts the deposit, creates the group. Wants to stop being the
person chasing five friends over WhatsApp. Cares most about the settle-up screen
being unambiguous enough that nobody argues with it.

### Sam — the casual participant
Opens the link once on the second evening, adds the two taxis he paid for, and
otherwise just wants to know his number. Will not create an account. Will not read
instructions. If the first screen asks him for a password, he closes the tab.

### Ana — the sceptic
Didn't drink, wasn't there for the Tuesday dinner, and will notice if she's been
charged for either. Needs to see the per-person breakdown of any expense, and needs
to understand why the app is telling her to pay someone she never shared a meal with.

---

## 3. User stories

**Group lifecycle**

- As Priya, I can create a group with a name and a currency, and get a shareable link.
- As Priya, I can add members by typing their names, up to 8.
- As Sam, I can open the link and choose which member I am, and not be asked again on
  my next visit from the same browser.
- As Priya, I can rename a member who was typed in wrong.
- As Priya, I can delete a member who was added by mistake, as long as they aren't
  referenced by any expense or settlement.

**Expenses**

- As Sam, I can record an expense: who paid, how much, what for, and on what date.
- As Sam, I can split an expense equally among a chosen subset of members, defaulting
  to everyone.
- As Ana, I can split an expense by exact per-person amounts, and I cannot save it
  until those amounts sum exactly to the total.
- As Ana, I can open any expense and see precisely what each person was charged.
- As Sam, I can edit or delete an expense I got wrong.

**Balances and settling**

- As Sam, I can see one headline number: what I owe or am owed overall.
- As Priya, I can see the shortest list of payments that settles the whole group.
- As Ana, I can switch to a raw pairwise view showing exactly who owes whom, without
  simplification.
- As Priya, I can record that a payment was made, pre-filled from a suggested transfer
  but fully editable.
- As Priya, I can edit or delete a recorded payment.

**Shared state**

- As Priya and Sam, working in two different browsers, we can each see the other's
  changes within a few seconds without reloading the page.
- As anyone, I can close the tab and come back tomorrow and everything is still there.

---

## 4. Core features

### F1 — Group creation
Name (1–60 chars) and currency, chosen once at creation and immutable thereafter.
Server generates an 8-character code from an unambiguous alphabet (Crockford-style
base32: digits and uppercase letters, excluding `I`, `L`, `O`, `U`). The group is
reachable at `/g/{code}` — a path segment, not a query parameter, so it survives
copy-paste and link previews intact.

Groups are never auto-archived and never expire.

### F2 — Members
Typed-in names, 1–40 characters, maximum 8 per group. Each member is assigned a
monotonically increasing `position` at creation time, which never changes and is
never reused within a group.

`position` is load-bearing: it is the tie-break for rounding remainder distribution
(§7.1) and for the simplification algorithm (§7.3). Without it, "same answer every
time" is not guaranteed.

Members added after an expense exists are **not** retroactively included in it.
The rule is strictly sequential — based on whether the member existed when the expense
was created, never on the expense's `date` field, which is user-supplied display
metadata and may be backdated freely.

### F3 — Identity selection
On first load of a group, the user picks which member they are. The choice is stored
in `localStorage`, keyed by group code, as a `member_id`.

On every subsequent load the stored id is validated against the group's current
members:

| Condition | Behaviour |
|---|---|
| Member exists | Use it. A rename is invisible and correct, since the id is what's stored. |
| Member no longer exists | Clear the stored value and show the picker with an explicit message: *"The person you were using this group as is no longer in it. Pick who you are."* |
| No stored value | Show the picker. |

Every `localStorage` read and write is wrapped in `try/catch`. Private browsing modes
and blocked site data cause these calls to throw, and the app must still render — it
simply falls back to asking on every load.

All copy is second-person once identity is known: "You owe Ana $14.50."

### F4 — Expense entry
Fields: payer (one member), amount, description (1–120 chars), date, split type,
participants.

- Exactly one payer per expense. Multiple payers are out of scope (§10).
- The payer need not be a participant — Priya can pay for a meal she didn't eat.
- Participants are selected by checkbox, defaulting to all current members, with a
  minimum of one.
- Amount must be > 0 and ≤ 1,000,000.00 in the group currency.

### F5 — Split modes

**Equal.** The total is divided among participants; the remainder is distributed per
§7.1.

**Exact.** The user types a per-person amount for each participant. A running
remainder is displayed live as they type, and the save control is disabled until it
reaches exactly zero. The backend independently revalidates and returns `422` if the
shares do not sum to the total — the client-side guard is a convenience, not a
security boundary.

Percentages and shares/weights are out of scope for v1 (§10). The `split_type` field
exists so they can be added later without a migration of existing data.

### F6 — Balances

Two views, with simplified shown by default and a visible toggle to raw:

**Simplified** — net position per member, followed by a minimal-ish list of transfers
that clears the group (§7.3).

**Raw pairwise** — who owes whom, derived directly from expenses without
simplification.

The simplified view carries a persistent, non-dismissable explanation, because
"why am I paying Carl when I never ate with Carl?" is the single most common source
of confusion in apps of this type:

> *These payments are combined to reduce the number of transfers. You may be asked to
> pay someone you never shared an expense with — the totals work out the same.*

"All settled up" is a **computed state**, true when every net balance is zero. It is
never a stored flag, because any edit to a past expense can silently un-settle a group.

### F7 — Settle-up
A settlement is a recorded payment row: from, to, amount, date. It is not a boolean
flag on anything.

- Pre-filled from a suggested transfer when initiated from the simplified view, but
  every field remains editable.
- Overshoot is permitted and correctly produces a reverse balance. Paying someone
  $50 to clear a $30 debt means they now owe you $20.
- Editable and deletable exactly like expenses. Consistency is cheaper than
  special-casing.
- `from_member_id` must differ from `to_member_id`.

### F8 — Edit and delete
Expenses and settlements can both be edited and deleted. Deletes are hard deletes;
deleting an expense cascades to its share rows. There is no audit history (§10).

Balances recompute freely after any change. Nothing locks, including after a
settlement has been recorded.

### F9 — Live sync
The client polls `GET /api/groups/{code}` every 5 seconds and replaces its state with
the response.

- Polling pauses when `document.visibilityState` is `hidden`, and fires one immediate
  fetch on regaining focus.
- **Snapshot application is suspended while any form is dirty**, and the pending
  snapshot is applied when that form closes. Fetching continues; only the state
  replacement waits. Without this, a 5-second timer clobbers half-typed input.

Not SSE, not websockets. Polling is a handful of lines, needs no additional server
infrastructure, and is sufficient at this scale.

### F10 — Persistence
All state lives server-side in a database. `localStorage` holds exactly one thing:
the current user's chosen `member_id` per group code. Losing it costs the user one
tap on the identity picker and nothing else.

---

## 5. Data model

All ids are UUID strings. All money is integer minor units (`_cents`) in the group's
currency. All timestamps are UTC. Types are chosen to be portable across SQLite and
PostgreSQL — no database-specific column types, per the Q7 database-agnostic
requirement.

### `group`

| Field | Type | Notes |
|---|---|---|
| `id` | string, PK | UUID |
| `code` | string(8), unique, indexed | Crockford base32, excludes I/L/O/U |
| `name` | string(60) | Required, 1–60 chars |
| `currency` | string(3) | ISO 4217, from the allowlist in §6 |
| `created_at` | datetime | UTC |

### `member`

| Field | Type | Notes |
|---|---|---|
| `id` | string, PK | UUID |
| `group_id` | string, FK → group.id | Cascade delete |
| `name` | string(40) | Required, 1–40 chars |
| `position` | integer | Monotonic within group, never reused, unique with `group_id` |
| `created_at` | datetime | UTC |

Maximum 8 members per group, enforced in application logic.

### `expense`

| Field | Type | Notes |
|---|---|---|
| `id` | string, PK | UUID |
| `group_id` | string, FK → group.id | Cascade delete |
| `payer_member_id` | string, FK → member.id | Must belong to the same group |
| `amount_cents` | integer | > 0 |
| `description` | string(120) | Required |
| `date` | date | User-supplied; display metadata only, no logic depends on it |
| `split_type` | string | `equal` \| `exact` |
| `created_at` | datetime | UTC; drives ordering and the sequential-membership rule |
| `updated_at` | datetime | UTC |

### `expense_share`

| Field | Type | Notes |
|---|---|---|
| `id` | string, PK | UUID |
| `expense_id` | string, FK → expense.id | Cascade delete |
| `member_id` | string, FK → member.id | Must belong to the same group |
| `amount_cents` | integer | ≥ 0 |

Unique constraint on (`expense_id`, `member_id`).

**Shares are stored, not derived.** The backend computes per-person amounts at save
time — including the rounding remainder — and writes them as rows. Three consequences,
all desirable:

- Equal and exact splits produce identical downstream shapes. Balance code never
  branches on `split_type`.
- `split_type` becomes metadata describing *how* rows were produced, not something
  any consumer must interpret.
- Adding or renaming a member can never retroactively alter a past expense.

**Invariant:** for every expense, `SUM(expense_share.amount_cents) == expense.amount_cents`.
This is the single most important assertion in the test suite.

### `settlement`

| Field | Type | Notes |
|---|---|---|
| `id` | string, PK | UUID |
| `group_id` | string, FK → group.id | Cascade delete |
| `from_member_id` | string, FK → member.id | Payer; same group |
| `to_member_id` | string, FK → member.id | Recipient; same group; ≠ `from_member_id` |
| `amount_cents` | integer | > 0 |
| `date` | date | User-supplied |
| `created_at` | datetime | UTC |
| `updated_at` | datetime | UTC |

Settlements sit outside the share table entirely and are applied directly in the
balance formula (§7.2).

---

## 6. Currency handling

One currency per group, fixed at creation, no conversion. Conversion requires a live
rate source and is out of scope (§10).

**v1 supports only currencies with exactly 2 decimal places.** Currencies with 0
minor units (JPY, KRW, ISK) or 3 (KWD, BHD, TND) would silently corrupt every
`amount_cents` value and all display formatting. The allowlist is validated at group
creation and rejected with `422` otherwise:

`USD, EUR, GBP, CHF, CAD, AUD, NZD, ZAR, SEK, NOK, DKK, PLN, CZK, MXN, BRL, INR, SGD, HKD, THB, TRY, ILS`

This restriction is documented in the UI at group creation, not hidden in a validation
error.

---

## 7. Calculation rules

### 7.1 Rounding

For an equal split of `total` among `n` participants:

1. `base = total // n` (integer floor division), assigned to every participant.
2. `remainder = total - (base * n)`, which is in `[0, n)`.
3. Distribute the remainder one minor unit at a time to participants **in ascending
   `position` order**, until exhausted.

So £10.00 across three participants yields 334 / 333 / 333, always in that order,
every recomputation.

Rounding is never silent: the expense detail view always shows the exact per-person
amount, so a user who is a penny up can see it.

Exact splits need no rounding — the user's figures are stored verbatim, and the
sum-to-total constraint is enforced at both ends.

### 7.2 Net balance

For each member:

```
net = SUM(expenses they paid)
    - SUM(their expense_share rows)
    + SUM(settlements they paid)
    - SUM(settlements they received)
```

Positive net means the group owes them. Negative means they owe the group.

**The nets across a group always sum to exactly zero.** This is a direct consequence
of the share invariant in §5 and should be asserted as a property in tests.

### 7.3 Simplified transfers

Greedy, largest-debtor to largest-creditor:

1. Compute nets. Discard zeros.
2. Split into debtors (negative) and creditors (positive).
3. Sort both by absolute amount descending, tie-broken by ascending `member.position`.
4. Repeatedly match the largest debtor to the largest creditor, transferring
   `min(|debt|, credit)`. Reduce both. Drop whichever reaches zero. Repeat until empty.

The tie-break on `position` is what makes the output deterministic and therefore
assertable in tests.

**On optimality — for the README, stated exactly this far and no further:**

> Exact optimisation requires searching over subsets of balances, which grows
> exponentially, so a greedy heuristic is used instead.

Do not claim NP-hardness or quote any complexity bound. Neither has been verified
against a primary source, and an unsourced bound in a writeup is a liability.

### 7.4 Raw pairwise balances

Computed without simplification: for each expense, every participant owes their share
amount to the payer. Sum across all expenses, net off reciprocal pairs, then apply
settlements between the same two members.

This view is what a suspicious user checks the simplified view against, so it must be
derivable from expense rows alone, with no reference to the greedy output.

---

## 8. Key user flows

### 8.1 Create a group and invite

1. Priya lands on `/`, enters a group name and picks a currency.
2. `POST /api/groups` returns a code; the client routes to `/g/{code}`.
3. Priya adds member names one at a time, up to 8.
4. She identifies herself from the picker; the id is stored locally.
5. She copies the link and sends it to the group.

### 8.2 Join

1. Sam opens `/g/{code}`.
2. Unknown code → a clear not-found state, not a crash or a blank page.
3. Known code → the identity picker, unless a valid stored id exists.
4. He picks himself; all copy becomes second-person from that point.

### 8.3 Add an equal expense

1. Sam taps *Add expense*.
2. Payer defaults to himself; participants default to everyone checked.
3. He enters amount, description, date; unchecks Ana, who wasn't there.
4. Save → `POST` → server computes shares with §7.1 rounding and persists them.
5. The list, the headline number, and the transfer suggestions all update.

### 8.4 Add an exact-amount expense

1. Ana picks *Exact amounts* and enters a per-person figure for each participant.
2. A running remainder updates live as she types.
3. Save stays disabled until the remainder is exactly zero.
4. Backend independently revalidates; a mismatch returns `422`.

### 8.5 Settle up

1. Priya opens *Settle up* and sees the suggested transfer list with its explanation.
2. She taps a suggestion; the form pre-fills from, to, and amount.
3. She overrides the amount to what was actually sent — possibly more than suggested.
4. Save → a settlement row → balances recompute. Overshoot correctly produces a
   reverse balance.

### 8.6 Two-browser sync *(the graded demo beat)*

1. Priya and Sam both have `/g/{code}` open, identified as different members.
2. Sam adds an expense.
3. Priya's browser, polling every 5 seconds, shows it within 5 seconds with no
   interaction.
4. Both refresh. Everything persists.

### 8.7 Edit after settling

1. Everyone is settled; the app shows *All settled up*.
2. Sam corrects Tuesday's dinner from $60 to $75.
3. Balances recompute freely. The settled state disappears, new transfers appear.
4. Nothing was locked; the settlement row is untouched and still counted.

---

## 9. API surface (indicative)

Per assignment Q5, the authoritative `openapi.yaml` is **derived from the frontend's
centralised API module** after the prototype is built. This list defines intent, not
the contract.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/groups` | Create; returns the code |
| `GET` | `/api/groups/{code}` | **Full snapshot** — group, members, expenses with shares, settlements, computed balances, suggested transfers |
| `POST` | `/api/groups/{code}/members` | Add |
| `PATCH` | `/api/groups/{code}/members/{id}` | Rename |
| `DELETE` | `/api/groups/{code}/members/{id}` | Delete; `409` if referenced |
| `POST` | `/api/groups/{code}/expenses` | Create; server computes and stores shares |
| `PUT` | `/api/groups/{code}/expenses/{id}` | Replace; recomputes shares |
| `DELETE` | `/api/groups/{code}/expenses/{id}` | Delete; cascades to shares |
| `POST` | `/api/groups/{code}/settlements` | Record a payment |
| `PUT` | `/api/groups/{code}/settlements/{id}` | Edit |
| `DELETE` | `/api/groups/{code}/settlements/{id}` | Delete |

One fat snapshot endpoint serves the poll. At 8 members and a realistic expense count
the payload is small, and a single request per tick is far simpler than reconciling
several.

Status codes: `404` unknown code or id; `422` validation failure; `409` member delete
blocked by references.

**Architectural requirement from Q5 → Q7:** all persistence sits behind a repository
interface from the first backend commit. Q5 ships an in-memory implementation; Q7
swaps in a SQLAlchemy one. Endpoint tests target the HTTP surface only, never the
storage layer — which is precisely what lets the same suite prove the swap was clean.

---

## 10. Out of scope for v1

Explicitly not built, and listed here so the decision is visible rather than looking
like an omission:

- Accounts, authentication, passwords, email
- Multi-currency and any currency conversion
- Percentage and share/weight split modes
- Multiple payers on a single expense
- Receipt photos, uploads, itemised receipt splitting
- Expense categories
- Recurring expenses
- Notifications of any kind, in-app or email
- Audit history and change log
- Real payment processing or integration with Venmo, PayPal, Stripe
- Offline support
- Native mobile apps
- Data export (CSV, PDF)
- Group archiving or deletion
- Owner or admin roles

Edit and delete are deliberately **in** scope: without them the app is write-only and
there is nothing interesting to test.

---

## 11. Known limitations

To be stated plainly in the README rather than discovered by a reviewer:

- **Anyone with the link has full access**, including deleting other people's
  expenses. Enforcing roles would require trustworthy identity, which means auth,
  which is out of scope. Half-building it would be worse than not building it.
- **Last-write-wins on concurrent edits.** Two browsers editing the same expense: the
  second save overwrites the first, silently. No version column, no optimistic
  locking, no conflict UI. The 5-second poll means the losing browser sees the winning
  value within seconds, which is acceptable at this scale. This is a decision, not an
  accident.
- **Simplified transfers are a greedy heuristic**, not provably minimal.
- **Only 2-decimal currencies are supported** (§6).
- **No rate limiting.** Group codes are guessable given enough attempts.
- **Group deletion is not implemented**, so groups accumulate indefinitely.

---

## 12. Success criteria

The build is done when all of the following hold:

**Functional**

1. A group can be created, shared by URL, and joined by a second browser with no login.
2. Equal and exact splits both work, over arbitrary participant subsets.
3. Exact splits cannot be saved unless shares sum to the total — enforced on both
   client and server.
4. Balances are correct and the group's nets sum to exactly zero after any sequence
   of operations.
5. Both simplified and raw pairwise views are available, and the simplified view
   carries its explanation.
6. Settlements can be added, edited, and deleted, and overshoot produces a reverse
   balance.
7. Members can be renamed always, and deleted only when unreferenced.
8. A change made in one browser appears in another within 5 seconds, with no
   interaction.
9. All data survives a full page refresh and a browser restart.

**Quality**

10. Rounding is deterministic: the same expense produces the same per-person split on
    every recomputation, verified by test.
11. The share-sum invariant holds for every expense, verified by test.
12. Endpoint tests are written before endpoint implementations (Q5) and pass unchanged
    after the SQLAlchemy swap (Q7).
13. No floating-point arithmetic touches money anywhere in the stack.
14. The app renders and functions when `localStorage` throws.

**Assignment**

15. Repo contains `_docs/specs.md`, `.gitignore`, `README.md`, `AGENTS.md`.
16. Backend uses `uv`; frontend is a Node/Vite project.
17. The database layer is swappable — SQLAlchemy, no database-specific column types.
18. The demo video shows: the main flow (add an expense, see who owes whom), the same
    group live in two browsers with a change propagating, and data surviving a refresh.

---

## 13. Assignment mapping

| Requirement | Where it lands |
|---|---|
| Q1 — pick a project | Expense splitter |
| Q2 — spec first, name the app | This document; name in §1 |
| Q3 — repo with `_docs/specs.md`, `.gitignore`, `README.md`, `AGENTS.md` | This file → `_docs/specs.md` |
| Q4 — frontend first, backend calls centralised and mocked | §9 defines the surface to mock; one API module, no `fetch` anywhere else |
| Q5 — derive `openapi.yaml`, FastAPI, `uv`, mock DB, tests first | §9, incl. the repository-layer requirement |
| Q6 — connect frontend and backend | Flows in §8 are the verification script |
| Q7 — real DB via SQLAlchemy, database-agnostic, tests still pass | §5 types, §9 repository interface |
| Demo beats | §8.3, §8.6 |

*Note: the assignment's Q4 spells the frontend directory `frontent/`. This is a typo
in the original; `frontend/` is used throughout.*
