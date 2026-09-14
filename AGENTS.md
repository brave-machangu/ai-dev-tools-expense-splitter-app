# AGENTS.md

**This repository is ProRata, an expense splitter.** Groups share a link, members add
expenses, and ProRata shows who owes whom and the payments that settle everyone up.
The git repository is still named `ai-dev-expense-splitter-app`; that is expected.

Instructions for coding agents working in this repository. Read
[`_docs/specs.md`](_docs/specs.md) before making product or data-model decisions —
it is the source of truth.

## Naming

- Display name: **ProRata** (one word, capital P, capital R). Never "Pro Rata",
  "Prorata" or "PRORATA" in user-facing text.
- Identifier form: `prorata` — package names, folders, the `prorata.` localStorage key
  prefix. Environment variables use the `PRORATA_` prefix.
- Tagline: *Split expenses pro rata. Settle up in the fewest payments.*
- Database: the default SQLite file is `backend/prorata.db`, anchored to the `backend/`
  directory rather than the working directory. Override it with `DATABASE_URL`.

## Folder layout

```
openapi.yaml                API contract (OpenAPI 3.1); tests validate responses against it
_docs/specs.md              Product specification (source of truth)
frontend/                   React + TypeScript + Vite, plain CSS
  src/types.ts              ALL domain and API types — the only place they are defined
  src/api/client.ts         THE single API client module (see rule below)
  src/domain/               Pure logic: money parsing/formatting, split + balance maths
  src/hooks/                React hooks (snapshot polling)
  src/lib/                  Small browser helpers (identity in localStorage, routing)
  src/components/           Reusable UI and group-screen components
  src/pages/                Top-level screens (home, group)
  src/styles/global.css     Design tokens and all styles
backend/                    FastAPI service, managed with uv
  app/main.py               create_app(repository): wiring, CORS, error handlers, startup
  app/routes.py             One thin handler per operation in openapi.yaml
  app/schemas.py            Pydantic request/response models (mirror openapi.yaml)
  app/service.py            Business rules; talks to storage only via Repository
  app/repository.py         Repository protocol + InMemoryRepository
  app/sqlalchemy_repository.py  SqlAlchemyRepository, the one the running server uses
  app/database.py           DATABASE_URL, engine setup, create_schema
  app/tables.py             SQLAlchemy tables (portable column types only)
  app/models.py             Storage records (dataclasses) both repositories load and save
  app/calc.py               Pure split/balance maths (must match frontend results)
  tests/                    Endpoint tests via TestClient, run against both repositories
```

Run frontend commands from `frontend/` and backend commands from `backend/`.

## Package managers

- **Frontend: npm.** Use `npm install` / `npm install <pkg>`. Do not use yarn, pnpm or
  bun; commit `package-lock.json`.
- **Backend: uv.** Use `uv sync` and `uv add <pkg>` (`uv add --dev <pkg>` for dev
  tools). Run everything through `uv run …`. Never `pip install` directly; commit
  `uv.lock`.

## Configuration

All settings are environment variables with working local defaults.

| Variable | Read by | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | backend | SQLite file `backend/prorata.db` | SQLAlchemy URL of the database the server uses |
| `TEST_DATABASE_URL` | `uv run pytest` | Throwaway SQLite file in pytest's temp dir | Database for the `[sqlalchemy]` test runs; must differ from `DATABASE_URL` |
| `PRORATA_CORS_ORIGINS` | backend | `http://localhost:5173` | Comma-separated browser origins allowed by CORS |
| `VITE_API_BASE_URL` | frontend (build time) | `http://localhost:8000` | Backend base URL, no trailing slash; see `frontend/.env.example` |

- The default SQLite path is anchored to `backend/`, so starting the server from another
  directory never creates a second, empty database.
- PostgreSQL is a configuration change, not a code change: run
  `uv add "psycopg[binary]"`, then set
  `DATABASE_URL=postgresql+psycopg://user:pass@localhost:5432/prorata`.
- Tables are created at server startup with `create_all`, which never alters existing
  tables. There are no migrations (no Alembic yet), so after changing `app/tables.py`
  delete `backend/prorata.db` or add a migration tool.
- The test suite drops and recreates every table in `TEST_DATABASE_URL`. Only point it at
  a database you're happy to lose. The suite refuses to run if it equals `DATABASE_URL`.

## The API client rule

**All backend calls from the frontend go through `frontend/src/api/client.ts`.**

- No `fetch`, `axios`, `XMLHttpRequest` or other HTTP calls anywhere else in the
  frontend. Components, hooks and pages import `api` from `src/api/client.ts` and
  nothing lower. ESLint enforces this.
- `client.ts` calls the FastAPI backend with `fetch` at `VITE_API_BASE_URL`. Its
  function signatures and return types are the contract the rest of the frontend relies
  on; change them only together with `openapi.yaml` (repository root) and the backend.
- New endpoints are added to `client.ts` first, matching §9 of the spec.
  `openapi.yaml` is derived from this module.

## Code style

### General

- **Money is integer minor units (cents) everywhere.** No floats for money in
  TypeScript, Python, or the database. Parse and format only at the UI edge
  (`src/domain/money.ts` on the frontend).
- **Determinism matters.** Rounding remainders and transfer tie-breaks use member
  `position` (spec §7). Don't introduce ordering that depends on object/dict iteration
  or timestamps.
- Keep changes scoped to the task; don't reformat unrelated files.

### Frontend (TypeScript / React)

- Prettier config in `frontend/.prettierrc`: 100-char lines, double quotes,
  semicolons, trailing commas. ESLint config in `frontend/eslint.config.js`.
- TypeScript is `strict` with `noUncheckedIndexedAccess` — handle `undefined` rather
  than reaching for `!` or `any`.
- Function components and hooks only. No UI framework or CSS framework: styles live in
  `src/styles/global.css` and use its CSS custom properties (colour, spacing, radius).
- Domain types are added to `src/types.ts`, never redeclared locally.
- Every `localStorage` access is wrapped in try/catch (spec F3).
- No `window.alert` / `confirm` / `prompt`; use in-app confirmation UI.

### Backend (Python / FastAPI)

- Python with type hints throughout; Pydantic models for request/response bodies.
- Format and lint with Ruff: `uv run ruff format` and `uv run ruff check`.
- All persistence sits behind the `Repository` protocol, with two implementations:
  `InMemoryRepository` and `SqlAlchemyRepository`. A storage change must keep both
  passing the same suite. Routes never touch the storage layer directly.
- SQLAlchemy models use only portable column types (no database-specific types).
- Status codes follow the spec: `404` unknown code/id, `422` validation, `409` member
  delete blocked by references.

## Testing commands

### Frontend (from `frontend/`)

```sh
npm run lint          # ESLint (includes the API client rule)
npm run typecheck     # tsc --noEmit
npm run build         # type check + production build
```

No unit test runner is configured yet. If you add one, use Vitest and expose it as
`npm test`.

### Backend (from `backend/`)

```sh
uv run fastapi dev app/main.py   # dev server on http://localhost:8000 (API docs at /docs)
uv run pytest                    # full test suite
uv run ruff check                # lint
uv run ruff format --check
```

- Write endpoint tests **before** endpoint implementations.
- Endpoint tests hit the HTTP surface only (FastAPI `TestClient`), never the
  repository. The `client` fixture runs every endpoint test twice, as `[memory]` and
  `[sqlalchemy]`, and both must pass.
- `uv run pytest` never touches the dev database; see `TEST_DATABASE_URL` under
  Configuration.
- Required properties: the share-sum invariant holds for every expense, and group nets
  sum to exactly zero.

Before calling a task done, run the relevant commands above and make sure they pass.
