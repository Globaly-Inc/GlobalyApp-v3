# Auth Module

Unified OTP-based authentication for all user types. No passwords — email OTP only.

## Identity Model

**Every user is a platform_user first.** Admin and business roles are link records, not separate identities.

| Entity | Table | Purpose |
|--------|-------|---------|
| `platform_users` | globalyapp.platform_users | Master identity — ONE row per person, holds all auth fields |
| `admin_users` | superadmin.admin_users | Role-link: `platform_user_id` + admin `role` |
| `business_members` | globalyapp.business_members | Membership: `platform_user_id` + `business_id` + `role` |
| `agents` | per-business DB | Lightweight record: `platform_user_id` + `role_id` (no auth fields) |

## Auth Flow

```
POST /register     → creates platform_user + generates OTP (email fire-and-forget)
POST /send-otp     → generates 6-digit OTP (10 min expiry), per-email brute-force protection
POST /verify-otp   → validates OTP, returns { access_token, refresh_token, user, accounts }
POST /refresh      → rotates both tokens (hashed refresh stored in DB)
POST /switch-account → issues scoped access_token for a specific business (requires auth)
GET  /me           → returns user profile + list of business memberships
```

## OTP Security

- 6-digit code, 10 minute expiry
- Max 5 attempts per email before 30-minute lockout (`otp_attempts`, `otp_locked_until`)
- Rate limiting per-IP: 5 req/1 min on `/send-otp`, 10 req/5 min on `/verify-otp`
- OTP fields reset on new OTP generation

## JWT Payload

```ts
// Base token (after login)
{ sub: platformUserId, type: "admin" | "platform_user", email, role? }

// Scoped token (after account switch)
{ sub: platformUserId, type: "platform_user", email, orgId: db_name, orgRole: "owner" | ... }
```

- `sub` is ALWAYS the platform_user.id
- `type: "admin"` when user has an admin_users record
- `orgId` = business.db_name (UUID), present after switching to a business context
- `orgRole` = role from business_members (owner, admin, manager, counsellor, member)

## Account Switching

1. User logs in → gets base JWT (no orgId)
2. `GET /me` returns `businesses: [{ org_id, business_name, role, ... }]`
3. `POST /switch-account { org_id }` → new access_token with `orgId` + `orgRole`
4. Refresh token stays the same (identity-level, not account-level)
5. Tenant plugin resolves `req.db` from `orgId` in JWT

## Refresh Token Security

- Raw 40-byte hex returned to client
- SHA-256 hash stored in DB
- Token family UUID for future reuse detection
- Single refresh token per identity (new login invalidates old)

## Key Decisions

- OTP email is fire-and-forget. Registration/send-otp never fails due to email service being down.
- Subdomain uniqueness enforced by DB constraint (not check-then-insert).
- If business DB provisioning fails, the business row is deleted.
- `agents` table in per-business DB holds NO auth fields — just `platform_user_id` + role.
- Business membership tracked in BOTH `business_members` (master DB, queryable) and `agents` (per-business DB, role_id FK).

## Public Paths (no JWT required)

Defined in `core/plugins/auth.plugin.ts`:
- `/api/v3/auth/send-otp`, `/verify-otp`, `/refresh`, `/register`
- `/api/v3/admin/users/invite/accept`
- `/api/v3/agents/invite/accept`
- `/healthz`
