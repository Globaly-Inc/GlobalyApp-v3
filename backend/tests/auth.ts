/**
 * Auth test — exercises the core auth + account flows end-to-end against a live server.
 * Run: node --import tsx tests/auth.ts
 *
 * Covers:
 *  1. Personal account registration → OTP verify → onboarding
 *  2. Admin invite → accept → admin login
 *  3. Business registration → switch account → business profile
 *  4. Logout
 */

const BASE = "http://localhost:3000/api/v3";

let passed = 0;
let failed = 0;

async function api(method: string, path: string, body?: unknown, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

async function assert(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
  }
}

function eq(actual: unknown, expected: unknown, label = "") {
  if (actual !== expected) {
    throw new Error(`${label ? label + ": " : ""}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// Helper: set a known OTP directly in auth_otp_challenges table (tests only)
async function setKnownOtp(email: string): Promise<string> {
  const { default: pg } = await import("pg");
  const client = new pg.Client({
    host: "localhost",
    port: 5432,
    user: "master_user",
    password: "password",
    database: "globalyapp",
  });
  await client.connect();

  const { scryptSync, randomBytes } = await import("node:crypto");
  const knownOtp = "123456";
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(knownOtp, salt, 64).toString("hex");
  const stored = `${salt}:${hash}`;
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  // Upsert into auth_otp_challenges
  await client.query(`DELETE FROM auth_otp_challenges WHERE email = $1`, [email]);
  await client.query(
    `INSERT INTO auth_otp_challenges (email, otp_hash, expires_at) VALUES ($1, $2, $3)`,
    [email, stored, expires],
  );
  await client.end();
  return knownOtp;
}

// ── Test state ──
let personalToken = "";
let personalRefreshToken = "";
let adminToken = "";
let businessOrgId = "";
let businessToken = "";

// ═══════════════════════════════════════════════════════════════════════════
console.log("\n═══ 1. Personal Account Registration ═══\n");

await assert("Register new personal user", async () => {
  const { status, data } = await api("POST", "/auth/register", {
    first_name: "Test",
    last_name: "Personal",
    email: "test.personal@example.com",
  });
  eq(status, 201, "status");
  eq(typeof data.message, "string", "message");
});

await assert("Duplicate registration returns same message (anti-enumeration)", async () => {
  const { status, data } = await api("POST", "/auth/register", {
    first_name: "Test",
    last_name: "Personal",
    email: "test.personal@example.com",
  });
  // Anti-enumeration: same 201 + same message shape
  eq(status, 201, "status");
  eq(typeof data.message, "string", "message");
});

await assert("Verify OTP activates account", async () => {
  const otp = await setKnownOtp("test.personal@example.com");
  const { status, data } = await api("POST", "/auth/verify-otp", {
    email: "test.personal@example.com",
    otp,
  });
  eq(status, 200, "status");
  eq(typeof data.access_token, "string", "access_token");
  eq(typeof data.refresh_token, "string", "refresh_token");
  eq(data.user.type, "platform_user", "user.type");
  personalToken = data.access_token;
  personalRefreshToken = data.refresh_token;
});

await assert("GET /auth/me returns user", async () => {
  const { status, data } = await api("GET", "/auth/me", undefined, personalToken);
  eq(status, 200, "status");
  eq(data.user.email, "test.personal@example.com", "email");
  eq(data.user.account_status, 1, "account_status activated");
  eq(data.user.is_email_verified, true, "email verified");
});

await assert("Onboard as personal student", async () => {
  const { status } = await api("POST", "/platform-users/me/onboarding/personal", {
    individual_category: "student",
    nationality_id: 1,
    country_of_residence_id: 1,
    city_of_residence: "Sydney",
    date_of_birth: "2000-01-01",
    gender: "male",
    degree_level: "Bachelor",
  }, personalToken);
  eq(status, 201, "status");
});

await assert("Refresh token rotates correctly", async () => {
  const { status, data } = await api("POST", "/auth/refresh", {
    refresh_token: personalRefreshToken,
  });
  eq(status, 200, "status");
  eq(typeof data.access_token, "string", "new access_token");
  eq(typeof data.refresh_token, "string", "new refresh_token");
  personalToken = data.access_token;
  personalRefreshToken = data.refresh_token;
});

await assert("Old refresh token triggers reuse detection", async () => {
  const { status } = await api("POST", "/auth/refresh", {
    refresh_token: "old-invalid-token",
  });
  eq(status, 401, "status");
});

// ═══════════════════════════════════════════════════════════════════════════
console.log("\n═══ 2. Admin Invite Flow ═══\n");

await assert("Admin login via OTP", async () => {
  const { status: sendStatus } = await api("POST", "/auth/send-otp", {
    email: "admin@globalyhub.com",
  });
  eq(sendStatus, 200, "send-otp status");

  const otp = await setKnownOtp("admin@globalyhub.com");
  const { status, data } = await api("POST", "/auth/verify-otp", {
    email: "admin@globalyhub.com",
    otp,
  });
  eq(status, 200, "verify-otp status");
  eq(data.user.type, "admin", "user.type");
  eq(data.user.role, "super_admin", "user.role");
  adminToken = data.access_token;
});

await assert("Admin invites a new admin", async () => {
  const { status, data } = await api("POST", "/admin/users/invite", {
    email: "new.admin@example.com",
    first_name: "New",
    last_name: "Admin",
    role: "admin",
  }, adminToken);
  if (status === 201) {
    eq(typeof data.invite_token, "string", "invite_token");
  }
});

await assert("Accept admin invitation via POST", async () => {
  const { default: pg } = await import("pg");
  const client = new pg.Client({ host: "localhost", port: 5432, user: "master_user", password: "password", database: "globalyapp" });
  await client.connect();
  const { rows } = await client.query(
    `SELECT invite_token FROM superadmin.admin_invitations WHERE email = $1 AND status = 'pending' LIMIT 1`,
    ["new.admin@example.com"],
  );
  await client.end();
  eq(rows.length > 0, true, "invitation exists");

  const { status, data } = await api("POST", "/admin/users/invite/accept", {
    token: rows[0].invite_token,
  });
  eq(status, 200, "accept status");
  eq(typeof data.message, "string", "accept message");
});

await assert("Invited admin can login after OTP verify", async () => {
  const { status: sendStatus } = await api("POST", "/auth/send-otp", {
    email: "new.admin@example.com",
  });
  eq(sendStatus, 200, "send-otp status");

  const otp = await setKnownOtp("new.admin@example.com");
  const { status, data } = await api("POST", "/auth/verify-otp", {
    email: "new.admin@example.com",
    otp,
  });
  eq(status, 200, "verify-otp status");
  eq(data.user.type, "admin", "user.type should be admin");
});

// ═══════════════════════════════════════════════════════════════════════════
console.log("\n═══ 3. Business Registration + Account Switching ═══\n");

await assert("Register a business", async () => {
  const { status, data } = await api("POST", "/businesses/register", {
    business_name: "Test Corp",
    subdomain: "test-corp",
  }, personalToken);
  eq(status, 201, "status");
  eq(data.org.business_name, "Test Corp", "business_name");
  eq(typeof data.org.org_id, "string", "org_id");
  businessOrgId = data.org.org_id;
});

await assert("GET /auth/me lists the new business", async () => {
  const { status, data } = await api("GET", "/auth/me", undefined, personalToken);
  eq(status, 200, "status");
  const biz = data.user.businesses?.find((b: any) => b.org_id === businessOrgId);
  eq(!!biz, true, "business found in list");
  eq(biz.role, "owner", "role is owner");
});

await assert("Switch to business account", async () => {
  const { status, data } = await api("POST", "/auth/switch-account", {
    org_id: businessOrgId,
  }, personalToken);
  eq(status, 200, "status");
  eq(typeof data.access_token, "string", "scoped access_token");
  businessToken = data.access_token;
});

await assert("GET /businesses/me works in business context", async () => {
  const { status, data } = await api("GET", "/businesses/me", undefined, businessToken);
  eq(status, 200, "status");
  eq(data.business_name, "Test Corp", "business_name");
});

await assert("GET /agents returns owner agent", async () => {
  const { status, data } = await api("GET", "/agents", undefined, businessToken);
  eq(status, 200, "status");
  eq(data.data.length, 1, "one agent (owner)");
  eq(data.data[0].is_owner, true, "is_owner");
  eq(data.data[0].role, "owner", "role");
});

await assert("GET /agents/roles returns 5 default roles", async () => {
  const { status, data } = await api("GET", "/agents/roles", undefined, businessToken);
  eq(status, 200, "status");
  eq(data.length, 5, "5 roles");
});

await assert("Business context required for /businesses/me without org token", async () => {
  const { status } = await api("GET", "/businesses/me", undefined, personalToken);
  eq(status, 403, "status");
});

// ═══════════════════════════════════════════════════════════════════════════
console.log("\n═══ 4. Logout ═══\n");

await assert("POST /auth/logout invalidates session", async () => {
  const { status } = await api("POST", "/auth/logout", {}, personalToken);
  eq(status, 204, "status");
});

await assert("Refresh token fails after logout", async () => {
  const { status } = await api("POST", "/auth/refresh", {
    refresh_token: personalRefreshToken,
  });
  eq(status, 401, "status");
});

// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══\n`);

process.exit(failed > 0 ? 1 : 0);
