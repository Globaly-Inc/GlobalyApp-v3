# Feature: Credit management for the AI embed widget

Date: 2026-09-28
App: GlobalyApp-v3
Status: PENDING APPROVAL
Origin: product ask (2026-09-28) — *"create a credit management system for the AI embedding,
how to handle it, document it first."*

> **Stack note.** The `gh-architecture-docs` skill is written for React + Supabase. This repo is
> Fastify 5 + Knex + Postgres (multi-schema, no RLS) and Next.js App Router + Redux Toolkit.
> The process and approval gate are the skill's; the standards are this repo's. "RLS policy"
> reads "route guard"; "Edge Function" reads "service + repository"; "TanStack hook" reads
> "slice + thunk".

## Goal

Every reply the embedded counsellor gives on an institution's or business's website is paid for
in credits from that organisation's wallet, capped by a monthly budget the owner sets, with the
widget degrading gracefully and the owner warned before it stops.

## Who it's for

- **Institution and business owners** — pay for the widget, set its monthly budget, see what it
  costs, get warned before it goes dark.
- **Website visitors** — never see an error; when the counsellor is unavailable they see the
  organisation's published contact details instead.
- **Superadmin** — grants credits and reads the ledger, using the screens that already exist.

## Decisions taken (with the requester, 2026-09-28)

| Question | Decision |
|---|---|
| Who pays | The **owner's existing wallet**, the same way enquiry unlocks bill an organisation through `businesses.owner_id` / `institutions.platform_user_id`. No new wallet table. |
| Price | **1 credit per reply**, guest visitors included. The widget is on the organisation's own site, so the organisation pays for every visitor. |
| Out of credit / cap hit | Widget shows **unavailable with contact details**; owner is **emailed at 20 % of budget remaining and at zero**. |
| Top-up | **Superadmin grants only** for now. A purchase flow is a later feature; the ledger reason and reference shape leave room for it. |

## What already exists (and changes the shape of this work)

| Piece | Status today |
|---|---|
| Per-user wallet `credit_wallets` (free / subscription / purchased) with waterfall spend, `credit_transactions` ledger, superadmin ledger + manual adjust + daily/chart views | **Live.** `ai-counsellor/services/credit.service.ts`, `superadmin/revenue/*`. |
| Organisation → wallet resolution | **Live for enquiries.** `enquiries/repositories/distributions.repository.ts findRecipientBilling` maps a business or institution to its owner's `platform_user_id`. |
| Transactional multi-balance spend that throws 402 when short | **Live.** `creditService.spendCredits(trx, userId, amount, { reason, description })`. |
| Widget "credits" | **A counter, not a charge.** `ai_embed_configs.monthly_credit_limit` (owner-set, 1–100 000) and `credits_used_this_month` (+1 per reply, fire-and-forget, lazy monthly reset). `resolveActiveConfig` throws 429 when the counter reaches the limit. No wallet is ever touched; the "limit" costs nothing to raise. |
| Portal | Widget card shows `used / limit` as a progress bar. **Settings → Credits is a "Coming Soon" stub.** |
| Widget panel | Shows a generic error string on resolve failure; no unavailable state. |

So: **no new tables.** The work is wiring the existing wallet into the embed path, turning the
counter into a budget, and giving both sides of the widget something honest to show.

## Backend flow

1. **Gate, before the model runs.** `resolveActiveConfig(embedKey)` keeps its checks (exists,
   active, lazy monthly reset, monthly budget) and adds one: the owner wallet's total balance
   must be ≥ 1. Each failure has a distinct code: `WIDGET_INACTIVE` (403),
   `WIDGET_BUDGET_REACHED` (429), `WIDGET_OUT_OF_CREDIT` (402).
2. **Reply.** Both embed entry points — `POST /guest/messages` and `POST /messages` with
   `x-embed-key` — already funnel into `chat.service.handleMessage({ embed })`. Nothing changes
   until the assistant message is persisted.
3. **Charge, after success, in one transaction.** Replace today's fire-and-forget
   `incrementMonthlyUsage` with `chargeWidgetReply(config, messageId)`: `spendCredits(trx,
   ownerWalletUserId, 1, { reason: "widget_message", description: "Widget reply — <widget name>
   · message <id>" })` and `credits_used_this_month + 1` in the same `trx`. A model failure
   never charges (PRD §7 rule, already how personal chat behaves).
4. **Race to zero.** The gate reads the balance without a lock; the spend locks the wallet.
   If two replies are in flight on the last credit, the second `spendCredits` throws 402 after
   the reply already streamed. Log at warn, do not fail the delivered reply; the next request
   is blocked by the gate. Overrun is bounded by concurrent in-flight replies, which the existing
   per-key rate limit already caps.
5. **Warn the owner.** After a successful charge compute `remaining = min(budget − used,
   wallet total)`. Crossing 20 % of budget → enqueue `widget_low_credit`; reaching 0 → enqueue
   `widget_out_of_credit`. Each fires **once per month per widget**, tracked by two timestamp
   columns that the lazy monthly reset clears.
6. **Tell the widget why.** `GET /embed/resolve` gains `status: "active" | "inactive" |
   "budget_reached" | "out_of_credit"` and, when not active, `contact: { email, phone, website }`
   from the owner's own profile row. The panel renders an unavailable card with those details
   instead of an error string. Resolve stays cheap: one wallet read.
7. **Show the owner the money.** Widget list gains `owner_balance` and `cost_per_reply` (constant
   1 for now); a per-widget usage endpoint aggregates the ledger; Settings → Credits stops being
   a stub. Superadmin's ledger and chart get `widget_message` in their reason filter.

## Data design

- **New tables:** none.
- **Modified tables**

  | Table | Change | Why |
  |---|---|---|
  | `globalyapp.ai_embed_configs` | `+ low_credit_notified_at timestamptz null`, `+ out_of_credit_notified_at timestamptz null` | Once-per-month notification dedupe; cleared by the lazy monthly reset. |
  | `globalyapp.credit_transactions` | `reason` gains the value `widget_message`: alter the CHECK constraint `chk_ct_reason` (verified live: it enumerates `signup_grant, message, purchase, admin_grant, subscription_grant, enquiry_unlock`) and the TS union in `credits.repository.ts` | Ledger rows must be filterable by admin and by the per-widget usage query. |

- **Reused as-is:** `credit_transactions.reference_type = "ai_message"`, `reference_id = messages.id`.
  The per-widget usage query joins ledger → `ai_counselor_messages` → `ai_counselor_sessions.embed_config_id`;
  no `embed_config_id` column on the ledger is needed.
- **Semantics change, no column change:** `monthly_credit_limit` becomes the owner's **monthly
  budget** — a self-imposed ceiling on spend, never a source of credits. Effective allowance is
  `min(budget − used, wallet total)`. The 1–100 000 validation stays; raising it past the balance
  is allowed and simply means "spend everything".
- **Wallet resolution:** one small helper `ownerWalletUserId(config)` in `embed.repository.ts`
  (institution → `institutions.platform_user_id`, business → `businesses.owner_id`), mirroring
  `findRecipientBilling`. Extracting a shared helper for both callers is a nice-to-have, not
  required.
- **Route guards:** unchanged. Owner endpoints stay behind `requireInstitutionContext` /
  business ownership; superadmin endpoints stay in the superadmin scope; embed endpoints stay
  public with their existing per-key rate limit.
- **Async jobs:** two email jobs published to the `emails` queue, which the auth email worker
  already consumes generically (verified: `queueService.consume("emails", …)`), sent with the
  shared `mailerService`. The enquiries outbox is not needed: a missed warning email is
  recoverable (the portal card shows the same state), an unsent enquiry notification is not.
- **3rd-party dependencies:** none.

## API surface

| Route | Change |
|---|---|
| `GET /embed/resolve` | `+ status`, `+ contact` (only when not active) |
| `POST /guest/messages`, `POST /messages` (embed) | Gate errors carry codes `WIDGET_INACTIVE` 403, `WIDGET_BUDGET_REACHED` 429, `WIDGET_OUT_OF_CREDIT` 402 |
| `GET /ai-chat/embed/configs` | `+ owner_balance`, `+ cost_per_reply` |
| `GET /ai-chat/embed/configs/:id/usage?days=30` | New: `[{ date, replies, credits }]` from the ledger |
| `GET /superadmin/credits/ledger`, `/chart` | `widget_message` accepted by the reason filter |

## Frontend

| Portal | Screen | Change |
|---|---|---|
| business | AI Widget → widget card | Budget bar becomes `replies this month / budget`, plus wallet balance and a "1 credit per reply" line; out-of-credit and budget-reached states in red with a link to Settings → Credits |
| business | Settings → Credits | Replace Coming Soon: wallet balance by type, ledger filtered to `widget_message` and `enquiry_unlock`, per-widget usage chart (Recharts, as the admin dashboard uses) |
| embed | `/embed/[key]` panel | Unavailable card for the three non-active statuses, showing the contact details; composer hidden |
| admin | Revenue → Credits | `widget_message` in the reason dropdown |

Redux: extend `aiWidgetSlice` (balance, usage thunk); new `businessCreditsSlice` for the settings
page. Zod schemas beside the existing embed schemas in `chat.schema.ts`.

## Approaches considered

**A — Owner wallet + monthly budget (chosen).** Reuses the wallet, ledger, spend, grants, and
admin screens that exist; only the embed path and two nullable columns change.
+ One credit system, one ledger, one admin tool. − An organisation's credits are legally the
owner's; changing owner moves the bill (already true for enquiries). Complexity: **Low–Medium**.

**B — Organisation wallet.** New `org_credit_wallets` keyed on business / institution.
+ Clean ownership. − Second wallet mechanism, second ledger, second admin screen; the enquiry
work explicitly chose not to do this. Complexity: **High**.

**C — Cap only, no charge.** Make the counter honest and admin-controlled.
+ Smallest. − Still no revenue and no reason for the cap to be respected. Complexity: **Low**.

## Out of scope

- Buying credits (Stripe or otherwise); per-widget pricing; free monthly allowances.
- Organisation-owned wallets; transferring credits between users.
- SMS / in-app notifications; only email.
- Charging for the institution-memory learning worker's model calls (internal cost, not billed).
- Refunding a charge when a reply is later thumbed down or corrected.

## Risks & open questions

1. **`credit_transactions.reason` constraint — resolved.** `chk_ct_reason` is an enumerating
   CHECK; the migration drops and recreates it with `widget_message` added.
2. **Which email queue — resolved.** The `emails` queue and auth worker; see Data design.
3. **Lazy wallet creation.** `ensureWallet` grants 10 free signup credits on first touch. An
   organisation owner who has never opened the personal chat gets those 10 free widget replies.
   Acceptable; note it in the release notes or set the grant to 0 for org owners (decide at plan).
4. **Owner with no wallet or a deleted owner.** Treated as `out_of_credit`; the widget shows
   contact details. No crash path.
5. **Existing counters.** Widgets 1, 3, 4 on dev show `4 / 1000` today. The migration does not
   touch them; the next lazy reset zeroes them as now.
6. **Rollback.** `down` drops the two columns; reverting the code restores the counter-only
   behaviour. `widget_message` ledger rows remain and are harmless.
7. **Audit.** Every charge is a ledger row with a description naming the widget and message;
   the superadmin ledger already searches descriptions. No extra audit table.

---

**Design Summary:** Widget replies stop being free. Each successful reply spends one credit
from the owner's existing wallet inside the same transaction that bumps the widget's monthly
counter, which becomes a budget the owner controls. A pre-model gate refuses with a specific
code when the widget is inactive, over budget, or the wallet is empty; the widget resolves that
state into an "unavailable, contact us" card rather than an error. Owners are emailed once per
month at 20 % remaining and at zero, tracked by two new nullable timestamps on the widget row.
Superadmin keeps granting and auditing through the screens it already has. No new tables, no
new wallet mechanism, no payment provider yet.

Spec saved → `docs/superpowers/specs/2026-09-28-embed-widget-credits-design.md`
Plan skeleton saved → `docs/superpowers/plans/2026-09-28-embed-widget-credits.md`
Migration skeleton in chat — review against the live `credit_transactions` constraint before running.

Type **"approved"** to hand off to the implementation plan, or tell me what to change.
