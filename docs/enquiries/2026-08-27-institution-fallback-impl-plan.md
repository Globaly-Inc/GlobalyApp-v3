# Institution fallback — implementation plan

**Goal.** When an enquiry matches no business, it goes to the institution the course belongs to.
The institution is emailed, signs in, and works the lead from its own Enquiries tab: same unlock
paywall, same chat with the student.

**Decisions taken** (2026-08-27):

| Question | Decision |
|---|---|
| What the institution sees | Same unlock/paywall as a business — teaser first, contact after unlock |
| Replying | Full chat, in the institution's own portal — not a read-only referral list |
| Unclaimed institutions (`account_status = 0`) | Emailed anyway, with a claim-your-account CTA; the lead waits in the tab |

## Why a polymorphic recipient, not a "business row for the institution"

`promote.service` routes a job to `institutions` **or** `businesses`, never both, so an institution
has no `businesses` row — and `enquiry_distributions.business_id` is a NOT NULL FK to `businesses`.
Two shapes could bridge that:

1. **Give the institution a linked `businesses` row** sharing its tenant schema. Everything
   downstream (unlock, chat, tenant sync) then works untouched — but `migration-runner.ts` selects
   `businesses WHERE schema_provisioned_at IS NOT NULL` and applies the **business** template to that
   schema, so a shared schema would get the business tables poured into it. It also puts two identity
   rows behind one org, which every `businesses` count, listing and claim flow would then have to
   exclude.
2. **Let a distribution belong to a business *or* an institution** (chosen). Honest model, enforced
   by a CHECK constraint rather than convention, and the branches it needs are small and local.

## Phase 1 — the lane exists (backend, no UI)

1. `globalyapp/20260827_002_enquiry_distributions_institution.ts` — add `institution_id` FK,
   drop NOT NULL on `business_id`, `CHECK (num_nonnulls(business_id, institution_id) = 1)`,
   partial unique on `(enquiry_id, institution_id)`.
2. `institution/20260827_001_business_enquiries.ts` — the tenant mirror inside institution schemas.
   Deliberately the **same table name** as the business template so one query serves both tenants.
3. `matching.service` — before `markNoMatch`, fall back to `enquiries.institution_id`.
4. `tenant-sync.service` — resolve the schema from `institutions` when the row is an institution's.
   Skips an unclaimed institution, which has no schema yet.
5. `email-queue.service` + `templates.ts` — `enquiry_institution_fallback`, CTA switching between
   "claim your account" and "view enquiry" on `account_status`.

## Phase 2 — the institution can work the lead

6. `auth.plugin` / `tenant.plugin` — the enquiry endpoints move to
   `requireBusinessOrInstitutionContext`; institution context resolves to the institution id the
   distribution is keyed by. Institution members have no resolvable permissions today
   (`requireInstitutionRole` is name-based), so `enquiries:*` is owner/member by name there.
7. `distributions.service` / `messages.service` — participant checks accept an institution
   recipient; `unlock` and `close` key off whichever id the distribution carries.
8. Unlock cost stays `credits.service`'s single in-memory pool — the same placeholder businesses
   use. No institution wallet is being invented here.

## Phase 3 — UI

9. `business-shell.tsx` — drop Enquiries/Messages from `INSTITUTION_HIDDEN_ITEMS`; the existing
   inbox screens call the same endpoints, which by then accept institution context.
10. Admin monitoring — the recipients table names the institution and marks the row as a fallback.

## Coverage gap to accept

`enquiries.institution_id` is derived from the course's job at creation (`findInstitutionIdByJobId`),
and is NULL when that job was promoted to a **business** rather than an institution. Those enquiries
still end at `no_match` — there is no institution to fall back to. Worth measuring on the admin
screen before deciding whether it needs its own answer.
