# Backend Audit Report — 2026-09-03

> Scope: Fastify 5 backend (`/backend/src`). Issues found by static analysis of routes, services, repositories, plugins, and config.

---

## CRITICAL

### 1. Credit gate hardcoded off — users get free AI access
**File**: `backend/src/modules/ai-counsellor/routes/chat.routes.ts:52–57`  
`CREDIT_GATE_ENABLED = false` is never flipped. Every user bypasses credit checks regardless of balance.  
**Fix**: Delete the flag, inline the enabled path, or re-enable before any paid launch.

---

## HIGH

### 2. SQL injection via template literals in raw queries (3 locations)
**Files**:
- `backend/src/modules/referrals/repositories/referrals.repository.ts:81` — `` whereRaw(`referral_codes.owner_id = ${table}.id`) ``
- `backend/src/modules/page-views/repositories/page-views.repository.ts:85–89` — table name interpolated into `INSERT ... ON CONFLICT` raw SQL
- `backend/src/modules/saved-items/repositories/saved-items.repository.ts:40,43` — table name interpolated into raw SQL

`table`/`T` are internal constants, not user input, so immediate risk is low — but this pattern breaks the moment any dynamic value is introduced. Knex has `.ref()` and `??` placeholders for identifiers.  
**Fix**: Use Knex's `knex.ref(table)` or `??` identifier binding instead of template literals.

### 4. Email queue failures are silent — OTP never sent, user can't log in
**File**: `backend/src/modules/auth/auth.service.ts:230, 260, 282`  
Every `queueEmail()` call ends in `.catch(log)`. If the queue publish fails, the user receives no OTP and no error; the API returns 200.  
**Fix**: Either rethrow so the route returns a 500, or use a dead-letter queue with alerting.

### 5. AI config flags require redeployment to toggle
**File**: `backend/src/config.ts:59–62`  
`AI_COUNSELLOR_TOOLS` is read once at startup. Changing diagnostic tool behavior (e.g. during an incident) requires a full deploy.  
**Fix**: Low priority if deployments are fast; otherwise expose an admin endpoint or use a feature-flag store.

---

## MEDIUM

### 6. Queue publish outside transaction — orphaned enquiries possible
**File**: `backend/src/modules/enquiries/services/enquiries.service.ts:101–150`  
DB transaction commits (enquiry + audit row), then message is published to the queue. If publish fails, the enquiry exists in the DB but is never processed. The failure is only logged.  
**Fix**: Publish inside the transaction using transactional outbox pattern, or at minimum surface the error to the caller.

### 7. SSE client disconnect not tracked during streaming
**File**: `backend/src/modules/ai-counsellor/services/chat.service.ts:120–123`  
`reply.raw.destroyed` is checked once before streaming starts. If the client disconnects mid-stream, the server keeps processing and calling the AI API, wasting tokens and CPU.  
**Fix**: Add a `req.raw.on('close', () => aborted = true)` guard and check `aborted` before each chunk write.

### 8. N+1: storage URL resolution per card/enquiry
**Files**:
- `backend/src/modules/ai-counsellor/services/chat.service.ts:26–46`
- `backend/src/modules/enquiries/services/enquiries.service.ts:179–192`

`Promise.all(items.map(x => storage.resolvePreviewUrl(x.logo)))` fires one signed-URL request per item. For large result sets this is slow.  
**Fix**: Batch-sign URLs if the storage SDK supports it; otherwise cache signed URLs with a short TTL.

### 9. Business registration: referral code + welcome post failures swallowed
**File**: `backend/src/modules/businesses/services/businesses.service.ts:102–116`  
`.catch()` on `issueCode()` and `createSystemPost()` only logs. A registration appears successful even if these steps fail silently.  
**Fix**: Alert or queue a retry; don't silently drop these.

### 10. JWT org role can be stale after role change
**File**: `backend/src/core/plugins/auth.plugin.ts:104–124`  
`requireInstitutionRole()` re-reads the role from the DB, which is correct — but the JWT still carries the old role. On next token refresh, the stale role is re-minted until the user logs out.  
**Fix**: Do not include mutable roles in the JWT payload, or force a token refresh on role change.

### 11. Loose equality on `deleted_at` null check
**File**: `backend/src/modules/saved-items/repositories/saved-items.repository.ts:48`  
`deleted_at == null` (loose) instead of `=== null`. Low probability of a bug today, breaks if the value ever becomes `undefined`.  
**Fix**: `=== null`.

---

## LOW

### 12. Dead code — credit gate path never executed
**File**: `backend/src/modules/ai-counsellor/routes/chat.routes.ts:52–57`  
Same as issue #1. The entire guarded block is unreachable.  
**Fix**: Delete it.

### 13. Page views switch has no default/exhaustive case
**File**: `backend/src/modules/page-views/repositories/page-views.repository.ts:23–73`  
Adding a new `entityType` enum value silently hits no case and returns nothing.  
**Fix**: Add `default: throw new Error(`Unknown entityType: ${entityType}`)`.

### 14. Health endpoint response shape inconsistency
**File**: `backend/src/server.ts:96–135`  
`/health/mail` returns `{ status: "degraded" }` on failure; other health endpoints return error objects. Inconsistent for any monitoring consumer.  
**Fix**: Standardize to `{ status, error? }` across all health routes.

### 15. Storage path has no uniqueness guarantee on chat attachments
**File**: `backend/src/modules/ai-counsellor/routes/chat.routes.ts:29`  
Path is `ai-chat/${userId}/attachments/${filename}`. Re-uploading the same filename silently overwrites the previous file.  
**Fix**: Prefix with a UUID or timestamp: `ai-chat/${userId}/attachments/${Date.now()}-${filename}`.

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 1 |
| High     | 4 |
| Medium   | 6 |
| Low      | 4 |

**Top 3 to fix now:**
1. Re-enable or remove the credit gate (#1)
2. Rethrow email queue failures (#4) — silent auth failure is the worst UX
3. Fix SQL template literal pattern (#2) — low risk now, fragile long-term
