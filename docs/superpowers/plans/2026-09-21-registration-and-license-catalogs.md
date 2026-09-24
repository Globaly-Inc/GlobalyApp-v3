# Plan: Admin-managed registration & license catalogs

Spec: `docs/superpowers/specs/2026-09-21-registration-and-license-catalogs-design.md`
Status: BLOCKED on spec approval — no code until then.

Order matters: backend and seeders first, so the admin tab and the business card are built
against a live endpoint rather than a guess.

## 1 — Database

- [ ] `backend/database/migrations/globalyapp/20260921_001_business_registration_types.ts`
      — create table, named unique on `(COALESCE(country_id, 0), code)`, lookup index, real `down`.
- [ ] `backend/database/seeders/globalyapp/business_registration_types_seeder.ts`
      — 8 country sets + the generic row, `country_id` resolved by `iso2`, idempotent.
- [ ] Extend `backend/database/seeders/globalyapp/accreditations_seeder.ts`
      — MARA, QEAC, PIER, IRCC, CICC, IAA, OISC, ICEF, AIRC. Match existing `"CRICOS Registered"`
      instead of adding a second CRICOS. Scope countries + `is_global` for ICEF.
- [ ] Hand the user the exact `migrate` / `seed` commands — **do not run them** (house rule).

## 2 — Backend: admin CRUD

- [ ] `categories.schema.ts` += `RegistrationTypeInputSchema` (+ partial for PATCH).
- [ ] `categories.repository.ts` += list/count/find/create/update/soft-delete, `masterKnex`,
      country join for the list's display name.
- [ ] `categories.service.ts` += the matching functions; `NotFoundError` on a missing id.
- [ ] `categories/routes/registration-types.routes.ts` + register in `categories/index.ts`.
- [ ] Explicit response allow-list; paginate via `shared/pagination.ts`.

## 3 — Backend: business read

- [ ] `businesses/routes/lookups.routes.ts` += `GET /registration-types?country_id=`,
      `requireBusinessContext`, active-only, **generic fallback applied server-side**.
- [ ] `npm run build` in `backend/` (tsc) — the repo's typecheck gate.

## 4 — Frontend: admin tab

- [ ] `categories/apis/types.ts` += `RegistrationType` / `RegistrationTypeInput`.
- [ ] `categories/apis/mock-data.ts` += rows (mock is the default — the tab must work without the API).
- [ ] `categories/apis/real-api.ts` += the four calls.
- [ ] `categories/store/categories-slice.ts` += thunks + catalog list + reducers.
- [ ] `categories/const/index.ts` += tab, add-label, description entries.
- [ ] `components/registration-type-list.tsx` + `registration-type-dialog.tsx`
      (country `Combobox`; `flex flex-col gap-*`, never `space-y-*` around a Combobox).
- [ ] Wire both into `categories-view.tsx`. Keep every file ≤300 lines.

## 5 — Frontend: business card

- [ ] `business/profile/apis/` += `getRegistrationTypes` / `getAccreditations` (types, mock, real).
- [ ] `registration-licenses-card.tsx` — fetch both catalogs, `useRef`-guarded (Strict Mode).
- [ ] **Pin the saved value into both pickers** so a deactivated or renamed row never renders as
      the empty placeholder (same defect class as `79c4a373`).
- [ ] Keep `"Other"` client-side, appended after the fetched license rows.
- [ ] Delete `COUNTRY_REGISTRATION_TYPES`, `DEFAULT_REGISTRATION_TYPES`, `LICENSE_TYPE_OPTIONS`
      from `business/profile/const/index.ts` **in this same change** — no dead second source.
- [ ] `npm run lint` + `npx tsc --noEmit` in `frontend/`.

## 6 — Verify

- [ ] Admin: add / edit / reorder / deactivate a registration type; confirm it appears in a
      business profile whose country matches, and that an unlisted country gets the generic row.
- [ ] Business: existing saved values (`ABN`, `MARA`, a literal `Other`) still render as their
      label after the switch, including one deactivated server-side.
- [ ] Both `NEXT_PUBLIC_MOCK_DATA` modes.
- [ ] Reply on the PR thread with what landed and why the license half reused Accreditations.

## Not in this plan

Number-format validation, moderation for registration types, issuing-organization rows,
institution-portal pickers. See the spec's Out of Scope.
