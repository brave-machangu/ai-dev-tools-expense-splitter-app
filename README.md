# Quits

Quits is a no-account web app for splitting shared costs within a small, short-lived
group — a trip, a weekend, a dinner series. One person creates a group and shares a
link; anyone with the link picks who they are from a list of names, adds expenses, and
sees at a glance who owes whom and the shortest set of payments that settles everyone
up. The app records that a payment happened — it never moves money. The full
specification lives in [`_docs/specs.md`](_docs/specs.md).

## Planned stack

| Layer    | Technology                                                  |
| -------- | ----------------------------------------------------------- |
| Frontend | React + TypeScript + Vite, plain CSS, managed with npm      |
| Backend  | FastAPI, managed with [uv](https://docs.astral.sh/uv/)      |
| Database | SQLite via SQLAlchemy (kept database-agnostic)              |

## Repository layout

```
_docs/      Specification and project docs
frontend/   React + Vite app
backend/    FastAPI service (not started yet)
```

## Getting started

### Prerequisites

<!-- TODO: Node.js version, uv install -->

### Frontend

<!-- TODO: install and run instructions -->

### Backend

<!-- TODO: install, run, and test instructions -->
