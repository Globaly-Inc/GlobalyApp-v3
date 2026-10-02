# Plan: Credit management for the AI embed widget

Spec: `docs/superpowers/specs/2026-09-28-embed-widget-credits-design.md` — do not start until it says APPROVED.

## Tasks

### Backend
- [ ] Migration `database/migrations/globalyapp/2026MMDD_001_ai_embed_credits.ts`: add `low_credit_notified_at`, `out_of_credit_notified_at` to `ai_embed_configs`; drop and recreate `chk_ct_reason` on `credit_transactions` with `widget_message` added
- [ ] `credits.repository.ts`: add `widget_message` to the `reason` union
- [ ] `embed.repository.ts`: `ownerWalletUserId(config)`; `resetMonthlyUsage` also clears both notified timestamps; usage aggregation query (ledger → messages → sessions by `embed_config_id`)
- [ ] `embed.service.ts`: `resolveActiveConfig` checks wallet balance; typed errors `WIDGET_INACTIVE` / `WIDGET_BUDGET_REACHED` / `WIDGET_OUT_OF_CREDIT`; `widgetStatus(config)` for resolve
- [ ] `credit.service.ts` or `embed.service.ts`: `chargeWidgetReply(config, messageId)` — `spendCredits` + counter increment in one transaction; warn-and-continue on 402 after delivery
- [ ] `chat.service.ts`: replace fire-and-forget `incrementMonthlyUsage` with `chargeWidgetReply`; then threshold check → enqueue `widget_low_credit` / `widget_out_of_credit`
- [ ] Email jobs: two templates via `shared/mail/mailerService`, published to the `emails` queue the auth email worker consumes
- [ ] `embed.routes.ts`: `GET /embed/resolve` returns `status` + `contact`; `GET /ai-chat/embed/configs` returns `owner_balance`, `cost_per_reply`; new `GET /ai-chat/embed/configs/:id/usage`
- [ ] `superadmin/revenue`: accept `widget_message` in ledger and chart reason filters
- [ ] Tests (`tests/embed-credits.ts`, harness style): gate codes; charge + counter atomic; no charge on model failure; race-to-zero warns not throws; thresholds fire once per month; resolve status/contact shape

### Frontend
- [ ] `business/ai-widget`: types + slice for `owner_balance`, `cost_per_reply`, usage thunk; widget card budget bar, balance line, red states, link to Settings → Credits
- [ ] `business/settings/credits/page.tsx`: replace Coming Soon — balance by type, filtered ledger, per-widget usage chart (`businessCreditsSlice`, Recharts)
- [ ] `embed/[key]`: `EmbedPublicConfig` gains `status`, `contact`; unavailable card component; composer hidden when not active
- [ ] `admin` revenue credits: `widget_message` option in the reason filter

### Verification
- [ ] Dev DB: AIT widget (config 3, owner wallet of institution 49's platform user) — send a reply, confirm one `widget_message` ledger row and counter +1; set budget to `used + 1`, confirm 429 and the unavailable card; zero the wallet, confirm 402 and the email job
- [ ] Superadmin ledger shows the rows with the widget name in the description
