# GlobalyHub Backend

Multi-tenant backend built with **Node.js**, **Fastify**, **Knex**, and **PostgreSQL**.

---

## Architecture overview

There is **one PostgreSQL database** (`globalyapp`) with **two schemas**:

| Schema | Tables | Purpose |
|--------|--------|---------|
| `public` | `businesses`, `students`, `student_profiles`, `student_qualifications`, `student_language_tests`, `student_work_experiences` | All platform data — businesses (tenants), students, and their sub-resources |
| `superadmin` | `admin_users`, `admin_invitations` | Internal admin panel — super admins, admins, data admins, moderators |

Each business (tenant) also gets **its own separate database** for agent data (`agents`, `agent_invitations`). This is the database-per-tenant pattern — one business can never see another business's agent data.

### Three user types

| Type | Where they live | Who they are |
|------|----------------|--------------|
| **Admin** | `superadmin.admin_users` | Internal team — manages the platform (Super Admin, Admin, Data Admin, Moderator) |
| **Student** | `public.students` | End users — students looking for opportunities |
| **Agent** | `agents` table in each business's own DB | Business employees — manage their company's presence on the platform |

---

## How login works (unified auth)

All three user types share **one login flow**. The frontend has a single login screen — the backend figures out who the user is.

```
POST /api/v3/auth/send-otp  { "email": "user@example.com" }
                                     |
                                     v
                    ┌─ Check superadmin.admin_users
                    ├─ Check public.students
                    └─ Check agents (if subdomain provided)
                                     |
                                     v
                    OTP generated → queued to LavinMQ → email worker sends it
                                     |
                                     v
POST /api/v3/auth/verify-otp  { "email": "...", "otp": "123456" }
                                     |
                                     v
                    Returns { access_token, refresh_token, type: "admin"|"student"|"agent" }
```

The `type` field in the response tells the frontend which dashboard to show.

For **agent login**, the frontend sends the business subdomain (from the URL, e.g. `acme.globalyhub.com`):

```json
{ "email": "agent@acme.com", "subdomain": "acme" }
```

---

## How invitations work

### Admin invitations (super_admin invites another admin)

```
1. Super Admin calls POST /api/v3/admin/users/invite
   { "name": "Jane", "email": "jane@example.com", "role": "data_admin" }
        |
        v
2. Invitation record saved to superadmin.admin_invitations
   Invitation email queued to LavinMQ → email worker sends it
        |
        v
3. Jane clicks the accept link in the email
   GET /api/v3/admin/users/invite/accept?token=<token>
        |
        v
4. Acceptance job queued to LavinMQ → auth worker creates the admin user
   Jane can now log in via the same /api/v3/auth/send-otp flow
```

### Agent invitations (business owner invites an agent)

```
1. Business owner calls POST /api/v3/agents/invite
   { "first_name": "Bob", "last_name": "Smith", "email": "bob@example.com" }
        |
        v
2. Invitation record saved to agent_invitations in the business's own DB
   Invitation email queued to LavinMQ → email worker sends it
        |
        v
3. Bob clicks the accept link in the email
   GET /api/v3/agents/invite/accept?token=<token>&subdomain=acme
        |
        v
4. Agent user created in the business's DB
   Bob can now log in via /api/v3/auth/send-otp with subdomain
```

### All emails go through one queue

Nothing sends email directly. Every email (OTP, invitation) is published to the `emails` queue in LavinMQ, and the auth worker (`npm run job:auth`) picks it up and sends it via SMTP.

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Set up PostgreSQL

```bash
sudo -u postgres psql
```

```sql
CREATE USER master_user WITH PASSWORD 'password' CREATEDB;
CREATE DATABASE globalyapp OWNER master_user;
\c globalyapp
CREATE EXTENSION IF NOT EXISTS vector;
\q
```

### 3. Install and start LavinMQ

```bash
sudo apt-get install -y lavinmq
sudo systemctl start lavinmq
```

### 4. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Database
DB_USERNAME=master_user
DB_PASSWORD=password
DB_NAME=globalyapp
DB_HOST=localhost
DB_PORT=5432

# Auth
JWT_SECRET=your-secret-key
JWT_EXPIRY=15m

# Server
PORT=3000
CORS_ORIGINS=http://localhost:3001

# Queue
LAVINMQ_HOST=localhost
LAVINMQ_PORT=5672
LAVINMQ_USERNAME=guest
LAVINMQ_PASSWORD=guest

# Mail (Mailtrap for dev, any SMTP for prod)
SMTP_HOST=sandbox.smtp.mailtrap.io
MAIL_PORT=2525
MAIL_USERNAME=your_username
MAIL_PASSWORD=your_password
```

### 5. Run migrations and seed

```bash
# Create tables in public schema (businesses, students, etc.)
npm run migrate:globalyapp

# Create superadmin schema + tables (admin_users, admin_invitations)
npm run migrate:superadmin

# Seed the first super admin user
npm run seed:superadmin
```

### 6. Start the server and worker

Terminal 1 — server:
```bash
npm run dev
```

Terminal 2 — queue worker (emails + invitation acceptance):
```bash
npm run job:auth
```

---

## Testing the full flow

### Step 1: Super Admin login

The seed created `priansu.koirala@globalyhub.com` as `super_admin`.

**Request OTP:**
```bash
curl -X POST http://localhost:3000/api/v3/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"email": "priansu.koirala@globalyhub.com"}'
```

Response:
```json
{"message": "OTP sent"}
```

Check your email (or Mailtrap inbox) for the 6-digit OTP.

**Verify OTP:**
```bash
curl -X POST http://localhost:3000/api/v3/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"email": "priansu.koirala@globalyhub.com", "otp": "123456"}'
```

Response:
```json
{
  "access_token": "eyJhbG...",
  "refresh_token": "a1b2c3...",
  "type": "admin"
}
```

Save the `access_token` for the next steps.

### Step 2: Invite a Data Admin

```bash
curl -X POST http://localhost:3000/api/v3/admin/users/invite \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <access_token>" \
  -d '{
    "name": "Jane Doe",
    "email": "jane@example.com",
    "role": "data_admin"
  }'
```

Response:
```json
{
  "id": "uuid...",
  "email": "jane@example.com",
  "name": "Jane Doe",
  "role": "data_admin",
  "status": "pending",
  ...
}
```

The auth worker sends Jane an invitation email. She clicks the accept link, the worker creates her account, and she can log in.

**Accept the invitation (simulating the email link):**
```bash
curl "http://localhost:3000/api/v3/admin/users/invite/accept?token=<invite_token>"
```

Response:
```json
{"message": "Invitation accepted. Your account is being set up."}
```

**Jane can now log in:**
```bash
curl -X POST http://localhost:3000/api/v3/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"email": "jane@example.com"}'
```

### Step 3: Get current admin profile

```bash
curl http://localhost:3000/api/v3/admin/me \
  -H "Authorization: Bearer <access_token>"
```

### Step 4: List all admin users

```bash
curl http://localhost:3000/api/v3/admin/users \
  -H "Authorization: Bearer <access_token>"
```

### Step 5: Refresh token

```bash
curl -X POST http://localhost:3000/api/v3/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": "<refresh_token>"}'
```

### Step 6: Register a student

```bash
curl -X POST http://localhost:3000/api/v3/students/register \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Alice",
    "last_name": "Wong",
    "email": "alice@example.com"
  }'
```

Alice can now log in using the same `/api/v3/auth/send-otp` endpoint.

### Step 7: Register a business

```bash
curl -X POST http://localhost:3000/api/v3/businesses/register \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "John",
    "last_name": "Doe",
    "email": "john@acme.com",
    "subdomain": "acme",
    "business_name": "Acme Corp"
  }'
```

This creates a new database for Acme Corp and the owner agent. The owner can log in with:

```bash
curl -X POST http://localhost:3000/api/v3/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"email": "john@acme.com", "subdomain": "acme"}'
```

---

## API reference

### Unified Auth (`/api/v3/auth`) — public

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| POST | `/send-otp` | `{ email, subdomain? }` | Send OTP to any user type |
| POST | `/verify-otp` | `{ email, otp, subdomain? }` | Verify OTP, returns JWT + type |
| POST | `/refresh` | `{ refresh_token, subdomain? }` | Refresh access token |

### Super Admin (`/api/v3/admin`) — JWT required (type: admin)

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| GET | `/me` | — | Get current admin profile |
| GET | `/users` | — | List all admins (paginated) |
| GET | `/users/:id` | — | Get admin by ID |
| PATCH | `/users/:id` | `{ name?, role?, account_status?, photo_url? }` | Update admin |
| POST | `/users/invite` | `{ name, email, role }` | Invite new admin (super_admin only) |
| GET | `/users/invite/accept` | `?token=<token>` | Accept invitation (public) |

**Admin roles:** `super_admin`, `admin`, `data_admin`, `moderator`

### Students (`/api/v3/students`)

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| POST | `/register` | `{ first_name, last_name, email, phone?, nationality?, country_of_residence? }` | Register (public) |
| GET | `/me` | — | Get profile + qualifications + tests + work experience |
| PATCH | `/me` | `{ ... }` | Update profile |
| POST | `/me/qualifications` | `{ ... }` | Add qualification |
| PATCH | `/me/qualifications/:id` | `{ ... }` | Update qualification |
| DELETE | `/me/qualifications/:id` | — | Delete qualification |
| POST | `/me/language-tests` | `{ ... }` | Add language test |
| PATCH | `/me/language-tests/:id` | `{ ... }` | Update language test |
| DELETE | `/me/language-tests/:id` | — | Delete language test |
| POST | `/me/work-experiences` | `{ ... }` | Add work experience |
| PATCH | `/me/work-experiences/:id` | `{ ... }` | Update work experience |
| DELETE | `/me/work-experiences/:id` | — | Delete work experience |

### Businesses (`/api/v3/businesses`)

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| POST | `/register` | `{ first_name, last_name, email, subdomain, business_name }` | Register (public, creates business DB) |
| GET | `/me` | — | Get business profile |
| PATCH | `/me` | `{ ... }` | Update business profile |

### Agents (`/api/v3/agents`) — JWT required (type: agent)

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| GET | `/` | — | List agents in this business (paginated) |
| GET | `/:id` | — | Get agent by ID |
| POST | `/invite` | `{ first_name, last_name, email, phone? }` | Invite agent (owner only) |
| GET | `/invite/accept` | `?token=<token>&subdomain=<subdomain>` | Accept invitation (public) |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/healthz` | Returns `{ status: "ok" }` |

---

## NPM scripts

| Script | What it does |
|--------|-------------|
| `npm run dev` | Start server with hot-reload |
| `npm start` | Start server for production |
| `npm run build` | Compile TypeScript |
| `npm run migrate:globalyapp` | Run public schema migrations (businesses, students, etc.) |
| `npm run migrate:superadmin` | Run superadmin schema migrations (admin_users, admin_invitations) |
| `npm run migrate:tenants` | Run business migrations on all existing business databases |
| `npm run seed:superadmin` | Seed the first super admin user |
| `npm run job:auth` | Start the auth worker (sends emails + processes invitation acceptances) |

---

## Database layout

### `globalyapp` database — `public` schema

```
businesses           — registered businesses (tenants)
students             — registered students
student_profiles     — one-to-one with students
student_qualifications
student_language_tests
student_work_experiences
```

### `globalyapp` database — `superadmin` schema

```
admin_users          — platform admins (super_admin, admin, data_admin, moderator)
admin_invitations    — pending admin invitations
```

### Per-business databases (e.g. `acme_db_uuid`)

```
agents               — business employees
agent_invitations    — pending agent invitations
```

---

## Queue architecture

All async work goes through **LavinMQ** (AMQP). One worker process (`npm run job:auth`) consumes all queues:

| Queue | Published when | Worker action |
|-------|---------------|---------------|
| `emails` | OTP requested, invitation created | Sends the email via SMTP |
| `admin_invitation_accept` | Admin clicks accept link | Creates admin user in `superadmin.admin_users` |

---

## Project structure

```
.
├── .env.example
├── knexfile.ts                          # Knex configs (globalyapp + superadmin)
├── package.json
│
├── database/
│   ├── migrations/
│   │   ├── globalyapp/                  # public schema tables
│   │   ├── superadmin/                  # superadmin schema tables
│   │   └── business/                    # per-business DB tables (agents)
│   └── seeders/
│       └── superadmin/                  # seed first super admin
│
└── src/
    ├── server.ts                        # Entry point
    ├── config.ts                        # Zod-validated env config
    │
    ├── core/
    │   ├── plugins/
    │   │   ├── auth.plugin.ts           # JWT verification → req.auth
    │   │   ├── tenant.plugin.ts         # orgId → business DB → req.db
    │   │   ├── error-handler.plugin.ts
    │   │   └── request-context.plugin.ts
    │   ├── db/
    │   │   ├── master-pool.ts           # Knex instance for globalyapp
    │   │   ├── pool-manager.ts          # LRU cache of per-business Knex pools
    │   │   ├── knex.ts                  # Connection string builder
    │   │   └── transaction.ts
    │   ├── business/
    │   │   └── provisioner.ts           # CREATE DATABASE for new businesses
    │   └── types.ts                     # AuthClaims, BusinessRecord, Fastify augmentation
    │
    ├── modules/
    │   ├── auth/                        # Unified login for all user types
    │   │   ├── index.ts
    │   │   ├── auth.routes.ts           # /api/v3/auth/*
    │   │   ├── auth.service.ts          # OTP, verify, refresh, queueEmail, queueInvitationEmail
    │   │   └── jobs/
    │   │       └── email.worker.ts      # Consumes emails + admin_invitation_accept queues
    │   │
    │   ├── superadmin/
    │   │   ├── index.ts                 # Mounts admin-users + data-extraction
    │   │   ├── admin-users/
    │   │   │   ├── routes/              # /api/v3/admin/*
    │   │   │   ├── services/            # CRUD + invite (queues email via auth service)
    │   │   │   ├── repositories/        # Queries superadmin.admin_users
    │   │   │   └── schemas/
    │   │   └── data-extraction/
    │   │
    │   ├── students/
    │   │   ├── routes/                  # /api/v3/students/*
    │   │   ├── services/                # Register, profile, sub-resources
    │   │   ├── repositories/            # Queries public.students + sub-tables
    │   │   └── schemas/
    │   │
    │   ├── businesses/
    │   │   ├── routes/                  # /api/v3/businesses/*
    │   │   ├── services/                # Register, profile
    │   │   ├── repositories/
    │   │   └── schemas/
    │   │
    │   └── agents/
    │       ├── routes/                  # /api/v3/agents/*
    │       ├── services/                # CRUD + invite (queues email via auth service)
    │       ├── repositories/            # Queries per-business DB agents table
    │       └── schemas/
    │
    ├── shared/
    │   ├── errors.ts
    │   ├── logger.ts
    │   ├── pagination.ts
    │   ├── mail/                        # Nodemailer transport
    │   └── queue/                       # LavinMQ publish/consume
    │
    └── workers/
        ├── migration-runner.ts          # Apply business migrations to all business DBs
        └── outbox-drainer.ts
```
