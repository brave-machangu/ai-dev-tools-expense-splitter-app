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

- [uv](https://docs.astral.sh/uv/getting-started/installation/). It installs the Python
  version the backend needs (3.14, from `backend/.python-version`) if it's missing.
- Node.js 20.19+ or 22.12+ (required by Vite), with npm.

### Backend

```sh
cd backend
uv sync
uv run fastapi dev app/main.py   # http://localhost:8000, API docs at /docs
```

Data is stored in SQLite at `backend/prorata.db`, which is created on first start and
survives restarts. Tests and lint:

```sh
uv run pytest        # every endpoint test runs against both in-memory and SQL storage
uv run ruff check
```

### Frontend

Start the backend first, then:

```sh
cd frontend
npm install
npm run dev          # http://localhost:5173
```

The frontend expects the backend at `http://localhost:8000`. To point it elsewhere, copy
`frontend/.env.example` to `frontend/.env.local` and set `VITE_API_BASE_URL`.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | SQLite file `backend/prorata.db` | SQLAlchemy URL of the backend database |
| `TEST_DATABASE_URL` | Throwaway SQLite file in pytest's temp dir | Database for the SQL test runs |
| `PRORATA_CORS_ORIGINS` | `http://localhost:5173` | Comma-separated origins the backend allows |
| `VITE_API_BASE_URL` | `http://localhost:8000` | Backend base URL used by the frontend |

**PostgreSQL.** No code changes: from `backend/`, run `uv add "psycopg[binary]"`, then
set `DATABASE_URL=postgresql+psycopg://user:pass@localhost:5432/prorata`.

**Schema changes.** Tables are created at startup, and existing tables are never altered.
There are no migrations yet, so after changing the schema, delete `backend/prorata.db`.

**Test database.** The suite drops and recreates every table in `TEST_DATABASE_URL`, so
only use a database you're happy to lose. It refuses to run against `DATABASE_URL`.
