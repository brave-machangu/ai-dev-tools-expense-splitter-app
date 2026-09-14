# AGENTS.md

Instructions for coding agents working in this repository. Read
[`_docs/specs.md`](_docs/specs.md) before making product or data-model decisions —
it is the source of truth.

## Folder layout

```
_docs/specs.md              Product specification (source of truth)
frontend/                   React + TypeScript + Vite, plain CSS
  src/types.ts              ALL domain and API types — the only place they are defined
  src/api/client.ts         THE single API client module (see rule below)
  src/api/mock/             In-memory mock server; imported ONLY by client.ts
  src/domain/               Pure logic: money parsing/formatting, split + balance maths
  src/hooks/                React hooks (snapshot polling)
  src/lib/                  Small browser helpers (identity in localStorage, routing)
  src/components/           Reusable UI and group-screen components
  src/pages/                Top-level screens (home, group)
  src/styles/global.css     Design tokens and all styles
backend/                    FastAPI service, managed with uv (not started yet)
```

Run frontend commands from `frontend/` and backend commands from `backend/`.

## Package managers

- **Frontend: npm.** Use `npm install` / `npm install <pkg>`. Do not use yarn, pnpm or
  bun; commit `package-lock.json`.
- **Backend: uv.** Use `uv sync` and `uv add <pkg>` (`uv add --dev <pkg>` for dev
  tools). Run everything through `uv run …`. Never `pip install` directly; commit
  `uv.lock`.

## The API client rule

**All backend calls from the frontend go through `frontend/src/api/client.ts`.**

- No `fetch`, `axios`, `XMLHttpRequest` or other HTTP calls anywhere else in the
  frontend. Components, hooks and pages import `api` from `src/api/client.ts` and
  nothing lower. ESLint enforces this.
- Until the backend exists, `client.ts` delegates to the in-memory mock in
  `src/api/mock/`. Switching to the real backend means rewriting the bodies in
  `client.ts` only — function signatures and return types must stay the same — and
  then deleting `src/api/mock/`.
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
- All persistence sits behind a repository interface from the first commit: an
  in-memory implementation first, SQLAlchemy later. Routes never touch the storage
  layer directly.
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
uv run pytest         # full test suite
uv run ruff check     # lint
uv run ruff format --check
```

- Write endpoint tests **before** endpoint implementations.
- Endpoint tests hit the HTTP surface only (FastAPI `TestClient`), never the
  repository, so the same suite passes after the in-memory → SQLAlchemy swap.
- Required properties: the share-sum invariant holds for every expense, and group nets
  sum to exactly zero.

Before calling a task done, run the relevant commands above and make sure they pass.
