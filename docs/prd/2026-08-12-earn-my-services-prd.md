# Earn → My Services (V3) — PRD

> **Status:** Implemented | **Owner:** Wonjala Joshi | **Last updated:** 2026-08-14
> **Parent:** Personal Portal (V3) · Epic 5 — Earn, Feature 1
> **Surface:** `/personal/earn/services` | **Stack:** Next.js 16 App Router + Redux Toolkit · Fastify 5 + Knex + Postgres
> **One-liner:** V2 asked sellers to type their price in cents and let them delete a listing with a paid order against it; V3 takes the price the way a person says it, refuses to strand a payment, and makes every order row lead to the order it names.

**Scope: the whole loop — create a listing, have it found publicly, be ordered, be paid for, and be talked about.** Seller listing management, the public marketplace, order creation, checkout, the post-purchase conversation, open reviews, an admin-owned category list, and admin oversight. This documents what shipped, not an aspiration; where the source PRD asked for something this does not do, it is recorded as a scope cut with the reason.

---

## 1. Problem

My Services is a genuine two-sided marketplace inside the Personal portal: the same user is a **seller** (listings, received orders) and a **buyer** (purchases). Money is taken up front and held by the platform. That is a transactional flow, and V2 shipped it with consumer-hostile inputs and unsafe destructive actions.

| V2 defect | Evidence | V3 behaviour |
|---|---|---|
| The seller does currency arithmetic | `StudentServiceForm.tsx` — the field label is literally **"Price (in cents) \*"**, placeholder *"e.g. 5000 for $50"*. Typing `50` meaning fifty dollars listed a fifty-cent service. | Price is entered in currency units, with a currency symbol in the field and a live "Buyers will pay **$50.00**" line. The word *cents* appears nowhere in the UI. |
| Deletion can strand a payment | `StudentServices.tsx:36` — `confirm("Delete this service listing?")`, a raw browser dialog, with **no check for open orders** | Blocked with a **409 naming the open orders** (`#1, #2, #4`) and **Pause** offered instead. A real `Dialog`, never `window.confirm`. |
| Order lists are dead ends | Both order tabs render, but no row links anywhere. `/personal/services/orders/:orderId` existed and was unreachable from the list that should feed it. | Every row is a link to its order detail. |
| Edit points at a path the router doesn't have | `StudentServices.tsx:105` → `/student/services/:id/edit`, not registered in V2's own `App.tsx` | Canonical `/personal/services/:serviceId/edit`. No `/student/*` path is ever emitted. |
| setState during render | `StudentServiceForm.tsx:41-51` hydrates edit mode behind an `initialized` boolean, during render | The form is only mounted once its data exists, so there is no hydration effect and no flag — the flicker class of bug cannot occur. |
| Ratings are never recomputed | No trigger, no function, nothing recomputes `avg_rating`/`total_reviews` after a review insert — every listing showed 0 stars however many reviews it had | Recomputed **from the rows, in the same transaction** as the review insert. |
| Only a completed order could be reviewed | Combined with a buyer path that never worked, no review could ever be written at all | Open to any signed-in user, with a **verified purchase** marker — see §2d. |
| The status enum has no DB constraint | The six values live only in `serviceConstants.ts` | `CHECK` constraint on `service_orders.status`. |
| The payment return can double-fire | Verification is idempotent server-side, but the client has no reload guard | Fires **exactly once per mount** behind a ref guard; a replay reads as success, never as a failure. |
| Buyer and seller cannot reach each other | No messaging anywhere in V2's services flow; the order was a dead end once paid | An **order thread** — see §2c. |
| **The buyer path does not exist at all** | `createServiceOrderCheckout()` has **zero callers**; nothing anywhere inserts into `service_orders`; `/student-service/:id` renders the *business* course page and reads `useParams<{slug}>` for a route with no `slug`. No buyer could ever complete a purchase. | **Built.** A public marketplace at `/services`, a detail page at `/service/:id`, order creation, and checkout — so a listing can be found, bought and paid for. |
| Categories are a hardcoded enum | `serviceConstants.ts` — seven slugs in code, so adding one is a deploy | Rows in `service_categories`, administered at `/admin/platform/categories`. See §5. |
| Nobody can see what is on the marketplace | No admin view of services at all | Oversight at **Admin → Monitoring → Other Services**. |
| A seller could invent their own category | The seven slugs lived in `serviceConstants.ts`, so the taxonomy was whatever the code said and adding one was a deploy | A fixed list an admin owns, edited at **Platform → Categories → Other Service Categories** and reflected in the portal with no deploy. See §2b. |

---

## 2. What holding a payment means — and what it does not

The one place this deliberately departs from the source PRD's language, because that wording would have the product promise something it cannot deliver.

- **Nothing closes an order.** Dual confirmation was removed by product decision (see §2c). An order settles into `paid` and stays there; `refunded`, `cancelled` and `disputed` are the only other places it can go. There is no terminal success state, and no `completed` is produced any more.
- **No money reaches the seller in this phase.** There is no Stripe Connect account, no transfer and no payout — a paid order's funds sit in the platform's own balance, exactly as in V2.
- **`paid` renders as "Payment held", not "In Escrow".** *Escrow* names a specific legal and operational arrangement: a segregated account, a defined release trigger, a named custodian. None of that exists here, and the fact that the refund path *is* real does not make the holding arrangement escrow. The stored value stays `paid`; this is one entry in `const/index.ts`. **The word "escrow" appears nowhere in this feature's UI.**
- **The buyer-facing copy says only what is true**: the money is held by Globaly rather than passed straight to the provider, and a problem can be reported from the order. It no longer says the payment is held "until both confirm", because there is nothing left to confirm.
- The earnings strip reports **order values, not balances** — *Payment held* · *Refunded* · *Orders received*, per currency, never summed across currencies — and carries the line *"These are order values, not payouts."* `GET /summary` returns `payouts_live: false` so no client can imply otherwise.

Refunds *are* real when Stripe is configured: refunding money the platform already holds needs no Connect account. With completion gone, **a refund is the only thing that moves value**, which is why it replaced "confirmed complete" in the seller's totals — a column that could only ever read 0 would be a lie about the flow.

---

## 2b. What a person may sell — a fixed, admin-owned list

Sellers do not describe their own category. They choose from a list a superadmin controls, and they cannot add to it.

- **The list is data, not an enum.** Rows in `service_categories`, edited at **Platform → Categories → Other Service Categories**. Adding one is a row, not a deploy — it appears in the seller's form and the marketplace filter on the next request.
- **A seller cannot create one.** There is no create-category route under `/api/v3/my-services`, and the listing schemas are `.strict()`, so a category name posted alongside a listing is rejected rather than quietly accepted. The only writer is the admin route behind the `super_admin` / `data_admin` guard.
- **Retire, don't delete.** `is_active = false` hides a category from new listings while every listing already filed under it keeps working. The FK is `RESTRICT`, so a category with listings against it cannot be deleted at all — the database refuses, rather than orphaning live listings.
- **Two taxonomies, one table.** `service_categories` predates this feature: a business category picks its "default services" from it. Those rows have nothing to do with Earn, and a student must not be offered "Campus Catering Contracts". Migration `20260813_002` adds **`scope`** — `business` or `personal` — and the personal side is surfaced in admin as **Other Service Categories**.

**Where the scope filter lives**, in every direction it matters:

| Path | Behaviour |
|---|---|
| `GET /my-services/meta` — the seller's picker | personal only |
| `GET /services/categories` — the public filter | personal only |
| `POST · PATCH /my-services/listings` | a business-scope `category_id` is a **400**, not a 500 at the FK |
| `GET /admin/platform/service-categories` | `?scope=` decides; **defaults to business**, so an old caller keeps its old answer |
| `PUT /business-categories/:id/default-services` | rejects personal ids **at the write**, not only in the picker that feeds it |
| `PATCH /service-categories/:id` | `scope` is not accepted — moving a category between taxonomies would silently retarget every listing already filed under it. Retire it and create the other one |

Existing rows were backfilled `business`, then the seven slugs seeded by `20260813_001` were promoted to `personal`. Anything that existed before this migration was created for the business side, because that was the only side using the table.

**Not built:** no per-listing review. There is no approve/decline step and no verification state — a listing is live the moment it is saved. Constraining *what* can be sold is not the same as checking *who* is selling it or whether the description is honest; if that is wanted, it is a separate feature with its own audit trail. Recorded here because an earlier draft of this document specified one.

---

## 2c. After the purchase: a conversation, not a checklist

Dual confirmation was removed at the product owner's direction: the two-checkbox "Completion" panel read as ceremony rather than as anything a buyer wanted to do, and what a buyer actually needs after paying is to reach the person they just paid.

**What replaced it**

- **An order thread.** Either party can message on their own order. Scoped to one order rather than being an inbox: V3 has **no messaging module** — `/personal/messages` is a `ComingSoon` stub — and a thread that already knows both participants needs no contact list, no presence and no blocking.
- **`is_mine` is resolved server-side per reader**, so neither client compares ids to decide which side of the thread a bubble belongs on. The same row renders correctly for both people.
- **The thread opens when money is committed and closes when the order does.** `pending_payment` is refused (there may never be a payment); `cancelled` and `refunded` are refused but stay **readable**, because a closed conversation is history, not a deletion. **`disputed` deliberately stays open** — that is exactly when the two of them need to sort it out.
- **A stranger gets 404, not 403**, matching every other read on an order: they learn nothing about whether it exists.
- Empty and whitespace-only messages are refused by the zod schema *and* by a DB `CHECK (btrim(body) <> '')`, so nothing that bypasses the API can write one either.

**What this costs, stated plainly.** An order now has no terminal success state. Money is held with no defined release, and the refund path is the only way it comes back out. That is a real regression in the money model against the previous design, accepted deliberately; the honest fix is a funds-holding model and Connect payouts, which are already the blocking follow-ups in §14.

The `completed` status value is **kept in the enum** so orders placed before this change keep their record, and `completed_at` / `buyer_confirmed` / `provider_confirmed` stay on the table for the same reason. Nothing writes them, the DTO no longer exposes them, and a `ponytail:` comment on the row type names the migration that would drop them.

---

## 2d. Reviews are open

Reviewing no longer requires having bought. Any signed-in user can review any listing.

**The gate that was removed was the integrity mechanism** — `service_reviews.order_id` was `NOT NULL UNIQUE`, so the schema itself guaranteed every review came from a completed purchase. Opening it means the rating is now writable by anyone with an account. Three weaker things replace it:

| Guard | Where it lives |
|---|---|
| One review per person per listing | `UNIQUE (listing_id, reviewer_id)` — a race loses cleanly instead of double-posting |
| No reviewing your own listing | The service layer; the table cannot see who owns a listing |
| **Verified purchase** | `order_id` is attached automatically when the reviewer has a settled order for that listing, and the UI badges it |

**The verified-purchase marker is the signal that survived.** The claim moved from *"every review here is trustworthy"* to *"you can see which ones are"* — the public list sorts verified purchases first, and the empty state says so rather than repeating the old promise. Anything past `pending_payment` and `cancelled` counts as a purchase, **including `refunded`**: they bought it and it went wrong, which is exactly the review a reader wants.

**This is a fraud surface and is recorded as one.** A determined actor with several accounts can still move a listing's average. Rate limiting, account age and reviewer reputation are the follow-ups; none is built.

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
- `/personal/earn/services/orders/[orderId]` — order detail, the message thread, dispute, cancel, refund
- `/personal/earn/services/payment-success` — the payment return, verified once and safe to reload
- Order lifecycle: `pending_payment` → `paid` → `completed` / `disputed` / `refunded` / `cancelled`
- A payment driver seam: real Stripe when configured, a dev driver otherwise

**Admin**
- **Monitoring → Other Services** — read-only oversight: listings, orders and per-currency totals. Named *Other Services* because superadmin already has **Service Categories** under Platform → Categories; two things called Services in one admin is a trap
- **Platform → Categories → Other Service Categories** — the fixed list a person may sell from, on its own tab so it is never confused with the business service taxonomy that shares the table. See §2b

### Out of scope, and why
| Cut | Reason |
|---|---|
| **Per-listing review** | No approve/decline step: a listing is live the moment it is saved. Constraining *what* may be sold is not the same as vetting *who* is selling it — see §2b. |
| **Admin moderation of listings** | The Other Services screen is read-only. Pausing someone's listing or forcing a refund are real powers needing their own audit trail and permission story. |
| **Stripe webhook** | Settlement is verify-on-return and is idempotent. A buyer who closes the tab mid-checkout leaves the order `pending_payment` until they return — recoverable, because pressing Buy again resumes that same order rather than creating a second one. A webhook is the fix when abandoned checkouts matter. |
| **Seller payouts / Stripe Connect** | See §2. |
| **Dispute resolution** | `disputed` is a status this UI renders read-only with the escalation stated. Resolving it is Ops. |
| **Ambassador and Referrals as features** | Both exist only as `ComingSoon` tabs in the Earn sub-nav, so the module shows its real shape. No route beyond the stub, no API, table, reducer or feature work. |
| **The Earn landing state** | `/personal/earn` redirects to My Services rather than resolving between three entry cards. Two of the source PRD's three paths are unbuilt, so choosing between them would be theatre. |
| **Cover image upload in this environment** | Built and wired end to end, but storage is GCS-only on this branch and no bucket is configured, so the picker renders **disabled with an explanation** rather than hidden. Listings fall back to a per-category cover. See §6.4 and §6.5. |

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
| 8 | `/service/:serviceId` | Service detail | Reviews, seller, Book this service. A paused or deleted listing 404s |

**Admin:** `/admin/monitoring/other-services`.

Everything under `/personal/*` and `/admin/*` is authenticated by the existing global `onRequest` hook. No `/student/*` path is emitted anywhere.

---

## 5. Schema

Three migrations: `20260812_001_services.ts` (the tables), `20260813_001_service_categories_link.ts` (categories become rows), `20260813_002_service_category_scope.ts` (business vs personal, §2b). Follows the ID convention already in the repo: first-class domain entities use `increments("id")`, FK types match what they join to, `deleted_at` soft delete.

Named **`service_listings`**, not `services`: `service_categories` already exists and is a *business* category taxonomy (`business_category_default_services`), an unrelated thing. A bare `services` table beside it would read as its parent.

### `service_listings`
`provider_id` → `platform_users` CASCADE · `title` · `description` · **`category_id` → `service_categories` RESTRICT** · `price_minor` · `currency` · `country_id` → `countries` · `city_id` → `cities` · `cover_storage_path` · `is_active` · `avg_rating` · `total_reviews` · `total_orders` · timestamps · `deleted_at`.

**Categories are data, not an enum** (`20260813_001`). The first migration pinned `category` to seven slugs with a `CHECK`. That is right for an enum and wrong for a taxonomy someone administers: an admin adding a category in `/admin/platform/categories` could not use it, because the constraint would reject the write. Listings now reference `service_categories` — the table that already carried slug/name/description/icon/is_active/sort_order **and already had a superadmin CRUD screen** — so no new table and no new admin UI were needed.

The seven rows are inserted by that migration rather than a seeder: they are the values the dropped `CHECK` used to enforce, so the schema change and the values it depends on have to travel together or a migrated database has a category picker with nothing in it. `RESTRICT` on the FK means a category with listings against it **cannot be deleted** — an admin retires it (`is_active = false`), which hides it from new listings while leaving existing ones intact.

- **Money is an integer minor amount**, never `numeric` and never a float. V2 stored `numeric` *and* asked the seller to type it; the units are a storage decision the UI never sees.
- Location **reuses the existing `countries`/`cities` tables** rather than V2's free text, which is why V2's listings could not be filtered by location reliably.
- `cover_storage_path` is a storage **path**, not a URL — signed view URLs expire, so they are minted per read.
- Indexes: `(provider_id, deleted_at)`, `(is_active, deleted_at, created_at)`. `service_categories` gains `(scope, is_active, sort_order)`, which serves the seller's picker and both admin tabs.

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
`order_id` **nullable**, `listing_id`, `reviewer_id`, `rating` `CHECK (rating BETWEEN 1 AND 5)`, `comment`, `created_at`.

Reviewing does not require a purchase (§2d), so `order_id` went nullable and its uniqueness became **partial** — `UNIQUE (order_id) WHERE order_id IS NOT NULL` still means one review per order, without NULLs colliding. **`UNIQUE (listing_id, reviewer_id)`** is what replaced the gate: one review per person per listing, enforced by the database rather than a raceable handler.

### `service_order_messages`
`order_id` → `service_orders` CASCADE · `sender_id` → `platform_users` CASCADE · `body` · `created_at`, indexed `(order_id, created_at)` because a thread is always read oldest-first for one order.

One `sender_id` rather than a buyer/provider pair: who sent it is one column, and the order already says which role that is. `CHECK (btrim(body) <> '')` so a whitespace-only message cannot be written even outside the API.

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
| `GET · POST /orders/:orderId/messages` | The order thread — either party, see §2c |
| `POST /orders/:orderId/dispute` · `/cancel` · `/refund` | Report a problem · `pending_payment`→`cancelled` · `paid`→`refunded` |
| `GET /listings/:serviceId/my-review` · `POST /listings/:serviceId/reviews` | Keyed on the **listing**, not an order: buying is not required |

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

### Admin — `/api/v3/admin/platform/other-services`

| Route | Purpose |
|---|---|
| `GET /other-services` | Filter by search / category / status (incl. `deleted`). Carries `description`, so an admin can read what is actually being sold |
| `GET /other-services/orders` · `GET /other-services/stats` | Oversight; per-currency totals, never summed |

Read-only, inside the platform module so it inherits the existing `super_admin` / `data_admin` guard.

The category tabs are the **existing** `/admin/platform/service-categories` routes, which now take `?scope=` — see §2b. No new endpoint was added for Other Service Categories.

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

**Storage on this branch is GCS-only and no bucket is configured here.** The local-driver fallback was deliberately removed by review (`7f97c72`, `89b4ca2`), so it was not re-added — that is exactly the out-of-scope work the review dropped. `GET /meta` reports `cover_upload_available`, and setting `GCS_BUCKET_NAME` turns the whole path on with no code change.

**The field is rendered either way.** It used to be omitted entirely when storage was off, which made covers look unbuilt rather than unconfigured — a seller had no way to know the feature existed. It now always shows, with the picker **disabled and a line saying why**: *"Image upload isn't switched on in this environment yet. Your service will show its category's cover in the meantime."* A disabled control that explains itself beats both an invisible feature and a button that can only fail.

### 6.5 Every listing has a cover, whether or not it has an image

Most listings will never carry an uploaded image — the bucket is unset here, and covers are optional regardless. "No image" is therefore the *normal* case, and the old fallback (a grey panel with a generic handshake glyph) made every one of them read as broken.

`CategoryCover` replaces it: a fixed two-tone wash per category plus **that category's own lucide icon**, which `service_categories.icon` already carried and which now rides along on the listing DTO as `category_icon`. *Airport Pickup* is always sky→indigo with a plane; *City Orientation* is always amber→rose with a map. Two listings in a row can no longer look identical by accident, and the surface reads as designed rather than as a missing asset.

- **No AI, no generated files, no network.** CSS gradients and an icon already in the bundle. There is no image-generation step in this repo and none was added; nothing is fetched from a third party, so there is no CSP exposure, no broken remote asset and nothing to cache-bust.
- **The seven categories get hand-picked pairs**; anything an admin adds later gets a deterministic wash from a hash of its slug, so it is stable across renders and pages rather than falling back to grey.
- **One component, three surfaces** — the public detail hero, the marketplace row's 48px thumbnail, and the seller's listing card. The card previously rendered *nothing* without an image, so a listing appeared as a bare title block; it now always has a cover.
- **Real photography is a drop-in.** Put `<slug>.jpg` in `public/services/` and prefer it inside `wash()`; no call site changes.

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
- **Other Service Categories is its own tab**, not a filter inside Service Categories, and carries a line saying what the rows are for — an admin adding one needs to know it lands in a student's dropdown. It reuses the existing category list, dialog and editor; the only new files are the two route pages. The personal list gets its **own store slot**: the business editor reads `serviceCategories` to fill its default-services picker, and a shared slot would let whichever screen loaded last decide what that picker showed.
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
| **Partial** | Payment verification in flight, or a thread still loading | The payment is explicitly held; no double count; the thread shows a spinner rather than an empty state it might contradict |
| **Malformed response** | Backend omits a field the UI indexes into | Normalized in `real-api.ts` at the boundary, so a missing array or scalar cannot throw during render |

### Edge cases handled
- **A business service category submitted as a listing's category** → 400 naming it unavailable, and it was never in the picker to begin with
- **A retired category** → hidden from new listings; every listing already using it keeps working
- **A category with listings against it, deleted** → the database refuses (`RESTRICT`); retiring is the supported move
- **Delete with money committed** → 409 naming the orders, Pause offered. Verified live: *"This listing has 3 open orders (#1, #2, #4). Pause it instead…"*
- **Paused listing** → still fully visible and editable to its owner; an order already running against it is undisturbed and its thread still works (tested)
- **Self-purchase** → impossible at the storage layer (`buyer_id <> provider_id`)
- **Disputed order** → read-only for money actions, but **the thread stays open** — that is when the two of them most need to talk
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
2. **Cover upload needs `GCS_BUCKET_NAME`.** See §6.4. Listings work without a cover: every surface falls back to the category cover in §6.5, and the form says so rather than hiding the field.
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
| 9 | Pausing a listing does not disturb an order already running against it | `services.test.ts` |
| 10 | Every reconciliation rule refuses to settle, leaving the order untouched | `services.test.ts` — one case per rule, each asserting `pending_payment`, `paid_at` null, `total_orders` unmoved. **Live: amount mismatch → 400, order still `pending_payment`** |
| 11 | A session belonging to another account cannot settle its order | `services.test.ts` — provider 403, stranger 403 |
| 12 | An unknown session settles nothing; one session cannot serve two orders | `services.test.ts` — 404, and the unique index rejects the second order. **Live: 404** |
| 13 | Re-verifying is idempotent and never counts the order twice | `services.test.ts` — 3 replays, `total_orders` 1. **Live: 3 verifications → `total_orders` = 1** |
| 14 | A terminal order cannot be settled by a late payment return | `services.test.ts` — 409, status unchanged |
| 15 | Both parties can talk on a paid order, and `is_mine` is right for each | `services.test.ts` — the same two rows render as mine/theirs depending on who reads. **Live: buyer sees `[me]` then `[Super Admin]`; seller sees the reverse** |
| 16 | A stranger can neither read nor write an order's thread | `services.test.ts` — 404 both ways, and the existing message count is unchanged. **Live: 404** |
| 17 | The thread opens with payment and closes with the order | `services.test.ts` — `pending_payment` 409; `disputed` **stays open** (201); `cancelled`/`refunded` 409 to write but still 200 to read |
| 18 | An empty message is refused twice over | `services.test.ts` — `""`, `"   "` and `"\n\t "` all 400, and the DB `CHECK` rejects a direct insert. **Live: 400** |
| 19 | Confirming completion is gone, not merely hidden | `services.test.ts` — the route 404s and the order stays `paid`. **Live: 404** |
| 20 | Anyone signed in can review, bought or not | `services.test.ts` — a passer-by posts, `order_id` null, rating recomputed. **Live: a user with no order posted 4★** |
| 21 | A reviewer who bought is marked verified, automatically | `services.test.ts` — `order_id` attached without the client naming it. **Live: buyer's review carried `order_id=2, verified=true`; the public list sorts it first** |
| 21a | One review per person per listing | `services.test.ts` — second attempt 409, and the unique index rejects a direct insert. **Live: 409** |
| 21b | You cannot review your own service | `services.test.ts` — 403, `total_reviews` unmoved, `my-review` reports `own_listing`. **Live: 403** |
| 21c | Reviewing needs an account — the public prefix reads but does not write | `services.test.ts` — anonymous POST 401. **Live: POST 401, GET 200.** This is the hole the GET-only fix closed |
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
| 32 | Terminal and disputed orders offer no money actions | `services.test.ts`. **Live: 409 across `cancelled`/`disputed` for cancel and refund** |
| 33 | Purchases and received orders are separated by role and carry the thread count | `services.test.ts` — the seller's purchases list is empty; both sides see the same count. **Live: `message_count=2` on the order** |
| 34 | The summary buckets by currency and never claims a payout | `services.test.ts` — AUD and GBP separate, `refunded_minor` replacing the confirmed bucket. **Live: `held_minor 2000`, `refunded_minor 0`, `payouts_live: false`** |
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
| 48 | The whole buyer journey works end to end | `services.test.ts` — order → pay → held → talk → review reaches the public listing as a verified purchase |
| 49 | A listing can use any active category; a retired or missing one is refused | `services.test.ts` — new category usable immediately, retired 400, unknown 400 |
| 50 | A category with listings cannot be deleted | `services.test.ts` — the `RESTRICT` FK rejects it, so an admin retires instead of orphaning |
| 51 | Admin sees listings, orders and per-currency totals, and only admins do | **Live: stats/listings/orders correct; a platform user 403, no token 401** |
| 52 | A seller cannot use a business service category | `services.test.ts` — 400 on create, and it is absent from both `/meta` and the public filter, so it was never offered. **Live: 400 "That category is no longer available"; picker shows the 7 personal rows only** |
| 53 | The two admin tabs never return each other's rows | **Live: `/service-categories` → 1 business row; `?scope=personal` → the 7 personal rows** |
| 54 | An admin adding a category reaches the portal with no deploy | **Live: created *Bike Repair* on Other Service Categories → present in the seller's picker and the public filter on the next request** |
| 55 | A person cannot create a category | **Live: no such route under `/my-services` (404); the admin route refuses a seller token (403)** |
| 56 | Scope is a closed set | **Live: `scope: "whatever"` → 400 naming `["business","personal"]`; the DB CHECK backs it** |
| 57 | A business category cannot be defaulted to a personal service | The scope filter sits on `replaceDefaultServices`, at the write — the FK alone would accept a personal id posted directly |

**Automated:** 55 backend tests, all passing (`DB_NAME=globalyapp_test npm test`). Every migration applies, rolls back and re-applies cleanly. `npx tsc --noEmit` clean on both sides. `yarn lint` introduces no new problems — back to the pre-existing baseline — now 3 errors and 2 warnings, the third having arrived with the rebase onto main in `admin/platform/categories/components/schema-fields-editor.tsx` (commit a39ca35). `next build` compiles every route.

**Live:** two full HTTP walks against `node --import tsx src/server.ts` on a scratch database.

*Seller and post-order* — listing CRUD, the price fix, the delete guard, all four reconciliation refusals, reload idempotency, the order thread, open reviews, cancel, dispute, refund **and its split-failure recovery**, the summary, role separation, terminal refusals and ownership.

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
⑧  buyer and seller message            is_mine flips per reader; order stays `paid`
⑨  a passer-by and the buyer review     4★ unverified + 5★ verified → avg 4.5, verified first
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
- **A real GCS upload.** No bucket is configured, so `uploadCover`'s storage path is unexercised beyond its unavailable-branch. The picker's *enabled* state is therefore also unobserved — only the disabled-with-explanation state can be seen here. See §6.4.
- **The category covers as rendered pixels.** The data path was confirmed live (`category_icon` arrives as `Map` and `Plane` for the two seeded listings) and the component compiles into every route, but the gradients themselves were not looked at in a browser. See §6.5.
- The provider-echo assertion in `retrieveSession` (the dev driver always echoes the session id it was given, so only real Stripe could return a different one)
- The **Other Service Categories** tab in a browser — its rule was walked over HTTP against the same endpoints the tab calls, and the tab reuses the existing category list, dialog and editor rather than introducing new UI
- **The order thread and the review form as rendered components.** Both were walked over HTTP against exactly the endpoints they call, and `is_mine` was confirmed to flip per reader, but the chat layout, the scroll behaviour of a long thread and the star picker on the public detail page were not observed in a browser
- **Concurrency in a thread.** There is no polling, no websocket and no refetch-on-focus: a message sent by the other party appears only on the next load of the page. Deliberate — see §14

There is no frontend test runner in this repo and adding one was out of scope, so the frontend is covered by typecheck, lint, build and review.

---

## 12. Launch reality

No V2 data is migrated, so every surface starts empty — but every one of them now has a real producer. Recorded rather than papered over; no fake producer was added to make anything look populated.

| Region | Producer | At launch |
|---|---|---|
| My Listings | the form built here | **real** |
| Public marketplace | any active listing | **real** — a listing is findable the moment it is saved |
| My Purchases · Received Orders | the Buy flow built here | **real** — no longer structurally empty |
| Earnings strip | the orders above | real, **0 in every currency** until someone buys |
| Admin → Other Services | everything above | **real**, read-only |
| Categories | seeded by migration, edited in Platform → Categories → **Other Service Categories** | **real**, 7 personal rows |
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

**Ledger rows this work had to remove.** Getting `migrate:latest` to run again on the local dev and test databases needed two repairs, both to `knex_migrations` only — **no schema object was created, altered or dropped by either**:

1. The renamed rows were renamed in place (`20260811_001…007` → `009…015`), matching the files commit `2f0cbfc` shipped.
2. Five rows named files that exist **in no commit on any branch** — `20260811_010_enquiries`, `011_favorites`, `012_notifications`, `013_business_invitation_index`, `014_membership_positions`. Knex treats a recorded migration with no corresponding file as corruption and halts, so these were deleted. They are leftovers from a branch whose migrations were renumbered out from under an already-migrated database; the tables they name were created by the surviving files under different version numbers.

If a teammate's database refuses to migrate with the same error, this is the fix — inspect `SELECT name FROM knex_migrations ORDER BY id` against `database/migrations/globalyapp/` before deleting anything, and delete only rows whose file is absent everywhere.

**A note for anyone who ran the withdrawn verification migration.** An earlier revision of this feature added `20260813_002_service_verification.ts` — per-listing approve/decline. It was withdrawn and the file deleted. A database that applied it will report the migration directory as corrupt, because the ledger names a file that no longer exists. Roll it back **before** pulling, or if you already pulled, delete that one ledger row and re-run:

```sql
DELETE FROM knex_migrations WHERE name = '20260813_002_service_verification.ts';
```

The columns it added (`verification_status`, `verification_note`, `verified_by`, `verified_at`) then need dropping by hand, since its `down` is gone with the file. Both databases here were rolled back properly before the file was removed, so neither is in that state.

### Files changed outside this feature

| File | Change | Why unavoidable |
|---|---|---|
| `src/server.ts` | one `app.register(servicesModule)` line | A Fastify module serves no routes until registered |
| `src/config.ts` | `NODE_ENV` and `STRIPE_SECRET_KEY`, both optional | `config.ts` is documented as the only place `process.env` is read |
| `package.json` | one `"test"` script | There was none; this is the only way the suite can run. No dependency added |
| `frontend/src/lib/store.ts` | one reducer line | `frontend/AGENTS.md` mandates registering the slice there |
| `personal-shell.tsx` | prefix nav match · `overflow-x-clip` on `<main>` · V2 header (square mark, plain "Personal" + divider, bordered avatar with chevron) | Equality left `Earn` dark the moment you opened anything it owns; `overflow-x-clip` lets the sub-nav's rule span the viewport without the 100vw box adding scrollbar-width of horizontal scroll; the header work was requested directly |
| `core/plugins/auth.plugin.ts` | a `publicPatterns` list beside the exact-match `publicPaths` Set, **matched for GET/HEAD only** | The Set cannot express `/api/v3/services/:id`. The method check is not cosmetic: the allow-list matches on **path alone**, so adding `POST /api/v3/services/:id/reviews` beside the existing GET would have silently opened anonymous review posting. Fixed in the shared matcher rather than at the one route, so every future route under that prefix inherits it |
| `superadmin/platform/index.ts` | one `app.register(adminOtherServicesRoutes)` line | Puts the admin routes inside the module that already carries the `super_admin` / `data_admin` guard, rather than re-implementing it |
| `admin/nav-config.ts` · `(web)/components/navbar.tsx` · `personal/page.tsx` | one nav row · the profile dropdown · a redirect for a section root that 404'd | Each requested directly; the `/personal` 404 predates this work (commit `e694e14` moved Home to `/personal/portal` and left no redirect) |
| `superadmin/platform/categories/*` (repo · schemas · routes · service) | `scope` on the service-category list, create and default-services write | The Other Service Categories tab is the same table and the same endpoints with a scope; a parallel module would have been the same code twice. The list route **defaults to `business`**, so every existing caller keeps its existing answer |
| `admin/platform/categories/*` (apis · store · const · types · list · dialog · editor) | a third tab and its scope plumbing | Adding a sibling tab to an existing tabbed screen cannot be done from outside it. The two new **files** are the editor route pages; everything else is a widened union and one extra store slot |

**The rename.** Superadmin already had a *Services* module, so this one is **Other Services** everywhere — route (`/api/v3/admin/platform/other-services`, `/admin/monitoring/other-services`), files (`other-services.routes.ts`, `admin-other-services-view.tsx`), the Redux key (`adminOtherServices`), the nav label and the API object. The seller-facing feature keeps its own names: it lives under `/personal/earn/services` and answers on `/api/v3/my-services`, and nothing there collided.

`tests/helpers.ts` and `tests/services.test.ts` are new files, not edits. `shared/*` and `app/geo/*` are consumed unchanged.

---

## 14. Follow-ups

| Item | Why |
|---|---|
| **Vetting who is selling, if fraud shows up** | The fixed category list constrains *what* may be sold, not who sells it or whether the description is honest. A per-listing review step is a separate feature and needs its own audit trail — see §2b |
| Slug style is inconsistent across the two eras | The seeded rows are snake_case (`airport_pickup`); the admin form's validator requires kebab-case, so anything added now is `bike-repair`. Cosmetic — nothing looks a category up by slug — but it will read oddly in the admin list |
| An optional-auth public read, so a seller doesn't see "Book" on their own listing | See §9.3 |
| A location filter on the marketplace | The API takes `country_id`/`city_id`; the UI offers search + category only |
| **A defined funds-holding model before any escrow language ships** | Blocks renaming "Payment held" to "In Escrow" — see §2 |
| Stripe Connect payouts | Blocks any claim that a seller has been paid |
| A Stripe webhook | Closes the abandoned-checkout gap that verify-on-return leaves |
| `GCS_BUCKET_NAME` for this environment | Turns cover upload on with no code change |
| **A defined release for held money** | Now the most pressing item: with dual confirmation removed, nothing closes an order at all, so a payment sits held indefinitely and a refund is the only way out. See §2c |
| **Review abuse controls** | One-per-person and no-self-review are the only guards. Rate limiting, account age and reviewer reputation are unbuilt — a determined actor with several accounts can still move a listing's average. See §2d |
| Messaging beyond the order | No inbox, no notifications, no attachments, no read receipts. `/personal/messages` is still a `ComingSoon` stub; the thread lives only on the order |
| Dispute resolution tooling | `disputed` is rendered; resolving it is Ops-owned and unbuilt |
| Multiple images, seller availability, buyer↔seller messaging | Source-PRD "future consideration"; order notes are the only channel today |
| A platform fee | None today: the listing price is what the buyer pays and what the seller is owed |
| A frontend test runner | The money conversion in `utils/` is the one pure function worth covering client-side |
