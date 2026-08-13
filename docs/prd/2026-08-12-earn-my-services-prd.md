# Earn → My Services (V3) — PRD

> **Status:** Implemented | **Owner:** Wonjala Joshi | **Last updated:** 2026-08-13
> **Parent:** Personal Portal (V3) · Epic 5 — Earn, Feature 1
> **Surface:** `/personal/earn/services` | **Stack:** Next.js 16 App Router + Redux Toolkit · Fastify 5 + Knex + Postgres
> **One-liner:** V2 asked sellers to type their price in cents and let them delete a listing with a paid order against it; V3 takes the price the way a person says it, refuses to strand a payment, and makes every order row lead to the order it names.

**Scope: the whole loop — create a listing, have it found publicly, be ordered, be paid for, and be completed.** Seller listing management, the public marketplace, order creation, checkout, the post-order lifecycle, and read-only admin oversight. This documents what shipped, not an aspiration; where the source PRD asked for something this does not do, it is recorded as a scope cut with the reason.

---

## 1. Problem

My Services is a genuine two-sided marketplace inside the Personal portal: the same user is a **seller** (listings, received orders) and a **buyer** (purchases). Money is held until both parties confirm completion. That is a transactional flow, and V2 shipped it with consumer-hostile inputs and unsafe destructive actions.

| V2 defect | Evidence | V3 behaviour |
|---|---|---|
| The seller does currency arithmetic | `StudentServiceForm.tsx` — the field label is literally **"Price (in cents) \*"**, placeholder *"e.g. 5000 for $50"*. Typing `50` meaning fifty dollars listed a fifty-cent service. | Price is entered in currency units, with a currency symbol in the field and a live "Buyers will pay **$50.00**" line. The word *cents* appears nowhere in the UI. |
| Deletion can strand a payment | `StudentServices.tsx:36` — `confirm("Delete this service listing?")`, a raw browser dialog, with **no check for open orders** | Blocked with a **409 naming the open orders** (`#1, #2, #4`) and **Pause** offered instead. A real `Dialog`, never `window.confirm`. |
| Order lists are dead ends | Both order tabs render, but no row links anywhere. `/personal/services/orders/:orderId` existed and was unreachable from the list that should feed it. | Every row is a link to its order detail. |
| Edit points at a path the router doesn't have | `StudentServices.tsx:105` → `/student/services/:id/edit`, not registered in V2's own `App.tsx` | Canonical `/personal/services/:serviceId/edit`. No `/student/*` path is ever emitted. |
| setState during render | `StudentServiceForm.tsx:41-51` hydrates edit mode behind an `initialized` boolean, during render | The form is only mounted once its data exists, so there is no hydration effect and no flag — the flicker class of bug cannot occur. |
| Ratings are never recomputed | No trigger, no function, nothing recomputes `avg_rating`/`total_reviews` after a review insert — every listing showed 0 stars however many reviews it had | Recomputed **from the rows, in the same transaction** as the review insert. |
| The status enum has no DB constraint | The six values live only in `serviceConstants.ts` | `CHECK` constraint on `service_orders.status`. |
| The payment return can double-fire | Verification is idempotent server-side, but the client has no reload guard | Fires **exactly once per mount** behind a ref guard; a replay reads as success, never as a failure. |
| **The buyer path does not exist at all** | `createServiceOrderCheckout()` has **zero callers**; nothing anywhere inserts into `service_orders`; `/student-service/:id` renders the *business* course page and reads `useParams<{slug}>` for a route with no `slug`. No buyer could ever complete a purchase. | **Built.** A public marketplace at `/services`, a detail page at `/service/:id`, order creation, and checkout — so a listing can be found, bought, paid for and completed. |
| Categories are a hardcoded enum | `serviceConstants.ts` — seven slugs in code, so adding one is a deploy | Rows in `service_categories`, administered at `/admin/platform/categories`. See §5. |
| Nobody can see what is on the marketplace | No admin view of services at all | Read-only oversight at **Admin → Monitoring → Services**. |

---

## 2. What "completed" means — and what it does not

The one place this deliberately departs from the source PRD's language, because that wording would have the product promise something it cannot deliver.

- **`completed` means both parties confirmed completion.** Nothing else. It is a state transition, not a money movement.
- **No money reaches the seller in this phase.** There is no Stripe Connect account, no transfer and no payout — a paid order's funds sit in the platform's own balance, exactly as in V2. "Release" is the `paid → completed` flip and nothing more.
- **`paid` renders as "Payment held", not "In Escrow".** *Escrow* names a specific legal and operational arrangement: a segregated account, a defined release trigger, a named custodian. None of that exists here, and the fact that the refund path *is* real does not make the holding arrangement escrow. Promising it in a status badge is a commitment the implementation cannot honour. The stored value stays `paid`; this is one entry in `const/index.ts` and becomes "In Escrow" the day the funds-holding model is defined. **The word "escrow" appears nowhere in this feature's UI.**
- The earnings strip reports **order values, not balances** — *Payment held* · *Confirmed complete* · *Orders received*, per currency, never summed across currencies — and carries the line *"These are order values, not payouts. Withdrawing your earnings isn't available yet."* `GET /summary` returns `payouts_live: false` so no client can imply otherwise.

Refunds *are* real when Stripe is configured: refunding money the platform already holds needs no Connect account.

---

## 3. Scope

### In scope (shipped)

**Seller**
- `/personal/earn/services` — earnings strip + three counted tabs (My Listings · My Purchases · Received Orders)
- `/personal/earn/services/new` and `/personal/earn/services/[serviceId]/edit` — create and edit, one form
- Listing lifecycle: active ⇄ paused → deleted (soft), with deletion refused while money is committed
- **View public page** on a listing card — a real destination now

**Buyer**
- `/services` — the public marketplace: search, category filter, pagination. **Unauthenticated**
- `/service/:serviceId` — public detail with reviews, the seller, and **Book this service**. Unauthenticated to read; signing in is required only to buy, and returns you to the listing you were on
- Order creation, checkout, and the payment return

**Both**
- `/personal/earn/services/orders/[orderId]` — order detail, dual confirmation, review, dispute, cancel, refund
- `/personal/earn/services/payment-success` — the payment return, verified once and safe to reload
- Order lifecycle: `pending_payment` → `paid` → `completed` / `disputed` / `refunded` / `cancelled`
- A payment driver seam: real Stripe when configured, a dev driver otherwise

**Admin**
- **Monitoring → Services** — read-only listings and orders, with per-currency totals
- Categories administered at **Platform → Categories**, the screen that already existed

### Out of scope, and why
| Cut | Reason |
|---|---|
| **Admin moderation of services** | The screen is read-only. Pausing someone's listing or forcing a refund are real powers needing their own audit trail and permission story; this phase answers "what is on the marketplace and what is being bought". |
| **Stripe webhook** | Settlement is verify-on-return and is idempotent. A buyer who closes the tab mid-checkout leaves the order `pending_payment` until they return — recoverable, because pressing Buy again resumes that same order rather than creating a second one. A webhook is the fix when abandoned checkouts matter. |
| **Seller payouts / Stripe Connect** | See §2. |
| **Dispute resolution** | `disputed` is a status this UI renders read-only with the escalation stated. Resolving it is Ops. |
| **Ambassador and Referrals as features** | Both exist only as `ComingSoon` tabs in the Earn sub-nav, so the module shows its real shape. No route beyond the stub, no API, table, reducer or feature work. |
| **The Earn landing state** | `/personal/earn` redirects to My Services rather than resolving between three entry cards. Two of the source PRD's three paths are unbuilt, so choosing between them would be theatre. |
| **Cover image upload in this environment** | Built and wired, but storage is GCS-only on this branch and no bucket is configured. See §6.4. |

---

## 4. Routes

My Services is nested **under the Earn module**, which owns a second-level nav (My Services · Ambassadors · Referrals) rendered by `personal/earn/layout.tsx`. Nesting the URLs rather than only the chrome means the Earn top-nav item highlights on every sub-route with a plain prefix match, and the sub-nav persists across the form, an order and the payment return without any per-page wiring.

| # | Route | Page | Notes |
|---|---|---|---|
| 0 | `/personal/earn` | — | Redirects to My Services |
| 1 | `/personal/earn/services` | Services hub | Earnings strip + 3 counted tabs |
| 2 | `/personal/earn/services/new` | Listing form | The static `new` segment is matched before `[serviceId]` by the App Router, so the source PRD's ordering requirement holds by construction |
| 3 | `/personal/earn/services/[serviceId]/edit` | Listing form | Non-numeric id → `notFound()` before any request is made |
| 4 | `/personal/earn/services/orders/[orderId]` | Order detail | Either party may read it; nobody else learns it exists |
| 5 | `/personal/earn/services/payment-success` | Payment return | Requires `?session_id=`; without it, the error state — decided at first render, not by an effect |
| 6 | `/personal/earn/ambassadors` · `/personal/earn/referrals` | `ComingSoon` | Tabs, not features — see §3 |

**Public** (no token, and no portal shell — these render in the `(web)` marketing layout):

| # | Route | Page | Notes |
|---|---|---|---|
| 7 | `/services` | Marketplace | Search, category chips, pagination |
| 8 | `/service/:serviceId` | Service detail | Reviews, seller, Book this service |

**Admin:** `/admin/monitoring/services`.

Everything under `/personal/*` and `/admin/*` is authenticated by the existing global `onRequest` hook. No `/student/*` path is emitted anywhere.

---

## 5. Schema

`database/migrations/globalyapp/20260812_001_services.ts`. Follows the ID convention already in the repo: first-class domain entities use `increments("id")`, FK types match what they join to, `deleted_at` soft delete.

Named **`service_listings`**, not `services`: `service_categories` already exists and is a *business* category taxonomy (`business_category_default_services`), an unrelated thing. A bare `services` table beside it would read as its parent.

### `service_listings`
`provider_id` → `platform_users` CASCADE · `title` · `description` · **`category_id` → `service_categories` RESTRICT** · `price_minor` · `currency` · `country_id` → `countries` · `city_id` → `cities` · `cover_storage_path` · `is_active` · `avg_rating` · `total_reviews` · `total_orders` · timestamps · `deleted_at`.

**Categories are data, not an enum** (`20260813_001`). The first migration pinned `category` to seven slugs with a `CHECK`. That is right for an enum and wrong for a taxonomy someone administers: an admin adding a category in `/admin/platform/categories` could not use it, because the constraint would reject the write. Listings now reference `service_categories` — the table that already carried slug/name/description/icon/is_active/sort_order **and already had a superadmin CRUD screen** — so no new table and no new admin UI were needed.

The seven rows are inserted by that migration rather than a seeder: they are the values the dropped `CHECK` used to enforce, so the schema change and the values it depends on have to travel together or a migrated database has a category picker with nothing in it. `RESTRICT` on the FK means a category with listings against it **cannot be deleted** — an admin retires it (`is_active = false`), which hides it from new listings while leaving existing ones intact.

- **Money is an integer minor amount**, never `numeric` and never a float. V2 stored `numeric` *and* asked the seller to type it; the units are a storage decision the UI never sees.
- Location **reuses the existing `countries`/`cities` tables** rather than V2's free text, which is why V2's listings could not be filtered by location reliably.
- `cover_storage_path` is a storage **path**, not a URL — signed view URLs expire, so they are minted per read.
- Indexes: `(provider_id, deleted_at)`, `(is_active, deleted_at, created_at)`.

### `service_orders`
`listing_id` **RESTRICT** · `buyer_id` · `provider_id` (snapshotted) · `amount_minor` · `currency` (snapshotted) · `status` · `payment_provider` · `payment_session_id` · `payment_intent_id` · `payment_refund_id` · `paid_at` · `completed_at` · `cancelled_at` · `refunded_at` · `buyer_confirmed` · `provider_confirmed` · `notes` · timestamps.

Constraints doing real work:
- `CHECK (status IN (…))` — V2 kept its six values only in a TS const.
- **`CHECK (buyer_id <> provider_id)`** — self-purchase is impossible at the storage layer, not merely in a handler.
- **Partial unique `payment_session_id`** — one payment session can only ever settle one order.
- `RESTRICT` on `listing_id` — an order is a financial record; the delete route refuses first, and this is the backstop for anything that bypasses it.
- Amount and currency are **snapshotted from the listing**, so a later price edit cannot retroactively change what someone owes.
- Indexes: `(buyer_id, created_at)`, `(provider_id, created_at)`, `(listing_id, status)` — the last serves the delete guard.

### `service_reviews`
`order_id` **unique** (one review per order, enforced by the database rather than a raceable handler) · `listing_id` · `reviewer_id` · `rating` `CHECK (rating BETWEEN 1 AND 5)` · `comment` · `created_at`.

V2 had no rating check — the 1–5 range lived only in a Zod schema, so anything writing outside the API could store a 0 or a 97 and skew a listing's average.

---

## 6. API — `/api/v3/my-services`

| Route | Purpose |
|---|---|
| `GET /meta` | Categories (rows), currencies, and what this environment can do (`cover_upload_available`, `payments_live`) |
| `POST /orders` | **Place an order.** The buyer sends a listing id and nothing that costs money |
| `POST /orders/:orderId/checkout` | Start payment; returns somewhere to pay |
| `GET /summary` | Per-currency order-value totals + counts + `payouts_live: false` |
| `GET · POST /listings` · `GET · PATCH · DELETE /listings/:serviceId` | Listing CRUD, ownership from the JWT |
| `POST /listings/cover` | Cover upload (multipart), declared before `/:serviceId` |
| `GET /orders` · `GET /received-orders` · `GET /orders/:orderId` | Buyer / seller / either-party reads |
| `POST /orders/payment/verify` | The return path — six-point reconciliation, idempotent |
| `POST /orders/:orderId/complete` | Completion confirmation |
| `POST /orders/:orderId/dispute` · `/cancel` · `/refund` | Report a problem · `pending_payment`→`cancelled` · `paid`→`refunded` |
| `GET · POST /orders/:orderId/review` | Buyer-only, `completed`-only, once |

Every schema is `.strict()`, so `provider_id`, `avg_rating`, `total_reviews`, `total_orders` or an `id` in the body is rejected loudly rather than silently stripped.

### Public — `/api/v3/services`, no token

| Route | Purpose |
|---|---|
| `GET /` | Browse: `search`, `category_id`, `country_id`, `city_id`, `currency`, `page`, `limit` (capped at 48) |
| `GET /:serviceId` | Detail |
| `GET /:serviceId/reviews` | Reviews with reviewer names |
| `GET /categories` | Active categories, for the filter and the seller's form |

Mounted on a **separate prefix and a separate file**, so "is this endpoint public?" is answered by which file a route lives in rather than by reading a regex. `auth.plugin.ts`'s allow-list is an exact-match `Set` that cannot express `/services/:id`, so a small anchored, digit-only pattern list sits beside it — everything a seller owns is under `/api/v3/my-services` and cannot match it at all.

The public shape is deliberately narrower than the seller's: no `cover_storage_path`, no `open_orders_count`, no provider email. A paused or deleted listing 404s rather than 403s — a buyer has no business learning that a seller took something down.

### Admin — `/api/v3/admin/platform/services`

`GET /services` (filter by search/category/status incl. `deleted`) · `GET /services/orders` · `GET /services/stats`. Read-only, inside the platform module so it inherits the existing `super_admin` / `data_admin` guard.

### Ordering

The buyer sends **only a listing id**. Amount, currency and provider are read from the listing and snapshotted onto the order — that is what stops a client naming its own price, and what keeps a later price edit from changing what an existing order owes. Self-purchase and paused listings are refused, and pressing Buy twice **resumes the buyer's existing unpaid order** rather than stacking abandoned rows, each of which would separately block the seller from deleting the listing.

Checkout stores the session id on the order, which is what the return path looks it up by and what the unique index makes one-to-one. Both drivers take the same `{CHECKOUT_SESSION_ID}` placeholder contract: Stripe substitutes it, the dev driver substitutes it itself.

### 6.1 Payment verification is a six-point reconciliation, not a boolean

Stripe exposes `amount_total`, `currency`, `payment_intent` and `payment_status` **for exactly this reconciliation**. Trusting `payment_status` alone means a future checkout-integration bug — a session built with the wrong amount, in the wrong currency, or against the wrong order — settles as a valid payment, and the seller is told they were paid an amount nobody sent. All six must hold:

1. `payment_status === "paid"`
2. `amount_total === order.amount_minor`
3. session `currency` matches the order's, **case-normalised** (Stripe returns lowercase)
4. `payment_intent` is present — without it the order could never be refunded
5. the session resolves to exactly one order (the lookup itself, backed by the unique index)
6. the authenticated caller is the order's `buyer_id`

Checks 5 and 6 run **before** any outbound call, so probing session ids cannot be used to make this server talk to Stripe. Settlement then re-reads the row `FOR UPDATE`, so two simultaneous returns to the success URL cannot both increment `total_orders`.

`retrieveSession` returns the raw session facts and makes no judgement — a driver returning a bare `paid: boolean` would throw away the very fields the caller must verify.

### 6.2 Refunds survive a Stripe/Postgres split failure at any delay

Stripe and Postgres cannot share a transaction. The dangerous interleaving is Stripe succeeding while the DB write fails: a naive retry issues a **second** refund, and Stripe accepts repeated partial refunds against a PaymentIntent until the refundable amount is exhausted.

An idempotency key alone does **not** close this. Stripe guarantees idempotent replay for **24 hours** and may prune keys after that, so a retry days later — an operator clearing a stuck order, a weekly job — reads as a brand-new request. The key covers the short window; asking the provider what it already holds covers the long one. Both, in this order:

1. Guard — order is `paid`, caller is the provider, `payment_intent_id` present.
2. `payment_refund_id` already set → **idempotent success, no outbound call at all**.
3. `GET /v1/refunds?payment_intent=…` — authoritative however much time has passed.
4. A matching refund exists → **reconcile it locally**. Never issue a second one.
5. Otherwise create it with `Idempotency-Key: service-order-refund-{orderId}`, which also covers a concurrent double-submit racing step 3.
6. Persist `payment_refund_id` + `refunded`+`refunded_at` in one transaction.

If step 6 fails the endpoint is safe to call again at any delay: step 3 finds the refund and step 4 reconciles it. A refund whose id is not persisted is a refund nobody can audit, which is why recovery reconciles rather than re-refunds.

**Refund is therefore idempotent by design**: an order already carrying a refund id returns 200 with that refund, not a 409. A `refunded` row *without* one is a data anomaly and is refused on status. Both are tested, because a test asserting "refunded → always 409" would pass for the wrong reason and hide the recovery path.

### 6.3 The payment driver seam

`modules/services/payments/` — inside the module, not in `shared/`, because only this feature uses it. Shaped like `shared/storage/storageService.ts`'s config-driven switch: real Stripe when `STRIPE_SECRET_KEY` is set, otherwise a dev driver, and callers never learn which is active.

- **No `stripe` dependency.** Three form-encoded REST calls behind the seam. The SDK's real value is webhook signature verification and Connect, and this phase has neither. Isolated to one file, with a `ponytail:` comment naming the upgrade trigger.
- **The dev driver encodes the session facts in the session id** — `dev_<status>_<amountMinor>_<currency>_<pi|nopi>_<nonce>`. If `retrieveSession` simply mirrored the order it was checked against, the six-point reconciliation would pass vacuously and not one of its rules would be demonstrable. A deliberately mismatched id is what proves the amount and currency rejections work — live as well as in tests. It also returns currency lowercase, as Stripe does, so the case-normalising comparison is exercised without a Stripe account.
- **The production guard is at driver *selection*, not at import.** An import-time throw fires in every process that merely loads the module — a migration, a typecheck, an unrelated worker — and in production deployments that never take a payment. The condition that matters is narrower: *about to hand a caller a driver that approves payments without charging, in production*.

### 6.4 Cover upload, and this environment

Uses `shared/storage/storageService.ts` **unchanged** — an image-only allow-list passed per call (so nothing else in the app is widened), `buildPath`, `uploadFile`, metadata into `uploaded_files` under category `service-cover`. A path may only be referenced by the user who uploaded it, copying `assertOwnedMedia`'s check from `feed-media.service.ts`; otherwise a client could attach any path it could guess.

**Storage on this branch is GCS-only and no bucket is configured here.** The local-driver fallback was deliberately removed by review (`7f97c72`, `89b4ca2`), so it was not re-added — that is exactly the out-of-scope work the review dropped. Instead `GET /meta` reports `cover_upload_available`, and the form **omits the image field entirely** when it is false rather than offering a control that can only fail. The cover is optional, so listings are fully usable without one. Setting `GCS_BUCKET_NAME` turns it on with no code change.

---

## 7. Frontend

`src/app/personal/earn/services/` in the mandated `frontend/AGENTS.md` shape — `apis/{types,mock-data,real-api,index}`, `store/my-services-slice.ts`, `const/`, `utils/`, `components/`, thin `page.tsx`, pass-through `layout.tsx`. Reducer registered as `myServices`.

- **Money on the wire is an integer minor amount in both directions**, so no money value is ever a float in JSON. Conversion happens at exactly one point on each side: `toMinorUnits` / `formatMoney` in `utils/`. `toMinorUnits` rejects anything that is not a plain decimal (`1e3`, `1,000`, `50abc`) and rounds *after* multiplying — `19.99 * 100` is `1998.9999…` in binary floating point, so truncating would silently charge a cent less.
- **Per-region status fields** (`summaryStatus` / `listingsStatus` / `purchasesStatus` / `receivedStatus` / `listingStatus` / `orderStatus`) so a failure in one region leaves the others rendered. Each tab renders loading → error+retry → empty → content, in that order.
- **Normalize at the boundary.** `real-api.ts` defaults every field the UI touches. The wire shape is whatever the deployed backend sends, not what the TypeScript type claims, and one `?.` per call site is a fix that decays. `role` defaults to `provider` — the role with *fewer* affordances — so a missing field can never offer a seller a review form.
- **The form is mounted with its values already in place.** The loader waits for data and the form below it takes `initial` values; there is no hydration effect and no `initialized` flag, so V2's flicker-and-reset shape cannot occur.
- **`type FormState`, not `interface`** — `useValidatedForm` takes `T extends Record<string, unknown>` and TypeScript only infers an implicit index signature for type aliases. Every other form in the app does the same.
- Comboboxes sit in `flex flex-col gap-*`, never `space-y-*` — base-ui's focus-guard spans inherit sibling margins and shift the layout when a popover opens (documented in `frontend/AGENTS.md`).
- **`citiesLoading` is derived, not stored** (`a country is selected but its cities have not arrived`), and cities are cached against the country they belong to, so a stale list can never be shown for a newly picked country.
- **Local `services-tabs.tsx`.** There is no shadcn Tabs primitive in this app; the admin portal's equivalent stays where it is rather than being moved, which would touch two unrelated views. It is the *in-page* switcher (My Listings / My Purchases / Received Orders) and is a different thing from `earn-sub-nav.tsx`, which is the module's second-level **route** nav and lives one level up in `personal/earn/`.
- Responsive: card grid `md:2 lg:3`, stacked order rows, `max-w-2xl` forms; the shell's existing `pb-24 md:pb-6` already clears the mobile bar.

---

## 8. States — all six

| State | Trigger | Behaviour |
|---|---|---|
| **Happy** | Listings and/or orders exist | Cards with price, rating, reviews, order counts, Active/Paused; order rows that link to their detail |
| **Empty** | Nothing yet | Per-tab empty state; Listings offers Create, the order tabs explain how orders arrive |
| **Loading** | Any region fetching | Per-region skeletons preserving grid height; tabs never block each other |
| **Error** | Validation · upload · payment · blocked delete | The specific cause and its remedy; **nothing half-saved**; Pause offered when Delete is refused |
| **Partial** | One-sided confirmation, or verification in flight | Both confirmation rows shown with who is outstanding; the payment is explicitly held; no double count |
| **Malformed response** | Backend omits a field the UI indexes into | Normalized in `real-api.ts` at the boundary, so a missing array or scalar cannot throw during render |

### Edge cases handled
- **Delete with money committed** → 409 naming the orders, Pause offered. Verified live: *"This listing has 3 open orders (#1, #2, #4). Pause it instead…"*
- **Paused listing** → still fully visible and editable to its owner; existing orders complete normally (tested)
- **Self-purchase** → impossible at the storage layer (`buyer_id <> provider_id`)
- **Disputed order** → read-only, no confirm and no review, escalation stated
- **Refunded / cancelled** → terminal, no actions offered
- **Currency differs from the viewer's locale** → formatted in the listing's own currency, always; totals bucketed per currency and never summed
- **Payment return reloaded** → verified once per mount; a replay reads as success. Verified live: three verifications, `total_orders` = 1
- **Payment amount disagrees with the order** → refused with the reason named; the order stays `pending_payment`
- **Listing deleted after an order** → the order keeps its title (`listing_deleted: true`) so a buyer's history does not silently lose it
- **Stranger reads an order** → 404, learning nothing about whether it exists
- **Signed cover URL expires between render and load** → that one card drops its image rather than showing a broken frame

---

## 9. Deferred dependencies — documented, not built

1. **Seller payouts.** See §2. The loop is complete except that money stops at the platform.
2. **Cover upload needs `GCS_BUCKET_NAME`.** See §6.4. Listings work without a cover; the marketplace card falls back to a titled placeholder rather than an empty grey frame.
3. **A seller viewing their own listing publicly still sees "Book this service".** The public page is unauthenticated, so the server cannot mark a listing as the viewer's, and the profile slice carries no user id to compare against. Rather than add an authenticated call to a public page purely to hide a button, the server's refusal — *"You cannot buy your own service"* — surfaces in a toast. Closing this properly means an optional-auth read that sets `is_mine`.

---

## 10. Acceptance criteria — and how each was verified

| # | Criterion | Verification |
|---|---|---|
| 1 | Typing `50` lists a $50 service, and *cents* appears nowhere | `services.test.ts` — `price_minor` 5000 round-trips. **Live: `id=5 price_minor=5000 AUD`** |
| 2 | Zero, negative and fractional prices are refused, and nothing is created | `services.test.ts`. **Live: 400 for `0`, `-100`, `12.5`** |
| 3 | A client cannot set the owner or any derived figure | `services.test.ts` — `provider_id`, `avg_rating`, `total_reviews`, `total_orders`, `id` each 400. **Live: `unrecognized_keys: ["provider_id"]`** |
| 4 | Another user cannot read, edit or delete my listing | `services.test.ts` — 403 on all three; the stranger's own list stays empty |
| 5 | Pause keeps a listing visible and editable to its owner; Resume restores it | `services.test.ts`. **Live: paused → resumed** |
| 6 | A city must belong to the chosen country; changing country clears a stale city | `services.test.ts` — mismatch 400, city-without-country 400, valid pair 201, country change nulls `city_id` |
| 7 | A listing holding an open order cannot be deleted, and the open orders are named | `services.test.ts` — `pending_payment`, `paid`, `disputed` each 409 with the order id and "Pause". **Live: named `#1, #2, #4`** |
| 8 | A listing with only closed orders deletes, and history survives | `services.test.ts` — 204, `deleted_at` set, order still readable with its title and `listing_deleted: true` |
| 9 | A paused listing's existing order still completes | `services.test.ts` |
| 10 | Every reconciliation rule refuses to settle, leaving the order untouched | `services.test.ts` — one case per rule, each asserting `pending_payment`, `paid_at` null, `total_orders` unmoved. **Live: amount mismatch → 400, order still `pending_payment`** |
| 11 | A session belonging to another account cannot settle its order | `services.test.ts` — provider 403, stranger 403 |
| 12 | An unknown session settles nothing; one session cannot serve two orders | `services.test.ts` — 404, and the unique index rejects the second order. **Live: 404** |
| 13 | Re-verifying is idempotent and never counts the order twice | `services.test.ts` — 3 replays, `total_orders` 1. **Live: 3 verifications → `total_orders` = 1** |
| 14 | A terminal order cannot be settled by a late payment return | `services.test.ts` — 409, status unchanged |
| 15 | One confirmation is not enough; both close the order | `services.test.ts`. **Live: buyer-confirmed order stayed `paid`; my confirmation → `completed` with `completed_at`** |
| 16 | The confirming party comes from the order, not the request | `services.test.ts` — provider confirming sets the provider flag; the same party cannot confirm twice. **Live: 2nd attempt → "You have already confirmed this order"** |
| 17 | A stranger can neither see nor confirm an order | `services.test.ts` — 404 on read, 403 on confirm. **Live: 404 vs 200 for the right buyer** |
| 18 | Buyer reviews once; the listing's rating is recomputed | `services.test.ts` — 4 stars → `avg_rating` 4, `total_reviews` 1; second attempt 409. **Live: `avg 4.00 reviews 1`** |
| 19 | The average is the mean of every review | `services.test.ts` — 5 and 2 → 3.50 |
| 20 | The provider is never offered a review, at any status | `services.test.ts` — 403, `can_review: false`. **Live: "Only the buyer can review an order"** |
| 21 | A review cannot be posted before both parties confirm | `services.test.ts` — 409 |
| 22 | A rating outside 1–5 is refused | `services.test.ts` — 0, 6, −1, 2.5 all 400 |
| 23 | An unpaid order cancels; a held one must be refunded instead | `services.test.ts`. **Live: `cancelled`; held → "refund it instead of cancelling"** |
| 24 | Reporting a problem disputes a held order and records why | `services.test.ts` — note persisted; empty reason 400. **Live: `disputed`, empty reason 400** |
| 25 | The provider refunds a held payment and the refund id is persisted | `services.test.ts`. **Live: `refunded`, `re_dev_07f29be0ea86`** |
| 26 | Only the provider may refund, and only a held payment | `services.test.ts` — buyer 403, unpaid 409 |
| 27 | An already-refunded order short-circuits with no outbound call | `services.test.ts` — 200, zero refunds created |
| 28 | A refunded row with no refund id is refused on status | `services.test.ts` — 409 |
| 29 | A retry after a failed persist replays the same refund | `services.test.ts` — one refund id, one row. **Live: retry after wiping the row returned the same `re_dev_07f29be0ea86`** |
| 30 | A retry after the idempotency key expired still does not double-refund | `services.test.ts` — key cleared, `listRefunds` finds it, one refund |
| 31 | A refund the provider already holds with no local row is reconciled | `services.test.ts` — seeded refund adopted, not duplicated |
| 32 | Terminal and disputed orders offer nothing | `services.test.ts`. **Live: 409 across `completed`/`cancelled`/`disputed` for complete, cancel, refund** |
| 33 | Purchases and received orders are separated by role and flag what needs attention | `services.test.ts` — the seller's purchases list is empty; flags clear on confirmation. **Live: 5 purchases as buyer, 5 received as provider, `[confirm]` only where owed** |
| 34 | The summary buckets by currency and never claims a payout | `services.test.ts` — AUD and GBP separate. **Live: AUD confirmed 5000, GBP confirmed 3500, `payouts_live: false`** |
| 35 | Self-purchase is impossible at the storage layer | `services.test.ts` — the DB rejects the row (`service_orders_parties_chk`) |
| 36 | The dev payment driver is refused in production, and only there | `services.test.ts` — dev in development, throws in production, stripe with a key |
| 37 | Every route requires authentication | `services.test.ts` — 401 across five routes. **Live: 401** |
| 38 | Meta reports what this environment can actually do | `services.test.ts`. **Live: `cover_upload_available: false`, `payments_live: false`** |
| 39 | Browse, detail, reviews and categories are readable with no token at all | `services.test.ts` — four routes, 200 each. **Live: all four with no `Authorization` header** |
| 40 | The public shape leaks nothing seller-only | `services.test.ts` — `cover_storage_path` and `open_orders_count` absent. **Live: none of `cover_storage_path`, `open_orders_count`, `provider_email` present** |
| 41 | A paused or deleted listing disappears from the marketplace entirely | `services.test.ts` — gone from browse, 404 on detail, back on resume. **Live: 0 results, detail 404, still visible and editable to its owner** |
| 42 | Browse filters and pages | `services.test.ts` — category, search, currency, `limit`/`page` with correct `totalPages`. **Live: category 1, search 1, no-match 0** |
| 43 | A buyer orders, and the price comes from the listing | `services.test.ts` — `amount_minor` 5000 snapshotted, provider from the listing. **Live: `amount=5000 AUD`** |
| 44 | A client cannot name its own price, provider or status when ordering | `services.test.ts` — `amount_minor`, `currency`, `provider_id`, `status` each 400 |
| 45 | You cannot buy your own service, or a paused one | `services.test.ts` — 400 and 409. **Live: "You cannot buy your own service"** |
| 46 | Pressing Buy twice resumes the same unpaid order | `services.test.ts` — same id, exactly one row |
| 47 | Checkout returns somewhere to pay and binds the session to the order | `services.test.ts` — placeholder substituted, session stored, provider 403. **Live: return URL carries the session** |
| 48 | The whole buyer journey works end to end | `services.test.ts` — order → pay → held → both confirm → review reaches the public listing. **Live: all nine steps** |
| 49 | A listing can use any active category; a retired or missing one is refused | `services.test.ts` — new category usable immediately, retired 400, unknown 400 |
| 50 | A category with listings cannot be deleted | `services.test.ts` — the `RESTRICT` FK rejects it, so an admin retires instead of orphaning |
| 51 | Admin sees listings, orders and per-currency totals, and only admins do | **Live: stats/listings/orders correct; a platform user 403, no token 401** |

**Automated:** 50 backend tests, all passing (`DB_NAME=globalyapp_test npm test`). Migration applies, rolls back and re-applies cleanly; all 9 CHECK constraints and 11 indexes verified present. `npx tsc --noEmit` clean on both sides. `yarn lint` introduces no new problems — back to the exact pre-existing baseline (2 errors in `auth/`, 2 `<img>` warnings in `admin/`). `yarn build` succeeds with all five routes compiled.

**Live:** two full HTTP walks against `node --import tsx src/server.ts` on a scratch database.

*Seller and post-order* — 20 numbered steps: listing CRUD, the price fix, the delete guard, all four reconciliation refusals, reload idempotency, dual confirmation, reviews, cancel, dispute, refund **and its split-failure recovery**, the summary, role separation, terminal refusals and ownership.

*The whole loop, from nothing* — 11 numbered steps on an empty database:

```
①  categories come from the DB          7 rows, ids and slugs
②  seller creates a listing at 50       price_minor=5000, category "Airport Pickup"
③  it appears publicly, NO token        1 result; category/search/no-match filters correct
④  public detail, NO token              nothing seller-only leaked
⑤  buyer places an order                amount=5000 AUD, snapshotted
    seller buying their own             "You cannot buy your own service"
⑥  buyer starts checkout                return URL carries a session encoding 5000 AUD
⑦  buyer returns, order settles         paid; two reloads → already_verified, counted once
⑧  buyer confirms → still held          seller confirms → completed, completed_at set
⑨  buyer reviews                        public listing: rating 5, 1 review, 1 order
⑩  seller pauses                        0 public results, detail 404, still theirs
⑪  admin oversight                      stats + rows correct; platform user 403, no token 401
```

---

## 11. Not verified — needs a browser pass

No browser automation exists in this repo, so the following were built to spec but **not** observed in a running browser:
- The authenticated client render (the token lives in `localStorage`, so server-rendered HTML shows the empty shell)
- Responsive layout at 375px vs 1440px
- The form's interactive states — the live "Buyers will pay $50.00" line as you type, the currency-symbol prefix, the country→city dependency clearing, the delete dialog's two shapes, the star picker
- The payment-return page's three states as a real redirect, and a browser reload of the success URL
- **A real Stripe round-trip.** No `STRIPE_SECRET_KEY` is set here, so `stripeDriver`'s three REST calls are unexercised — they are written to Stripe's documented contract and reviewed, not observed. The dev driver branch, which is what runs in development, is covered end-to-end by tests and the live walk.
- **A real GCS upload.** No bucket is configured, so `uploadCover`'s storage path is unexercised beyond its unavailable-branch. See §6.4.
- The provider-echo assertion in `retrieveSession` (the dev driver always echoes the session id it was given, so only real Stripe could return a different one)

There is no frontend test runner in this repo and adding one was out of scope, so the frontend is covered by typecheck, lint, build and review.

---

## 12. Launch reality

No V2 data is migrated, so every surface starts empty — but every one of them now has a real producer. Recorded rather than papered over; no fake producer was added to make anything look populated.

| Region | Producer | At launch |
|---|---|---|
| My Listings | the form built here | **real** |
| Public marketplace | any active listing | **real** — a listing is findable the moment it is created |
| My Purchases · Received Orders | the Buy flow built here | **real** — no longer structurally empty |
| Earnings strip | the orders above | real, **0 in every currency** until someone buys |
| Admin → Services | everything above | **real** |
| Categories | seeded by migration, edited in Platform → Categories | **real**, 7 rows |
| Cover images | needs `GCS_BUCKET_NAME` | field hidden until a bucket is set; cards fall back to a titled placeholder |
| Seller payouts | none — no Connect account | **not live**, and the UI says so |

For demos, seed with `node --import tsx scripts/seed-services-demo.ts --email=you@example.com` — a standalone script, idempotent, never part of `npm run seed:globalyapp`, and it refuses to run with `NODE_ENV=production`.

---

## 13. Operational notes

```bash
# migrate
node --import tsx node_modules/knex/bin/cli.js migrate:latest --knexfile knexfile.ts --env globalyapp
#   ^ npm run migrate:globalyapp is broken on Windows (it invokes the .bin shell wrapper) — pre-existing

# test (the scratch DB is mandatory; create it once with `createdb globalyapp_test`)
DB_NAME=globalyapp_test npm test

# demo data for a browser walk
node --import tsx scripts/seed-services-demo.ts --email=you@example.com
```

**Restart the backend after pulling this** — a new module and a new migration land together, and a stale `tsx watch` process serves 404s for `/api/v3/my-services/*`.

**A note on the local migration ledger.** Commit `2f0cbfc` renumbered the `20260811_*` migrations, and a database that applied them under the old names reports *"the migration directory is corrupt"* and refuses to run anything. The schema is fine; only the ledger's filenames are stale. This is pre-existing and unrelated to this feature, but it blocks `migrate:latest` on any environment in that state.

### Files changed outside this feature

| File | Change | Why unavoidable |
|---|---|---|
| `src/server.ts` | one `app.register(servicesModule)` line | A Fastify module serves no routes until registered |
| `src/config.ts` | `NODE_ENV` and `STRIPE_SECRET_KEY`, both optional | `config.ts` is documented as the only place `process.env` is read |
| `package.json` | one `"test"` script | There was none; this is the only way the suite can run. No dependency added |
| `frontend/src/lib/store.ts` | one reducer line | `frontend/AGENTS.md` mandates registering the slice there |
| `personal-shell.tsx` | prefix nav match · `overflow-x-clip` on `<main>` · V2 header (square mark, plain "Personal" + divider, bordered avatar with chevron) | Equality left `Earn` dark the moment you opened anything it owns; `overflow-x-clip` lets the sub-nav's rule span the viewport without the 100vw box adding scrollbar-width of horizontal scroll; the header work was requested directly |
| `core/plugins/auth.plugin.ts` | a `publicPatterns` list beside the exact-match `publicPaths` Set | The Set cannot express `/api/v3/services/:id`. The pattern is anchored and digit-only, and everything a seller owns is under the separate `/api/v3/my-services` prefix, so nothing authenticated can match it |
| `superadmin/platform/index.ts` | one `app.register(adminServicesRoutes)` line | Puts the admin routes inside the module that already carries the `super_admin` / `data_admin` guard, rather than re-implementing it |
| `admin/nav-config.ts` · `(web)/components/navbar.tsx` · `personal/page.tsx` | one nav row · the profile dropdown · a redirect for a section root that 404'd | Each requested directly; the `/personal` 404 predates this work (commit `e694e14` moved Home to `/personal/portal` and left no redirect) |

`tests/helpers.ts` and `tests/services.test.ts` are new files, not edits. `shared/*` and `app/geo/*` are consumed unchanged.

---

## 14. Follow-ups

| Item | Why |
|---|---|
| An optional-auth public read, so a seller doesn't see "Book" on their own listing | See §9.3 |
| A location filter on the marketplace | The API takes `country_id`/`city_id`; the UI offers search + category only |
| **A defined funds-holding model before any escrow language ships** | Blocks renaming "Payment held" to "In Escrow" — see §2 |
| Stripe Connect payouts | Blocks any claim that a seller has been paid |
| A Stripe webhook | Closes the abandoned-checkout gap that verify-on-return leaves |
| `GCS_BUCKET_NAME` for this environment | Turns cover upload on with no code change |
| Escrow auto-release policy | A held payment can sit indefinitely if one party never confirms; dispute is the only escape hatch today |
| Dispute resolution tooling | `disputed` is rendered; resolving it is Ops-owned and unbuilt |
| Multiple images, seller availability, buyer↔seller messaging | Source-PRD "future consideration"; order notes are the only channel today |
| A platform fee | None today: the listing price is what the buyer pays and what the seller is owed |
| A frontend test runner | The money conversion in `utils/` is the one pure function worth covering client-side |
