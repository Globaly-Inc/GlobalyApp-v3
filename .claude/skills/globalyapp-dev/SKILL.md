---
name: globalyapp-dev
description: Development conventions for the GlobalyApp-v3 monorepo (Fastify 5 + Knex/Postgres backend, Next.js 16 + Redux Toolkit frontend). Use for ANY code change in this repo — new module, route, migration, worker, feature page, component, bug fix, or review. Covers module shape, multi-schema DB rules, auth/tenant plumbing, queue workers, frontend feature structure, and the git/docs workflow.
---

# GlobalyApp-v3 development

Multi-tenant SaaS: `backend/` (Fastify 5, Knex, Postgres w/ pgvector, LavinMQ, Dragonfly) and
`frontend/` (Next.js 16 App Router, React 19, Redux Toolkit, Tailwind v4, base-ui/shadcn).
No root package.json — always `cd` into the workspace you're editing.

## Read before writing

1. `frontend/AGENTS.md` — binding for any frontend change (`frontend/CLAUDE.md` just points at it).
2. The nearest `CLAUDE.md` to the file you're touching (`backend/src/modules/auth/`,
   `backend/src/modules/superadmin/data-extraction/`) — module-local rules win over this skill.
3. The closest existing sibling. Every layer here has a canonical example; copy its shape rather
   than inventing one. Backend: `backend/src/modules/referrals/`. Frontend: `frontend/src/app/admin/overview/`.
4. Next.js 16 and React 19 differ from training data — check `frontend/node_modules/next/dist/docs/`
   before using an App Router API from memory.

`../GlobalyApp` and `../GlobalyApp-V2` are **read-only reference** for how v1/v2 did something.
Never write there.

## Backend

Module = one folder under `backend/src/modules/<name>/`:

```
index.ts        default export = Fastify plugin registering route files under /api/v3/<name>;
                named export <name>PublicModule for unauthenticated routes
routes/         HTTP handlers only — parse, call service/repo, reply
services/       business logic
repositories/   Knex queries, exported functions + row interfaces
schemas/        zod schemas (+ inferred types)
consts.ts       enums/unions shared across the module
utils/          pure helpers
workers/        LavinMQ consumers (separate processes)
lib/            heavy internals (LLM clients, scrapers, writers) when a module needs them
```

Register the module in `backend/src/server.ts`. Inside the `protectedApp` scope it gets auth +
tenant hooks; public modules are registered **outside** that scope so they can never acquire the
auth hook (`publicReferralsModule`, `blogModule`, `geoModule`, …). A stale comment in
`referrals/index.ts` mentions `config: { public: true }` — that mechanism does not exist;
the only two ways to be public are outside-the-scope registration or the `publicPaths` set in
`core/plugins/auth.plugin.ts`.

Non-negotiables:

- **ESM with explicit `.js` extensions** on every relative import (`Node16` resolution), `type: "module"`.
- **Throw, don't hand-build error bodies**: `AppError` subclasses from `shared/errors.ts`
  (`NotFoundError`, `ForbiddenError`, `ConflictError`, `BadRequestError`, `PaymentRequiredError`,
  `TooManyRequestsError`). `core/plugins/error-handler.plugin.ts` maps them, plus ZodError,
  Fastify validation, multipart size, and PG `23505`. `reply.status(...)` directly is for
  preHandler guards only.
- **Validate input with zod** from `schemas/`. Paginate with `shared/pagination.ts`
  (`PaginationSchema`, `paginationToOffset`, `buildPaginatedResponse`).
- **Pick the right Knex handle**: `masterKnex` (`core/db/master-pool.ts`) for the `globalyapp`
  schema; `masterKnex("superadmin.<table>")` for superadmin tables; `req.db` — set by
  `tenant.plugin.ts` from the JWT `orgId` — for per-business tenant schemas. Never open a pool by hand;
  `core/db/pool-manager.ts` owns tenant pools and their eviction.
- **Guards as preHandlers**: `requireAdmin`, `requireBusinessContext`,
  `requirePermission("module:action")` from `core/plugins/auth.plugin.ts`.
- **Response shape is an explicit allow-list.** Never spread a DB row into a reply, especially on
  public endpoints — select the columns you mean to expose (see `referrals.schema.ts`).
- **Log via `createChildLogger("<name>")`** from `shared/logger.ts`. No `console.log`.
- Shared services live in `shared/`: `queue/queueService.ts`, `mail/mailerService.ts`,
  `storage/storageService.ts`, `ai/gemini.ts`, `google-places/placesService.ts`, `cache` via
  `core/cache/dragonfly.ts`. Check there before adding a dependency.

## Database & migrations

Four migration sets under `backend/database/migrations/`: `globalyapp` (central), `superadmin`,
`business` (per-tenant schema template), `institution`. Knex envs in `backend/knexfile.ts`.
Tenant schemas are applied by `src/workers/migration-runner.ts` (`npm run migrate:tenants`).

- **Append-only. Never edit or delete an applied migration** — staging databases are already
  migrated. Every change, however small, is a new file: `YYYYMMDD_NNN_<subject>.ts` with real
  `up` **and** `down`.
- Migrate order matters on a fresh DB: `globalyapp` → `superadmin` (superadmin FKs into it, and
  globalyapp's last migration adds the cross-schema FKs back).
- Table conventions: `timestamptz NOT NULL DEFAULT now()` for `created_at`/`updated_at`,
  `deleted_at` soft delete on everything except append-only audit tables, **named** constraints
  and indexes when code branches on `err.constraint`, and constraints in the DB rather than
  check-then-insert in app code.
- **The user runs DB commands themselves.** Write the migration; don't run `migrate`/`seed` — say
  which command to run.

## Workers & queues

A worker is a standalone process consuming a LavinMQ queue via `queueService.consume(...)`, with
queue names in a module-level `shared/queues.ts` constant. Adding one means four edits:
the worker file, a `job:<name>` script in `backend/package.json`, a service (+ profile) in
`docker-compose.yml`, and `up-`/`down-`/`logs-` targets in the `Makefile`.

## Frontend

`frontend/AGENTS.md` is the spec — follow it exactly. The parts most often broken:

- Feature folder at its route with **all** of `apis/ store/ const/ types/ utils/ components/` as
  folders, plus `layout.tsx` and a thin `page.tsx`. Skip a folder only when it would be genuinely empty.
- `apis/` = `types.ts` (wire types) + `mock-data.ts` + `real-api.ts` (`httpGet`/`httpPost`/… from
  `@/lib/api/http`) + `index.ts` exporting `createApi({ mock, real })`. Mock is the default
  (`NEXT_PUBLIC_MOCK_DATA !== "false"`), so build the mock even before the endpoint exists.
- One `createSlice` + `createAsyncThunk` per feature with `status: "idle"|"loading"|"failed"`,
  and **register the reducer in `frontend/src/lib/store.ts`** under a unique key.
- Mount fetches must be `useRef`-guarded — Strict Mode double-invokes effects.
- Reuse `@/components/...` before writing a component; generic → `src/components/`,
  feature-specific → the feature's `components/`.
- `Combobox` over `Select` for dropdowns; never wrap a Combobox in `space-y-*` (use `flex flex-col gap-*`).
- ≤300 lines per file — split into components instead of growing one.

## Workflow

- Branch from `staging` (the default branch): `product-feat-*`, `product-hotfix-*`, or the
  `dev-feat-*` convention used by recent PRs. Merge back via PR.
- Feature docs land in `docs/<area>/YYYY-MM-DD-<feature>-{prd,design,impl-plan}.md`. For anything
  non-trivial the house pipeline is brainstorm → PRD → architecture → implementation plan → code
  (`gh-*` skills); don't skip straight to code on a new module.
- Local dev: `make up` / `make logs-backend` (Docker), or `npm run dev` in each workspace.
  Lint with `npm run lint`; typecheck the backend with `npm run build` (`tsc`). There is no test
  runner — `backend/tests/*.ts` are standalone scripts run via `npm run test:<name>`.
