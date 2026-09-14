# ProRata

*Split expenses pro rata. Settle up in the fewest payments.*

ProRata is a no-account expense splitter for small, short-lived groups — a trip, a
weekend, a dinner series. One person creates a group and shares a link; anyone with
the link picks who they are from a list of names, adds expenses, and sees at a glance
who owes whom and the shortest set of payments that settles everyone up. ProRata
records that a payment happened — it never moves money. The full specification lives
in [`_docs/specs.md`](_docs/specs.md).

## Stack

| Layer    | Technology                                                  |
| -------- | ----------------------------------------------------------- |
| Frontend | React + TypeScript + Vite, plain CSS, managed with npm      |
| Backend  | FastAPI, managed with [uv](https://docs.astral.sh/uv/)      |
| Database | SQLite via SQLAlchemy (kept database-agnostic)              |

## Repository layout

```
_docs/      Specification and project docs
frontend/   React + Vite app
backend/    FastAPI service
```

## Getting started

### Prerequisites

<!-- TODO: Node.js version, uv install -->

### Frontend

<!-- TODO: install and run instructions -->

### Backend

<!-- TODO: install, run, and test instructions -->
