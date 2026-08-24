# Other Service Category — configurable booking requirements

Date: 2026-08-23 · Branch: `dev-feat-menu-ui-revamp`

## 1. What already exists (discovery)

The generic configuration system asked for is **already the shape of this codebase**. It was not
missing; it was incomplete. Nothing new was invented where something existed.

### The two category concepts are already separate tables

| Concept | Table | Migration | Used by |
|---|---|---|---|
| Super Admin **Service** Category | `service_categories` | pre-existing | business default-services taxonomy, `business_services` |
| **Other** Service Category | `other_service_categories` | `20260722_003_other_service_categories.ts` | Earn → My Services marketplace (`other_service_listings.other_category_id`) |

`other_service_listings` FKs to `other_service_categories`, never to `service_categories`.
The separation is structural and was left untouched.

### Requirements are already stored, in one polymorphic table

`schema_fields` (`20260811_007_schema_fields.ts`) is keyed by `(entity_type, entity_id, key)` with
`entity_type ∈ {business_categories, service_categories, other_service_categories}`. The superadmin
category editor already writes rows for all three. So an Other Service Category's booking questions
are already rows an admin creates — not a code change.

**Decision: extend `schema_fields`, do not add `other_service_category_fields`.** A parallel table
would be the duplicate architecture the brief forbids (§13, §Phase 9). Separation is preserved by
the `entity_type` discriminator, and the new booking-only field *types* are rejected by zod for the
other two entity types, so the Super Admin Service Category surface cannot be reached by this change.

### Already working end to end

- `superadmin/platform/categories` — CRUD for other-service categories and their schema fields, behind
  `platformModule`'s `onRequest` role guard (`super_admin | data_admin`). Personal users get 403.
- `other-services/repositories/services.repository.ts::listBookingFields` — reads the category's fields.
- `public-services.service.ts::getOne` — returns `booking_fields` with the listing, one request.
- `booking.service.ts::validateAnswers` — server-side validation: required, per-type coercion, option
  membership, and **rejects unknown keys** so a buyer cannot write arbitrary jsonb.
- `booking-dialog.tsx` — the buyer form is generated from `booking_fields`. No category branching
  anywhere; grep for `airport` in app code returns only seed/mock names.
- Historical integrity already handled: answers are snapshotted into `other_service_orders.booking_answers`
  (jsonb) and `describeAnswers` re-pairs them with labels at read time, rendering answers to
  since-deleted questions as unlabelled orphans rather than hiding them.

### V1 reference (`D:\Globalyhub\GlobalyApp`)

V1 (Vite + Supabase) has no other-services marketplace and no booking-requirements concept. Nothing
to port; no V1 architecture was copied.

## 2. Gaps this change closes

| # | Gap | Fix |
|---|---|---|
| 1 | No ordering — fields ordered by `id`, the grip handle in the admin UI was decorative | `display_order` column, backfilled from `id`; reorder endpoint; up/down buttons |
| 2 | No `placeholder`, `help_text`, `default_value` | three nullable columns |
| 3 | No validation rules (brief's "passengers must be at least 1") | `validation` jsonb: `min`, `max`, `min_length`, `max_length`, `pattern` |
| 4 | Only 6 field types | + `long_text`, `time`, `datetime`, `email`, `phone`, `radio`, `checkbox` — other-service categories only |
| 5 | Admin copy was developer-facing ("Schema Fields", "businesses will fill in") | other-service kind reads "Booking Requirements" / "What should the customer tell the provider?" |
| 6 | No preview | preview renders through the *same* component the buyer sees |
| 7 | Buyer form and admin preview would duplicate the renderer | one shared `booking-requirement-field.tsx` |

## 3. Presentation variants, not new data shapes

`radio` stores and validates exactly like `select`; `checkbox` like `multi_select`. Two data shapes,
four admin-facing presentations. No fifth code path.

## 4. Deliberately not built

- **File upload.** `booking_answers` is a jsonb map of scalars; a real upload needs the multipart +
  storage-path + signed-URL path that listings covers use. Out of scope of a field-config change.
- **Cross-field rules** ("end date after start date"). No requirement stated it; a per-field config
  cannot express it.

## 5. Backward compatibility

New columns are nullable or defaulted. A category with zero fields renders a plain confirm dialog and
`validateAnswers` accepts `{}` — the existing behaviour, unchanged. `display_order` is backfilled to
`id`, so every existing category's field order is byte-identical after migration.

## 6. What changed

**Database** — one additive migration.
- `backend/database/migrations/globalyapp/20260823_001_schema_fields_booking_requirements.ts`
  adds `display_order` (backfilled from `id`), `placeholder`, `help_text`, `default_value`, `validation`
  to `schema_fields`, plus a `(entity_type, entity_id, display_order, id)` index.

**Backend**
- `categories.schema.ts` — `CORE_SCHEMA_FIELD_TYPES` / `BOOKING_ONLY_SCHEMA_FIELD_TYPES`,
  `SchemaFieldValidationSchema`, the new field columns, `SchemaFieldOrderSchema`.
- `categories.service.ts` — `assertFieldTypeAllowed` (the wall between the two category systems, checked on
  both create and update) and `reorderSchemaFields`.
- `categories.repository.ts` — order by `display_order, id` everywhere, new columns in the `json_agg`,
  new fields append to the end, `reorderSchemaFields` scoped to `(entity_type, entity_id)`.
- `categories.routes.ts` — `PUT /admin/platform/:entityType/:entityId/schema-fields/order`.
- `other-services/services.repository.ts` — `listBookingFields` selects the new columns and honours the order.
- `other-services/booking.service.ts` — the extra types, bound/pattern enforcement, and
  `validateAgainstFields` split out so the rules are testable without a DB.

**Super Admin**
- `booking-requirements-panel.tsx` — "Booking Requirements" + "Booking Form Preview", other-service only.
- `booking-requirements-preview.tsx` — live preview through the buyer's own renderer.
- `schema-field-row.tsx` / `schema-field-booking-options.tsx` — one field's controls, reorder, bounds.
- `schema-fields-editor.tsx` — rewritten as orchestration; adds reorder and non-technical copy.

**Personal Portal**
- `frontend/src/components/booking-requirement-field.tsx` — the one place a requirement becomes a control,
  used by both the buyer's dialog and the Super Admin preview. `DatePicker` and `Combobox` per AGENTS.md.
- `booking-dialog.tsx` — now ~120 lines of composition; defaults are layered at render time, no effect.

**Tests** — `backend/tests/other-service-booking-requirements.ts` (46 assertions):
complete/incomplete submissions, malformed values, configured bounds, unknown keys, empty configuration,
every new field type, a category-configuration change, and the Super Admin Service Category separation.

## 7. Verifying

```
cd backend  && npm run test:other-service-booking-requirements   # 46 passed
cd backend  && npm run build                                     # clean (two pre-existing
                                                                 # @modelcontextprotocol/sdk errors:
                                                                 # declared dep, not installed locally)
cd frontend && npx tsc --noEmit && npx eslint src                # clean in everything touched
```

The migration is **not** run here — apply it with the usual `globalyapp` migrate command.

## 8. Create-page configuration (follow-up)

The requirements builder originally said "Save the category first" on the new-category page. It now works
before the category exists:

- `SchemaFieldsEditor` treats `categoryId === null` as local-draft mode — add, edit, reorder and delete all
  work in memory, with negative temp ids, and no requests are made. The preview works there too.
- `BookingRequirementsPanel` reports the list up via `onFieldsChange`.
- `CategoryEditorView` holds it as `pendingFields` and, after `createCategory` returns, creates each field
  in order (the server appends by `MAX(display_order) + 1`, so sequential creation preserves the order).
- If any field is refused, the toast names them and the redirect goes to the new category's editor instead
  of the list — the category is real either way, so silently dropping requirements is not an option.

While extracting the panel, `category-editor-view.tsx` went past the repo's 300-line limit, so the details
form and the two business-only cards moved into `category-details-card.tsx` and `business-category-cards.tsx`
(259 lines now, from 428). `FormState` became `CategoryFormState` in the feature's `types/`.

## 9. Starting requirements for the eight existing categories

`backend/database/seeders/globalyapp/other_service_category_fields_seeder.ts` gives the categories that
shipped before the builder existed a sensible starting set, so none of them is an empty booking form.
Roughly 3–7 questions each — Airport Pickup asks pickup date, pickup time, arrival airport, flight number
(optional), passengers (1–8), luggage (optional) and a note; Rental Support asks move-in date, property
type, occupants, area, budget and requirements; and so on for City Orientation, Employment Setup,
Assignment Help, Private Tutoring, Accomodation and Other.

Rules the seeder follows:

- **Only those slugs.** A category created from the admin UI is skipped entirely — its requirements are
  configured by hand on the create page, which is the intended path. Adding a slug to this map is not how
  you configure a new category.
- **Insert-if-absent per field**, keyed by `(entity_id, entity_type, key)`. Re-running never duplicates a
  row and never overwrites an admin's edit to a label, an option list, an order or a required flag. The one
  trade: a field deleted in the UI comes back if the seeder is re-run.
- **Slug spelling is normalised** (`-` → `_`) before lookup, because both `airport-pickup` (the categories
  seeder) and `airport_pickup` (what is actually in the DB) exist. `accomodation` — the misspelling in the
  live data — and `accommodation` both map to the same set.
- It runs after `other_service_categories_seeder.ts` (alphabetically `categories` < `category`), so the
  parent rows exist first.

Run it on its own rather than re-seeding everything:

```
cd backend && npm run seed:globalyapp -- --specific=other_service_category_fields_seeder.ts
```

Test section 10 validates every seeded field against `SchemaFieldInputSchema` and pushes a filled-in form
through `validateAgainstFields`, then removes each required answer in turn to confirm it is enforced.
Bad fixture data — a required dropdown with no options, say — would ship a category nobody could book, so
it is checked rather than eyeballed. Total: **106 assertions, 0 failures.**

## 10. Create flow, and deleting a category

**"Add other service category" opened a dialog**, not the editor page — so the Booking Requirements panel
built in §8 was unreachable. `handleAdd` in `categories-view.tsx` now routes every category tab to
`/admin/platform/categories/<segment>/new`, the page that already existed for all three taxonomies.
`category-dialog.tsx` and the `saveCategory` thunk were the only things using the dialog path and are gone.

Two things that came with that:
- The dialog defaulted sort order to the list total; the editor page defaulted it to the loaded page's
  length (0). It now reads `total` too, so a new category sorts after every existing one rather than first.
- `run()` in `categories-view.tsx` reported every failure as "Please try again", discarding the server's
  own sentence. It now shows `error.message` when there is one — required for the delete refusal below to
  mean anything.

**Delete**, Other Service Categories only:
- `DELETE /admin/platform/other-service-categories/:id` → soft delete (`deleted_at`).
- Refused with **409** while any listing references the category, naming the count: *"3 services are listed
  under "Airport Pickup". Turn it off instead — that closes it to new listings without breaking the existing
  ones."* `other_service_listings.other_category_id` is a RESTRICT FK, so a hard delete would fail at the
  database anyway; this turns that into something an admin can act on.
- The category's `schema_fields` are deliberately **kept**. A past booking's answers are keyed by field, and
  `describeAnswers` resolves their labels at read time — deleting the definitions would leave every historical
  booking unlabelled.
- `listCategories` in `other-services/services.repository.ts` already filters `deleted_at`, so a deleted
  category disappears from the seller's picker without further change.
- Business and service categories get **no** delete: they are referenced by approved businesses and their
  services. `CategoryList` only renders the trash button when `onDelete` is passed, and only the
  `other_service` tab passes it.

Not unit-tested: the delete guard is four lines of repo calls and needs a database. It is covered by the
409 path being exercised manually.

## 11. If the requirements look empty

`Edit: Airport Pickup` showing "Nothing configured yet" means the rows are not in the database yet. In order:

```
cd backend
npm run migrate:globalyapp                                                   # adds the new columns
npm run seed:globalyapp -- --specific=other_service_category_fields_seeder.ts # fills the eight categories
```

## 12. Running the migration on Windows (and what it uncovered)

### The knex scripts were broken on Windows

`migrate:globalyapp` / `seed:globalyapp` invoked `node --import tsx node_modules/.bin/knex`. On Windows
`.bin/knex` is the **sh** wrapper, so esbuild tried to parse shell syntax as JavaScript:

```
ERROR: Expected ")" but found "\"$(echo \""
```

All four knex scripts now point at `node_modules/knex/bin/cli.js`, the real entry point. That path is
platform-independent and works in Docker too.

### Two pre-existing DB problems it then exposed

Neither was caused by this feature; both blocked `migrate:latest` outright.

1. **Orphaned ledger records.** `knex_migrations_globalyapp` still listed
   `20260818_001_credit_ledger.ts` (id 60, batch 2) and `20260819_001_decouple_referrals_from_credits.ts`
   (id 75, batch 4), whose files were deleted by commit `ff9a6fa` (a revert of the credits refactor).
   Knex refuses to run anything while the ledger references files it cannot find. Both rows were deleted
   after confirming with the user — the files are gone from the repo, so the records tracked nothing and
   could not be re-run.

2. **A stale table from that same reverted refactor.** `credit_transactions` existed in the reverted
   shape (`owner_type` / `owner_id` / `kind`), while `credit_wallets` did not exist at all — and
   `ai-counsellor/repositories/credits.repository.ts` reads both in the *wallet* shape
   (`wallet_id` / `reason`). The AI counsellor credits feature was already broken on this database, and
   the stale table blocked the pending `20260816_005_credit_transactions.ts`. Dropped after confirming
   with the user; its three rows were referral test data (`reference_id: 999963`), logged to the console
   before the drop.

### Result

```
Batch 4 run: 9 migrations
Ran 1 seed files
```

`schema_fields` now has `display_order`, `placeholder`, `help_text`, `default_value`, `validation`, and
`credit_wallets` + a correctly-shaped `credit_transactions` exist, so the credits repository matches its
schema again. Seeded requirement counts:

| Category | Fields |
|---|---|
| Airport Pickup | 7 |
| City Orientation | 5 |
| Rental Support | 7 |
| Employment Setup & Support | 6 |
| Assignment Help | 5 |
| Private Tutoring | 6 |
| Accomodation | 6 |
| Other | 3 |
| Test (admin-created) | 0 — as designed |

## 13. Why "cannot delete" — a missing dependency, not the route

The delete button returned 404 with Fastify's default *"Route DELETE:… not found"*. The route was fine; the
chain was:

1. `@modelcontextprotocol/sdk` was declared in `package.json` (`^1.30.0`) and pinned in `package-lock.json`
   (1.30.0) but **absent from `node_modules`**. `src/modules/superadmin/data-extraction/lib/scraper.ts`
   imports it, so `src/server.ts` could not boot at all — the same two errors `npm run build` had been
   reporting since before this feature.
2. So the process answering :3000 was an **older** one, started before these changes. `PATCH
   /other-service-categories/:id` returned 401 (route exists, tokenless probe rejected) while `DELETE` on
   the identical path returned 404 — the signature of a stale process.
3. `npm install` restored the locked version. No lockfile content change; the `M` on `package-lock.json`
   was line-ending normalisation only and was reverted.

`npm run build` is now clean for the first time in this session. Booting `src/server.ts` and probing
confirms all three new routes are registered:

```
PATCH  /api/v3/admin/platform/other-service-categories/:id            -> 401
DELETE /api/v3/admin/platform/other-service-categories/:id            -> 401
PUT    /api/v3/admin/platform/:entityType/:entityId/schema-fields/order -> 401
```

401 rather than 404 is the point: the route matched and the auth hook rejected an unauthenticated probe.
`listBookingFields()` also reads the seeded rows back with the new columns intact — Airport Pickup's seven,
in order, with placeholders, help text, the `default_value` of 1 and the `{min:1,max:8}` bound.

The verification server was stopped afterwards; port 3000 is free.
