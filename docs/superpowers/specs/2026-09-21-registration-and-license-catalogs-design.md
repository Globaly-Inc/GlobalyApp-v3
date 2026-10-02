# Feature: Admin-managed registration & license catalogs

Date: 2026-09-21
App: GlobalyApp-v3
Status: PENDING APPROVAL
Origin: PR review comment (@LikhitaMagar01) on `dev-feat-business-profile` — *"create a table to
insert these in superadmin db which should be shown inside categories tab rather than keeping it
in frontend const file."*

> **Stack note.** The `gh-architecture-docs` skill is written for React + Supabase (RLS, Edge
> Functions, TanStack Query, `src/pages/<portal>/`). This repo is Fastify 5 + Knex + Postgres
> (multi-schema, no RLS) and Next.js App Router + Redux Toolkit. Per that skill's own
> app-agnostic note, the process and gate below are its, the standards are `globalyapp-dev`'s.
> Wherever the skill says "RLS policy" read "route guard"; "Edge Function" read "service +
> repository"; "TanStack hook" read "slice + thunk".

## Goal

Both option lists in `frontend/src/app/business/profile/const/index.ts` become reference data an
admin edits in **Platform → Categories**, so adding a country's registration identifier or a new
accreditation body stops being a frontend deploy.

## Who it's for

- **Superadmin** — owns the catalogs in the Categories tab.
- **Business / institution owners** — consume them in the profile's Registration & Licenses card.

## What already exists (and changes the shape of this work)

The two halves of the comment are not symmetric. One needs a table; the other already has one.

| Const | Status today |
|---|---|
| `LICENSE_TYPE_OPTIONS` | **Already modelled.** `globalyapp.accreditations` (name, issuing org FK, website, description, `is_global`, moderation status, sort order) + `accreditation_scope_countries`. Already CRUD-ed in the Categories tab's **Accreditations** sub-tab, already seeded by `accreditations_seeder.ts`, and already served to businesses by `GET /businesses/accreditations`. |
| `COUNTRY_REGISTRATION_TYPES` / `DEFAULT_REGISTRATION_TYPES` | **No home anywhere.** No table, no endpoint, no admin screen. |

So: **one new table, not two.** Creating a parallel `license_types` table would leave an admin
guessing whether MARA belongs in Accreditations or License Types, and would split country scoping
across two mechanisms. Confirmed with the requester before writing this spec.

## Backend flow

1. Admin opens **Platform → Categories → Registration Types**.
2. `GET /superadmin/platform/categories/registration-types` lists rows (country, code, label, order, active).
3. Create/edit posts through the same service/repository pair the other catalogs use.
4. A business opens its profile → Registration & Licenses card.
5. `GET /businesses/registration-types?country_id=<profile.country_id>` returns that country's
   active rows, **falling back server-side** to the generic set when the country has none.
6. `GET /businesses/accreditations` (already live) fills the license-type picker.
7. Nothing about how a business *stores* its answers changes — `businesses.registration_licenses`
   stays the same `{ type, number }` JSON. Only the option lists move.

## Data design

**New table — `globalyapp.business_registration_types`**

| Column | Type | Notes |
|---|---|---|
| `id` | `increments` | |
| `country_id` | `int` FK → `countries(id)` `ON DELETE CASCADE`, **nullable** | `NULL` = the generic fallback row (today's `DEFAULT_REGISTRATION_TYPES`) |
| `code` | `text NOT NULL` | `"ABN"` — what lands in the profile JSON |
| `label` | `text NOT NULL` | `"ABN (11 digits)"` — what the picker shows |
| `sort_order` | `int NOT NULL DEFAULT 0` | |
| `is_active` | `bool NOT NULL DEFAULT true` | |
| `created_at` / `updated_at` | `timestamptz NOT NULL DEFAULT now()` | house convention |
| `deleted_at` | `timestamptz NULL` | soft delete, as every non-audit table here |

Constraints and indexes (named — the error handler branches on `err.constraint` for PG `23505`):

- `business_registration_types_country_code_unique` — unique on `(COALESCE(country_id, 0), code)`.
  A plain composite unique will **not** work: Postgres treats `NULL` as distinct, so the generic
  rows could be inserted twice.
- `business_registration_types_lookup_idx` on `(country_id, is_active, sort_order)`.

**Why a table and not a JSONB column on `countries`:** these rows are independently sortable,
deactivatable and soft-deletable, and the generic fallback set belongs to no country at all.

**Modified tables:** none. **Migrated data:** none — no business row is rewritten.

**Country keying.** The const keys by country *name* (`COUNTRY_REGISTRATION_TYPES["Australia"]`).
All seven names happen to match `world-countries.json` exactly today, so nothing is broken right
now — but the match is unenforced, and an upstream rename would silently drop every affected
business to the generic fallback with no error. The FK removes that class of failure.

## API design

**Admin** — new file `categories/routes/registration-types.routes.ts`, registered by the existing
`categoriesModule`, guarded by the module's existing admin scope:

| Method | Path | Notes |
|---|---|---|
| `GET` | `/registration-types` | paginated via `shared/pagination.ts`, optional `country_id`, `search` |
| `POST` | `/registration-types` | `RegistrationTypeInputSchema` |
| `PATCH` | `/registration-types/:id` | partial; also serves the active toggle |
| `DELETE` | `/registration-types/:id` | soft delete |

**Business** — one route added to the existing `businesses/routes/lookups.routes.ts`, `requireBusinessContext`:

| Method | Path | Notes |
|---|---|---|
| `GET` | `/registration-types?country_id=` | active rows only; **server applies the generic fallback** so the client never fetches twice or reimplements the rule |

Responses are explicit allow-lists (`id`, `code`, `label`, `country_id`, `sort_order`) — no row spreading.

## Frontend design

**Admin** (`src/app/admin/platform/categories/`)
- `CATEGORY_TABS` += `{ value: "registration_types", label: "Registration Types" }`, plus its
  `ADD_LABEL` and `TAB_DESCRIPTION` entries.
- `registration-type-list.tsx` + `registration-type-dialog.tsx` beside the existing
  `lookup-*` pair. They need a country column and a country `Combobox`, so they don't ride the
  shared lookup CRUD.
- `categories-slice.ts` += thunks and one list in the catalog state; register nothing new in
  `lib/store.ts` (the slice is already mounted).
- `apis/` gains its wire types, **mock rows, and real calls** — mock is the default
  (`NEXT_PUBLIC_MOCK_DATA !== "false"`), so the tab must work before the endpoint is deployed.

**Business** (`src/app/business/profile/`)
- `registration-licenses-card.tsx` fetches both catalogs instead of importing consts; the two
  consts are deleted from `const/index.ts`.
- **Both pickers must pin their saved value into the options list.** This is the same defect just
  fixed in `79c4a373`/`037a9e1e` for the category picker: a `Combobox` whose `value` matches no
  option silently renders the empty placeholder. Once these lists are admin-editable, any
  deactivated or renamed row would make an existing business's saved license read as blank — a
  regression the const version could never have.
- `"Other"` (today's `{ value: "Other", label: "Other", description: "Custom license type" }`) is
  a UI affordance, not catalog data. It stays client-side, appended after the fetched rows, so
  admins can't accidentally delete the escape hatch and rows already storing the literal
  `"Other"` keep resolving.

## Seeding

- `accreditations_seeder.ts` gains the agent-side bodies missing from its current six: MARA, QEAC,
  PIER, IRCC, CICC, IAA, OISC, ICEF, AIRC. **CRICOS is already there** as `"CRICOS Registered"` —
  match on it rather than inserting a second CRICOS row. The seeder is already idempotent
  (name-keyed `if (!exists)`), so it stays re-runnable. Country hints in the const's descriptions
  (AU/CA/NZ/UK/US) become `accreditation_scope_countries` rows; ICEF ("Global") sets `is_global`.
- New `business_registration_types_seeder.ts` carrying the 8 country sets + the generic row,
  resolving `country_id` by `iso2` (not name).

## Out of scope

- Moderation workflow for registration types. Accreditations carry `status`/`reviewed_by` because
  businesses can propose them; registration types are admin-only, so they get no status column.
- Format **validation** of the numbers themselves ("ABN (11 digits)" stays a label, not a regex).
  Worth a follow-up; it changes save behaviour and deserves its own decision.
- Backfilling or normalising values already stored in `registration_licenses`.
- Issuing-organization rows for the new accreditations (the seeder's existing TODO).

## Risks & open questions

1. **Blank-picker regression** — mitigated by the pin-the-saved-value rule above; it is a
   requirement of this change, not a nice-to-have.
2. **Two sources of truth during rollout** — the consts must be deleted in the same PR that lands
   the fetch, or the next contributor will edit the dead one.
3. **Unique index on a nullable FK** — the `COALESCE` form is deliberate; a reviewer seeing a
   plain composite unique should treat it as a bug.
4. **Open:** should `code` be globally unique per country, or may two countries share `"BN"`?
   Spec assumes per-country (Canada's BN and a future country's BN are different rows).
5. **Open:** does the institution portal need the same two pickers? This spec wires the business
   profile card only.

## Estimate

~11 files: 1 migration, 2 seeders, 4 backend (schema/repo/service/routes ×2 surfaces),
~4 frontend admin, 1 frontend business + const deletion.
