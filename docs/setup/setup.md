# GlobalyApp V3 — Local Setup

## Prerequisites

- **Node.js** v24+ (via [nvm](https://github.com/nvm-sh/nvm))
- **PostgreSQL** 15+
- **LavinMQ** — message queue for async jobs
- **Mailtrap** account (free) — for dev email testing
- **Yarn** — frontend package manager

---

## 1. Node.js (nvm)

```bash
nvm install 24
nvm alias default 24
node --version   # → v24.x.x
```

If a new terminal still shows an old version:

```bash
source ~/.nvm/nvm.sh && nvm use 24
```

---

## 2. Clone the repo

```bash
git clone git@github.com:Globaly-Inc/GlobalyApp-v3.git
cd GlobalyApp-v3
```

---

## 3. Git branch setup

The default branch is `staging`. Always start from a fresh `staging` before creating your branch.

### 3.1 Fetch & pull staging

```bash
git fetch origin
git checkout staging
git pull origin staging
```

### 3.2 Create your branch

Use the prefix that matches your team and the type of work:

#### Product team

| Type | Prefix | Example |
|------|--------|---------|
| New feature | `product-feat-` | `product-feat-onboarding-flow` |
| Hotfix | `product-hotfix-` | `product-hotfix-login-redirect-bug` |

```bash
# Feature
git checkout -b product-feat-<your-branch-name>

# Hotfix
git checkout -b product-hotfix-<your-branch-name>
```

Replace `<your-branch-name>` with a short, descriptive name in kebab-case (e.g. `add-student-filters`, `fix-otp-expiry`).

---

## 4. Backend setup

### 4.1 Install dependencies

```bash
cd backend
npm install
```

### 4.2 PostgreSQL

Connect as the superuser and create the database user + database:

```bash
sudo -u postgres psql
```

```sql
CREATE USER master_user WITH PASSWORD 'password' CREATEDB;
CREATE DATABASE globalyapp OWNER master_user;
\c globalyapp
CREATE SCHEMA superadmin AUTHORIZATION master_user;
GRANT ALL PRIVILEGES ON DATABASE globalyapp TO master_user;
GRANT ALL PRIVILEGES ON SCHEMA superadmin TO master_user;
GRANT ALL PRIVILEGES ON SCHEMA public TO master_user;
\q
```

Verify:

```bash
psql -U master_user -d globalyapp -h localhost
# Should connect without errors
```

### 4.3 LavinMQ

```bash
sudo apt-get install -y lavinmq
sudo systemctl start lavinmq
```

### 4.4 Environment

```bash
cp .env.example .env
```

Edit `.env`:

| Variable | What it is | Default |
|----------|-----------|---------|
| `DB_USERNAME` | Postgres user | `master_user` |
| `DB_PASSWORD` | Password | `password` |
| `DB_NAME` | Database name | `globalyapp` |
| `DB_HOST` | Database host | `localhost` |
| `DB_PORT` | Database port | `5432` |
| `JWT_SECRET` | Random string for signing tokens | — |
| `SMTP_HOST` | Mailtrap SMTP host | `sandbox.smtp.mailtrap.io` |
| `MAIL_PORT` | Mailtrap SMTP port | `2525` |
| `MAIL_USERNAME` | Mailtrap username | — |
| `MAIL_PASSWORD` | Mailtrap password | — |
| `LAVINMQ_HOST` | Queue host | `localhost` |
| `LAVINMQ_PORT` | Queue port | `5672` |
| `LAVINMQ_USERNAME` | Queue user | `guest` |
| `LAVINMQ_PASSWORD` | Queue password | `guest` |
| `PORT` | Server port | `3000` |
| `CORS_ORIGINS` | Allowed origins | `http://localhost:3001` |

### 4.5 Migrations & seed

```bash
npm run migrate:superadmin
npm run migrate:globalyapp
npm run seed:superadmin       # creates default super_admin user
npm run seed:globalyapp       # populates countries table
```

### 4.6 Start the backend

Terminal 1 — server:

```bash
npm run dev
```

Terminal 2 — email queue worker:

```bash
npm run job:auth
```

Server runs at `http://localhost:3000`.

### 4.7 Verify

```bash
curl http://localhost:3000/healthz
# → {"status":"ok"}
```

---

## 5. Frontend setup

```bash
cd frontend
npm install -g yarn    # if yarn isn't installed
yarn install
```

### 5.1 Environment

```bash
cp .env.example .env
```

| Variable | What it is | Default |
|----------|-----------|---------|
| `NEXT_PUBLIC_MOCK_DATA` | Use mock APIs (no backend needed) | `true` |
| `NEXT_PUBLIC_API_URL` | Backend URL | `http://localhost:3000/` |

Set `NEXT_PUBLIC_MOCK_DATA=false` when running against the real backend.

### 5.2 Start the frontend

```bash
yarn dev
```

App runs at `http://localhost:3001`.

---

## 6. Auth flow (OTP-based)

There are no passwords — login is email OTP for all user types (admin, student, agent).

```bash
# Request OTP
curl -X POST http://localhost:3000/api/v3/auth/send-otp \
  -H "Content-Type: application/json" \
  -d '{"email": "priansu.koirala@globalyhub.com"}'

# Check Mailtrap inbox for the 6-digit OTP, then verify
curl -X POST http://localhost:3000/api/v3/auth/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"email": "priansu.koirala@globalyhub.com", "otp": "123456"}'

# Returns: { access_token, refresh_token, type: "admin" }
```

Use `access_token` as `Authorization: Bearer <token>` for protected endpoints.

---

## 7. Background workers (optional)

Run in separate terminals if needed:

| Script | Purpose |
|--------|---------|
| `npm run job:auth` | Email queue + invitation acceptance |
| `npm run job:extraction` | Data extraction job worker |
| `npm run job:extraction-pages` | Page-level extraction worker |
| `npm run job:extraction-verify` | Verification worker |

Requires LavinMQ running at `localhost:5672`.

---

## 8. Useful scripts

### Backend (`cd backend`)

| Script | Purpose |
|--------|---------|
| `npm run dev` | Dev server with hot reload |
| `npm run start` | Production server |
| `npm run build` | TypeScript compile |
| `npm run migrate:superadmin` | Superadmin schema migrations |
| `npm run migrate:globalyapp` | Main app migrations |
| `npm run migrate:tenants` | Business migrations on all tenant DBs |
| `npm run seed:superadmin` | Seed default admin user |
| `npm run seed:globalyapp` | Seed countries data |
| `npm run lint` | ESLint |

### Frontend (`cd frontend`)

| Script | Purpose |
|--------|---------|
| `yarn dev` | Dev server |
| `yarn build` | Production build |
| `yarn lint` | ESLint |

---

## 9. Kill a stuck port

```bash
fuser -k 3000/tcp   # backend
fuser -k 3001/tcp   # frontend
```
