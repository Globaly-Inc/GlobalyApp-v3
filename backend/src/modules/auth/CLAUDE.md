# Auth Module

Unified OTP-based authentication for all user types. No passwords — email OTP only.

## User Types

| Type | Table | DB | Resolves when |
|------|-------|----|---------------|
| `admin` | `superadmin.admin_users` | globalyapp (superadmin schema) | Email found in admin_users |
| `platform_user` | `platform_users` | globalyapp | Email found in platform_users |
| `agent` | `agents` | per-business tenant DB | Email found + `subdomain` provided |

## Auth Flow

```
POST /register → creates platform_user + generates OTP (email fire-and-forget)
POST /send-otp → resolves user type, generates 6-digit OTP (10 min expiry)
POST /verify-otp → validates OTP, returns { access_token, refresh_token }
POST /refresh → rotates both tokens (hashed refresh stored in DB)
GET /me → returns user profile based on JWT type
```

## User Resolution (`resolveUser`)

When same email exists in multiple tables (e.g., admin + platform_user), the user with an **active OTP** is preferred. This lets verify-otp resolve to the right account after send-otp.

## JWT Payload

```ts
{ sub: userId, type: "admin"|"platform_user"|"agent", email, role?, orgId? }
```

- `orgId` is only present for agents (business UUID)
- `role` is present for admins and agents

## Platform User Onboarding (3-step)

```
Step 1: PATCH /platform-users/me/category      → "personal" | "business"
Step 2: PATCH /platform-users/me/sub-category   → depends on category
Step 3: PATCH /platform-users/me/onboarding-profile → dispatches by category + sub-category
```

### Sub-categories

| Category | Sub-categories |
|----------|---------------|
| personal | `student`, `education_provider`, `parents`, `explorer` |
| business | `education_agent`, `institution`, `service_provider`, `immigration_department` |

### Step 3 Routing

| Category | Sub-category | Stores in | Tenant DB? |
|----------|-------------|-----------|------------|
| personal | any | `platform_user_profiles` | No |
| business | `institution` | `institutions` table | No |
| business | all others | `businesses` table + tenant DB provisioned + owner agent created | Yes |

## Multi-Tenant Architecture

- Business owner exists in BOTH `platform_users` (global identity) and `agents` (business role). This is intentional — not duplication.
- `platform_users` = who you are on the platform
- `agents` = what role you play in a specific business
- Tenant DB contains: `agents`, `roles`, and business-specific tables
- Pool manager maintains one Knex instance per active business (LRU, max 50, 5 min TTL)

## Rate Limits (see `consts.ts`)

- `/register`: 5 req / 15 min
- `/send-otp`: 5 req / 1 min
- `/verify-otp`: 10 req / 5 min

## Key Decisions

- OTP email sending is fire-and-forget (`.catch()` logs warning). Registration/send-otp never fails due to email service being down.
- Refresh tokens are SHA-256 hashed before storage. Raw token returned to client.
- Business subdomain uniqueness is enforced by DB constraint (not check-then-insert) to prevent race conditions.
- If business DB provisioning fails, the business row is deleted (not left orphaned).
- `institutions` table is separate from `businesses` — same structure minus tenant DB columns. No `db_name`, no `db_username`, no provisioning.

## Public Paths (no JWT required)

Defined in `core/plugins/auth.plugin.ts`:
- `/api/v3/auth/send-otp`, `/verify-otp`, `/refresh`, `/register`
- `/api/v3/admin/users/invite/accept`
- `/api/v3/agents/invite/accept`
- `/healthz`
