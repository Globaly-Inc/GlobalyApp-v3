# Auth Module

Unified OTP-based authentication for all user types. No passwords — email OTP only.
All user types (personal, business, superadmin) log in through the same API. There are no separate login endpoints.

## Identity Model

**Every user is a platform_user first.** Admin and business roles are link records, not separate identities.

| Entity | Table | Purpose |
|--------|-------|---------|
| `platform_users` | globalyapp.platform_users | Master identity — ONE row per person. NO auth state (OTP/tokens moved out). Has `is_personal_account`, `is_business_account` flags and `account_categories` JSONB array. |
| `auth_otp_challenges` | globalyapp.auth_otp_challenges | Ephemeral OTP challenges — auto-expire, purged by cron |
| `auth_sessions` | globalyapp.auth_sessions | Per-device sessions — refresh token + family per session |
| `admin_users` | superadmin.admin_users | Role-link: `platform_user_id` + admin `role` |
| `user_business_index` | globalyapp.user_business_index | Membership index: `platform_user_id` + `business_id` + `role` |
| `agents` | per-business DB | Lightweight record: `platform_user_id` + `role_id` (no auth fields) |

## Auth Flow

```
POST /register       → creates platform_user (account_status=0) + OTP in auth_otp_challenges
POST /send-otp       → generates 6-digit OTP (10 min expiry), per-email brute-force protection
POST /verify-otp     → validates OTP, activates account (status=1), creates session, returns tokens
POST /refresh        → rotates both tokens per-session, IP/device logged
POST /logout         → pass refresh_token to logout single device, omit to logout all (204)
POST /switch-account → issues a scoped access_token for a specific business (requires auth) — kept for
                        future multi-business use; today's frontend doesn't call it, see below
GET  /me             → returns user profile + list of business memberships
```

## Registration Flow

1. User provides first_name, last_name, email → `platform_user` created with `account_status=0`, both account flags `false`, `account_categories=[]`
2. OTP sent via email (fire-and-forget via RabbitMQ) — challenge stored in `auth_otp_challenges`
3. User verifies OTP → `account_status` set to 1, `is_email_verified` set to true
4. User is now authenticated — chooses Personal or Business account during onboarding
5. `platform_user` remains the root identity across all account types
6. **Anti-enumeration**: duplicate registration returns same response shape + sends "someone tried to register" email — **except** when the email is the owner of a pre-seeded, not-yet-claimed business (`businesses.claim_status != 'claimed'`), in which case registration is blocked with a `BUSINESS_CLAIM_AVAILABLE` (409) error naming the business and offering to claim it. Confirming triggers `POST /businesses/claim/request { email }` (public, silent no-op if nothing matches), which emails a claim link reusing the same `claim_token` flow as the admin-initiated "Send claim request."

## User Type Detection (Single Login, Post-Auth Routing)

All user types authenticate through the same `POST /verify-otp` endpoint. There is no user-type selection at login. The system discovers the user's type(s) **after** OTP verification:

1. OTP verified against `auth_otp_challenges` (same for everyone)
2. System queries `superadmin.admin_users` for a role-link matching the `platform_user_id`
3. If admin record exists → JWT signed with `type: "admin"`, `role: "super_admin"|"admin"|...`
4. If no admin record → JWT signed with `type: "platform_user"`
5. Response includes `is_personal_account`, `is_business_account`, and `businesses[]` array

**Frontend routing after login** (based on response fields):
- `user.type === "admin"` → admin dashboard
- `is_personal_account === true` → personal profile
- `is_business_account === true` → business picker / business dashboard
- Both flags `false` → onboarding flow (choose personal or business)
- A user can be both personal AND business simultaneously

## Account Type Flags (`platform_users`)

| Column | Type | Default | Set when |
|--------|------|---------|----------|
| `is_personal_account` | boolean | `false` | User completes personal onboarding (`POST /platform-users/me/onboarding/personal`) |
| `is_business_account` | boolean | `false` | User registers a business or accepts a business agent invitation |
| `account_categories` | jsonb | `[]` | Appended on each onboarding/invitation — tracks history of all roles |

`account_categories` example:
```json
[
  {"type": "personal", "role": "student"},
  {"type": "business", "role": "education_agent"}
]
```

Entries are append-only and deduplicated (same type+role pair is not added twice). The personal sub-category (student, explorer, etc.) is also stored on `platform_user_profiles.individual_category`. The business sub-category lives in `businesses.business_type`.

## OTP Security

- 6-digit code, 10 minute expiry, stored in `auth_otp_challenges` (NOT on platform_users)
- **Hashed with scrypt** (slow hash — prevents brute-force if DB leaks). Salt embedded in stored string.
- Constant-time comparison via `timingSafeEqual`
- Max 5 attempts per email before 30-minute lockout
- Rate limiting per-IP: 5 req/1 min on `/send-otp`, 10 req/5 min on `/verify-otp`
- Previous challenge deleted when new OTP is generated
- Challenge hard-deleted after successful verification

## JWT Payload

```ts
// Base token (after login — platform user)
{ sub: platformUserId, type: "platform_user", email }

// Base token (after login — admin user)
{ sub: platformUserId, type: "admin", email, role: "super_admin" | "admin" | "data_admin" | "moderator" }

// Scoped token (business account, once they have a business)
{ sub: platformUserId, type: "platform_user", email, orgId: schema_name, orgRole: "owner" | "admin" | "manager" | "counsellor" | "member" }
```

- `sub` is ALWAYS the `platform_users.id`
- `type` is determined by checking `superadmin.admin_users` at login time — NOT from a stored flag
- `orgId` + `orgRole` are set at `POST /verify-otp` time from the user's (single) business membership — the frontend doesn't need `/switch-account` for this

## Business Context on Refresh

1. User logs in → `verify-otp` looks up business memberships and, if any, signs the access token with `orgId`+`orgRole` right away
2. `GET /me` returns `businesses: [{ org_id, business_name, role, ... }]` (for display — not needed to establish context)
3. Tenant plugin resolves `req.db` from `orgId` in JWT
4. On `POST /refresh`, business memberships are looked up again and `orgId`/`orgRole` are re-signed onto the new access token — no separate switch-account round trip needed

## Sessions (Multi-Device)

- One `auth_sessions` row per device/login
- Login creates a new session (does NOT invalidate other devices)
- Each session has its own refresh token + token family UUID
- `device_label` derived from user-agent (e.g. "Chrome", "Mobile")
- **Rotation**: new hash on every refresh, same family
- **Reuse detection**: replayed token → delete ALL sessions for that user (nuclear option)
- **Logout**: pass `refresh_token` to logout single device, omit to logout all devices
- **Expiry**: sessions expire after 30 days, purged by cron

## Invitation Acceptance

Invitations use POST (not GET) to prevent side effects from link scanners:
- `POST /api/v3/admin/users/invite/accept { token }` — admin invitation
- `POST /api/v3/agents/invite/accept { token, org_id }` — business agent invitation

Email links point to frontend pages (`/invite/admin/accept`, `/invite/agent/accept`) which render a confirmation button that POSTs to the API.

On agent invitation acceptance:
- `is_business_account` set to `true` on the platform_user
- Category appended to `account_categories` (e.g. `{"type": "business", "role": "member"}`)

## Onboarding Endpoints

```
POST /platform-users/me/onboarding/personal    → sets is_personal_account=true, appends to account_categories
POST /platform-users/me/onboarding/business     → sets is_business_account=true, appends to account_categories, provisions tenant schema
POST /platform-users/me/onboarding/institution  → creates institution record (no tenant schema)
```

A user can call both personal and business onboarding — they coexist. There are no separate category/sub-category selection steps; the type is included in the onboarding request body (`individual_category` for personal, `business_type` for business).

## Permissions Model

Permissions are defined per business schema:

- `permissions` table: defines available permissions with `module` + `action` (e.g. `crm:write`)
- `role_permissions` junction: links `role_id` to `permission_id`
- `requirePermission("module:action")` guard resolves: agent → role → role_permissions → permissions

Default roles and permissions are seeded on business schema provisioning.

## Soft Delete

All tables use `deleted_at` for soft delete. Audit log tables are append-only (never deleted).
OTP challenges are hard-deleted after verification or expiry.

## Key Decisions

- **Single login endpoint** for all user types — admin detection happens post-OTP via `superadmin.admin_users` lookup.
- OTP email is fire-and-forget. Registration/send-otp never fails due to email service being down.
- Subdomain uniqueness enforced by DB constraint (not check-then-insert).
- If business DB provisioning fails, the business row is deleted.
- `agents` table in per-business DB holds NO auth fields — just `platform_user_id` + role.
- Business membership tracked in BOTH `user_business_index` (master DB, display/listing) and `agents` (per-business DB, authoritative for role_id + permissions).
- New users created via invitation get `account_status=0` — must verify OTP to activate.
- `username` column removed — email is the sole identifier.
- `is_personal_account` / `is_business_account` are explicit flags (not derived) — set during onboarding or invitation acceptance.
- `account_categories` is an append-only JSONB array tracking the history of all roles a user has held.

## Public Paths (no JWT required)

Defined in `core/plugins/auth.plugin.ts`:
- `/api/v3/auth/send-otp`, `/verify-otp`, `/refresh`, `/register`
- `/api/v3/admin/users/invite/accept`
- `/api/v3/agents/invite/accept`
- `/api/v3/businesses/claim/accept`, `/api/v3/businesses/claim/request`
- `/healthz`, `/health/*`
