# GlobalyApp V3 — Backend Setup

## Prerequisites

- **Node.js** v24+ (via nvm)
- **PostgreSQL** 15+
- **LavinMQ** — message queue for async jobs
- **Mailtrap** account (free) — for dev email testing

## 1. Node.js setup (nvm)

Install nvm if you don't have it: https://github.com/nvm-sh/nvm

```bash
# Install Node v24
nvm install 24

# Set it as the default for all new terminals
nvm alias default 24

# Verify
node --version
# → v24.x.x
```

If you switch terminals and `node --version` still shows an old version:

```bash
source ~/.nvm/nvm.sh && nvm use 24
```

## 2. Clone & install

```bash
git clone git@github.com:Globaly-Inc/GlobalyApp-v3.git
cd GlobalyApp-v3/backend
npm install
```

## 3. PostgreSQL setup

### Create the database user

Connect to PostgreSQL as the superuser (`postgres`):

```bash
sudo -u postgres psql
```

Create a dedicated user with `CREATEDB` privilege (needed for multi-tenant business databases):

```sql
CREATE USER master_user WITH PASSWORD 'password' CREATEDB;
```

> **Note:** In production, use a strong password and restrict privileges accordingly.

### Create the database and schema

```sql
CREATE DATABASE globalyapp OWNER master_user;
\c globalyapp
CREATE SCHEMA superadmin AUTHORIZATION master_user;
```

Grant the necessary permissions:

```sql
GRANT ALL PRIVILEGES ON DATABASE globalyapp TO master_user;
GRANT ALL PRIVILEGES ON SCHEMA superadmin TO master_user;
GRANT ALL PRIVILEGES ON SCHEMA public TO master_user;
```

Exit psql:

```sql
\q
```

### Verify connection

```bash
psql -U master_user -d globalyapp -h localhost
# Should connect without errors
```

## 4. Environment

```bash
cp .env.example .env
```

Edit `.env` — the required values are:

| Variable | What it is | Default |
|----------|-----------|---------|
| `DB_USERNAME` | Postgres user created above | `master_user` |
| `DB_PASSWORD` | Password for the user | `password` |
| `DB_NAME` | Main database name | `globalyapp` |
| `DB_HOST` | Database host | `localhost` |
| `DB_PORT` | Database port | `5432` |
| `JWT_SECRET` | Any random string for signing tokens | — |
| `SMTP_HOST` | Mailtrap SMTP host | — |
| `MAIL_PORT` | Mailtrap SMTP port | `2525` |
| `MAIL_USERNAME` | Mailtrap username | — |
| `MAIL_PASSWORD` | Mailtrap password | — |

Everything else has sensible defaults or is optional for local dev.

## 5. Run migrations & seeders

Run in this order:

```bash
# 1. Superadmin tables (admin_users, audit logs, extraction tables)
npm run migrate:superadmin

# 2. Main app tables (businesses, platform_users, categories, countries, etc.)
npm run migrate:globalyapp

# 3. Seed initial data
npm run seed:superadmin    # creates the default super_admin user
npm run seed:globalyapp    # populates countries table
```

## 6. Start the server

```bash
# Development (hot reload)
npm run dev

# Production
npm run start
```

Server runs at `http://localhost:3000`.

### Kill a running server

If port 3000 is already in use:

```bash
# Find and kill the process on port 3000
fuser -k 3000/tcp

# Then start the server again
npm run dev
```

## 7. Verify it works

```bash
curl http://localhost:3000/healthz
# → {"status":"ok"}

curl http://localhost:3000/health/detailed
# → shows database, queue, mail status
```

## 8. Auth flow (OTP-based)

There's no password login — it's email OTP:

```bash
# Request OTP
curl -X POST http://localhost:3000/api/v3/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"email": "your-seeded-admin@email.com"}'

# Check Mailtrap inbox for the OTP, then verify
curl -X POST http://localhost:3000/api/v3/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"email": "your-seeded-admin@email.com", "otp": "123456"}'

# Returns: { access_token, refresh_token, user }
```

Use the `access_token` as `Authorization: Bearer <token>` for all protected endpoints.

## 9. Background workers (optional)

These are separate processes for async jobs. Run in separate terminals if needed:

```bash
npm run job:auth              # processes email queue (OTP delivery)
npm run job:extraction        # data extraction job worker
npm run job:extraction-pages  # page-level extraction worker
npm run job:extraction-verify # verification worker
```

Requires LavinMQ running at `localhost:5672`.

## 10. Available scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start dev server with hot reload |
| `npm run start` | Start production server |
| `npm run build` | TypeScript compile |
| `npm run migrate:superadmin` | Run superadmin schema migrations |
| `npm run migrate:globalyapp` | Run main app migrations |
| `npm run seed:superadmin` | Seed default admin user |
| `npm run seed:globalyapp` | Seed countries data |
| `npm run lint` | Run ESLint |

## 11. Project structure

```
backend/
├── src/
│   ├── server.ts              # Entry point
│   ├── config.ts              # Env validation (all env access goes here)
│   ├── core/                  # DB pools, auth plugin, shared infra
│   ├── shared/                # Errors, pagination, logger, queue
│   └── modules/
│       ├── auth/              # OTP login, token refresh, registration
│       └── superadmin/
│           ├── admin-users/   # Admin staff CRUD + invitations
│           ├── platform/      # Businesses, users, categories, countries, flags
│           ├── analytics/     # Dashboard metrics
│           └── data-extraction/ # Scraping + LLM pipeline
├── database/
│   ├── migrations/
│   │   ├── globalyapp/        # Main app schema
│   │   └── superadmin/        # Admin schema
│   └── seeders/
│       ├── globalyapp/        # Countries
│       └── superadmin/        # Default admin user
└── knexfile.ts                # Knex config (globalyapp + superadmin envs)
```

## Key conventions

- **Multi-tenant**: Each business gets its own database, created dynamically
- **Auth**: Custom JWT + OTP (no Supabase auth)
- **Validation**: Zod schemas in route files
- **Errors**: Throw `NotFoundError`, `BadRequestError`, `ForbiddenError` from `src/shared/errors.ts`
- **Admin roles**: `super_admin`, `admin`, `data_admin`, `moderator`
