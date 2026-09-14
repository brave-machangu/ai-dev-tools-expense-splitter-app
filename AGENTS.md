# AGENTS.md

Instructions for coding agents working in this repository. Read
[`_docs/specs.md`](_docs/specs.md) before making product or data-model decisions —
it is the source of truth.

## Folder layout

```
_docs/specs.md      Product specification (source of truth)
frontend/           React + Vite app (TanStack Start / Router, Tailwind, shadcn/ui)
  src/lib/api.ts    THE single API client module (see rule below)
  src/lib/          Pure logic: money, calc, identity, types, mock backend
  src/components/   quits/ = app components, ui/ = generated shadcn primitives
  src/routes/       File-based routes (routeTree.gen.ts is generated — never edit)
backend/            FastAPI service, managed with uv (not started yet)
```

Run frontend commands from `frontend/` and backend commands from `backend/`.

## Package managers

- **Frontend: npm.** Use `npm install` / `npm install <pkg>`. Do not use yarn, pnpm or
  bun; commit `package-lock.json`.
- **Backend: uv.** Use `uv sync` and `uv add <pkg>` (`uv add --dev <pkg>` for dev
  tools). Run everything through `uv run …`. Never `pip install` directly; commit
  `uv.lock`.

## The API client rule

**All backend calls from the frontend go through `frontend/src/lib/api.ts`.**

- No `fetch`, `axios`, or other HTTP calls anywhere else in the frontend. Components,
  hooks and routes import `api` from `@/lib/api` and nothing lower.
- Until the backend exists, `api.ts` delegates to `src/lib/mock-backend.ts`. Switching
  to the real backend means changing the bodies in `api.ts` only — function signatures
  and return types must stay the same.
- New endpoints are added to `api.ts` first, matching §9 of the spec. `openapi.yaml`
  is derived from this module.
- The only other `fetch` in the frontend is the SSR handler in `src/server.ts`; it is
  not a backend call and must stay that way.

## Code style

### General

- **Money is integer minor units (cents) everywhere.** No floats for money in
  TypeScript, Python, or the database. Parse and format only at the UI edge
  (`src/lib/money.ts` on the frontend).
- **Determinism matters.** Rounding remainders and transfer tie-breaks use member
  `position` (spec §7). Don't introduce ordering that depends on object/dict iteration
  or timestamps.
- Keep changes scoped to the task; don't reformat unrelated files.

### Frontend (TypeScript / React)

- Prettier config in `frontend/.prettierrc`: 100-char lines, double quotes,
  semicolons, trailing commas. ESLint config in `frontend/eslint.config.js`.
- TypeScript is `strict` with `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes` — handle `undefined` rather than using `!` or `any`.
- Import via the `@/` alias (maps to `frontend/src/`).
- Don't hand-edit `src/components/ui/*` beyond small tweaks; put app UI in
  `src/components/quits/`.
- `vite.config.ts` uses `@lovable.dev/vite-tanstack-config`, which already registers
  React, TanStack, Tailwind and path plugins. Don't add them again.
- Every `localStorage` access is wrapped in try/catch (spec F3).

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
npm run lint          # ESLint + Prettier check
npx tsc --noEmit      # type check
npm run build         # production build
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
