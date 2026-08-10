# Auth Module

Unified OTP-based authentication for all user types. No passwords — email OTP only.

## Identity Model

**Every user is a platform_user first.** Admin and business roles are link records, not separate identities.

| Entity | Table | Purpose |
|--------|-------|---------|
| `platform_users` | globalyapp.platform_users | Master identity — ONE row per person, holds all auth fields |
| `admin_users` | superadmin.admin_users | Role-link: `platform_user_id` + admin `role` |
| `user_business_index` | globalyapp.user_business_index | Membership index: `platform_user_id` + `business_id` + `role` |
| `agents` | per-business DB | Lightweight record: `platform_user_id` + `role_id` (no auth fields) |

## Auth Flow

```
POST /register       → creates platform_user (account_status=0) + generates OTP
POST /send-otp       → generates 6-digit OTP (10 min expiry), per-email brute-force protection
POST /verify-otp     → validates OTP, activates account (status=1), returns tokens + user
POST /refresh        → rotates both tokens (hashed refresh stored in DB), IP/device logged
POST /logout         → invalidates refresh token + clears session metadata (204)
POST /switch-account → issues scoped access_token for a specific business (requires auth)
GET  /me             → returns user profile + list of business memberships
```

## Registration Flow

1. User provides first_name, last_name, email → `platform_user` created with `account_status=0`
2. OTP sent via email (fire-and-forget via RabbitMQ)
3. User verifies OTP → `account_status` set to 1, `is_email_verified` set to true
4. User is now authenticated — chooses Personal or Business account during onboarding
5. `platform_user` remains the root identity across all account types

## OTP Security

- 6-digit code, 10 minute expiry
- **Hashed with scrypt** (slow hash — prevents brute-force if DB leaks). Salt embedded in stored string.
- Max 5 attempts per email before 30-minute lockout (`otp_attempts`, `otp_locked_until`)
- Rate limiting per-IP: 5 req/1 min on `/send-otp`, 10 req/5 min on `/verify-otp`
- OTP fields reset on new OTP generation

## JWT Payload

```ts
// Base token (after login)
{ sub: platformUserId, type: "admin" | "platform_user", email, role? }

// Scoped token (after account switch)
{ sub: platformUserId, type: "platform_user", email, orgId: schema_name, orgRole: "owner" | ... }
```

- `sub` is ALWAYS the platform_user.id
- `type: "admin"` when user has an admin_users record
- `orgId` = business.schema_name (UUID), present after switching to a business context
- `orgRole` = role from per-business agents table (owner, admin, manager, counsellor, member)

## Account Switching

1. User logs in → gets base JWT (no orgId)
2. `GET /me` returns `businesses: [{ org_id, business_name, role, ... }]`
3. `POST /switch-account { org_id }` → new access_token with `orgId` + `orgRole`
4. Refresh token stays the same (identity-level, not account-level)
5. Tenant plugin resolves `req.db` from `orgId` in JWT

## Refresh Token Security

- Raw 40-byte hex returned to client (format: `{userId}.{random}`)
- SHA-256 hash stored in DB (high-entropy input, fast hash is safe)
- Token family UUID for reuse detection — replay of rotated token nukes the family
- Single refresh token per identity (new login invalidates old)
- **IP/device binding**: `ip_address` and `user_agent` tracked on issuance and checked on refresh (warn-only, not blocking)

## Permissions Model

Permissions are defined per business schema:

- `permissions` table: defines available permissions with `module` + `action` (e.g. `crm:write`)
- `role_permissions` junction: links `role_id` to `permission_id`
- `requirePermission("module:action")` guard resolves: agent → role → role_permissions → permissions

Default roles and permissions are seeded on business schema provisioning.

## Soft Delete

All tables use `deleted_at` for soft delete. Audit log tables are append-only (never deleted).

## Key Decisions

- OTP email is fire-and-forget. Registration/send-otp never fails due to email service being down.
- Subdomain uniqueness enforced by DB constraint (not check-then-insert).
- If business DB provisioning fails, the business row is deleted.
- `agents` table in per-business DB holds NO auth fields — just `platform_user_id` + role.
- Business membership tracked in BOTH `user_business_index` (master DB, display/listing) and `agents` (per-business DB, authoritative for role_id + permissions).
- New users created via invitation get `account_status=0` — must verify OTP to activate.

## Public Paths (no JWT required)

Defined in `core/plugins/auth.plugin.ts`:
- `/api/v3/auth/send-otp`, `/verify-otp`, `/refresh`, `/register`
- `/api/v3/admin/users/invite/accept`
- `/api/v3/agents/invite/accept`
- `/healthz`
