// Read-only reconnaissance for the V2 -> V3 user migration.
//
// Answers, before a single row is written: how many users are there, which of
// them cannot be loaded into V3 as-is, and what has to be decided first.
// Writes nothing — both connections are pinned read-only at the session level.
//
//   node database/scripts/recon-v2-users.mjs               # report
//   node database/scripts/recon-v2-users.mjs --json        # machine-readable
//   node database/scripts/recon-v2-users.mjs --self-check  # pure-fn asserts, no DB
//
// V2_DATABASE_URL must point at the V2 Postgres (cloud-sql-proxy tunnel).
// V3 defaults to the local backend/.env database.

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(HERE, "../..");

// ── Pure helpers (covered by --self-check) ──────────────────────────────────

/** V3 platform_users.email is UNIQUE; collisions are case-insensitive in practice. */
export function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : null;
}

/**
 * V3 requires first_name AND last_name (both notNullable). V2 offers either
 * profiles.first_name/last_name or a single better-auth user.name.
 * Returns null when neither source can produce both halves — those rows are
 * the ones that need a decision before load.
 */
export function splitName({ firstName, lastName, name }) {
  const first = (firstName || "").trim();
  const last = (lastName || "").trim();
  if (first && last) return { first, last, source: "profile" };

  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return { first: parts[0], last: parts.slice(1).join(" "), source: "user.name" };
  }
  // One usable token at most — not enough for two notNullable columns.
  return null;
}

/** Country FK lookup key; V1/V2 store free text that is sometimes an ISO-2 code. */
export function normalizeCountry(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed === "" ? null : trimmed;
}

/**
 * Build a lookup accepting either a country name ("Australia") or an ISO-2/ISO-3
 * code ("AU"/"AUS") — V1 profiles mix all three. Returns country id or null.
 */
export function buildCountryResolver(countryRows) {
  const index = new Map();
  for (const row of countryRows) {
    for (const key of [row.name, row.iso2, row.iso3]) {
      const k = normalizeCountry(key);
      // First writer wins: names are seeded unique, so a code can never shadow one.
      if (k && !index.has(k)) index.set(k, row.id);
    }
  }
  return (value) => {
    const k = normalizeCountry(value);
    return k === null ? null : (index.get(k) ?? null);
  };
}

// ── DB plumbing ─────────────────────────────────────────────────────────────

/** A client that physically cannot write, whatever the query says. */
async function readOnlyClient(connectionString, label) {
  const client = new pg.Client({ connectionString });
  try {
    await client.connect();
  } catch (err) {
    throw new Error(`${label}: cannot connect — ${err.message}`);
  }
  await client.query("SET default_transaction_read_only = on");
  return client;
}

/**
 * Run a query, but treat "relation does not exist" as a finding rather than a
 * crash — a partial restore should still produce a report.
 */
async function tryQuery(client, sql, params = []) {
  try {
    const { rows } = await client.query(sql, params);
    return { ok: true, rows };
  } catch (err) {
    if (err.code === "42P01") return { ok: false, missing: true, error: err.message };
    return { ok: false, missing: false, error: err.message };
  }
}

async function count(client, table) {
  const r = await tryQuery(client, `SELECT count(*)::int AS n FROM ${table}`);
  return r.ok ? r.rows[0].n : r.missing ? "MISSING" : `ERROR: ${r.error}`;
}

function v3UrlFromEnv() {
  if (process.env.V3_DATABASE_URL) return process.env.V3_DATABASE_URL;
  dotenv.config({ path: path.join(BACKEND_ROOT, ".env"), quiet: true });
  const { DB_USERNAME, DB_PASSWORD, DB_NAME, DB_HOST = "localhost", DB_PORT = "5432" } = process.env;
  if (!DB_USERNAME || !DB_NAME) return null;
  const auth = `${encodeURIComponent(DB_USERNAME)}:${encodeURIComponent(DB_PASSWORD ?? "")}`;
  return `postgresql://${auth}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;
}

// ── Recon sections ──────────────────────────────────────────────────────────

/**
 * The user source differs by vintage: a live V2 has better-auth `public."user"`,
 * while a V1 restore only has Supabase `auth.users`. Resolve it once, then every
 * later query reads the same shape. Prefers better-auth when both are present,
 * since that is what V2 considers authoritative.
 */
async function resolveUserSource(client) {
  const present = async (schema, table) => {
    const r = await tryQuery(
      client,
      `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
      [schema, table],
    );
    return r.ok && r.rows.length > 0;
  };

  if (await present("public", "user")) {
    return {
      label: 'public."user" (better-auth)',
      from: 'public."user"',
      id: "id::text",
      email: "email",
      // better-auth carries a single display name.
      name: "name",
      verified: "email_verified",
      excludeDeleted: "",
    };
  }
  if (await present("auth", "users")) {
    return {
      label: "auth.users (Supabase / V1 restore)",
      from: "auth.users",
      id: "id::text",
      email: "email::text",
      // V1 keeps the display name in the GoTrue metadata blob.
      name: "coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name')",
      verified: "(email_confirmed_at IS NOT NULL)",
      // Soft-deleted GoTrue rows are not migration candidates.
      excludeDeleted: "WHERE deleted_at IS NULL",
    };
  }
  return null;
}

async function inventory(v2) {
  return {
    "auth.users (Supabase carryover)": await count(v2, "auth.users"),
    'public."user" (better-auth)': await count(v2, 'public."user"'),
    profiles: await count(v2, "public.profiles"),
    user_roles: await count(v2, "public.user_roles"),
    business_members: await count(v2, "public.business_members"),
    businesses: await count(v2, "public.businesses"),
  };
}

/** Normalized view of whichever user table exists, so later SQL is shape-agnostic. */
function srcSelect(src) {
  return `(SELECT ${src.id} AS id, ${src.email} AS email, ${src.name} AS name,
                  ${src.verified} AS verified
             FROM ${src.from} ${src.excludeDeleted})`;
}

/** auth.users and public."user" should be 1:1 (import-users.mjs preserved UUIDs). */
async function identityOverlap(v2) {
  const r = await tryQuery(
    v2,
    `SELECT
       (SELECT count(*) FROM auth.users au JOIN public."user" u ON u.id::text = au.id::text)::int AS matched_by_id,
       (SELECT count(*) FROM auth.users au WHERE NOT EXISTS
          (SELECT 1 FROM public."user" u WHERE u.id::text = au.id::text))::int AS only_in_auth_users,
       (SELECT count(*) FROM public."user" u WHERE NOT EXISTS
          (SELECT 1 FROM auth.users au WHERE au.id::text = u.id::text))::int AS only_in_better_auth`,
  );
  return r.ok ? r.rows[0] : { error: r.error };
}

/** Everything that would make an INSERT into V3 platform_users fail or lose data. */
async function blockers(v2, src) {
  const S = srcSelect(src);
  const dupes = await tryQuery(
    v2,
    `SELECT lower(trim(email)) AS email, count(*)::int AS n
       FROM ${S} u WHERE email IS NOT NULL AND trim(email) <> ''
      GROUP BY 1 HAVING count(*) > 1 ORDER BY n DESC, 1 LIMIT 25`,
  );
  const missingEmail = await tryQuery(
    v2,
    `SELECT count(*)::int AS n FROM ${S} u WHERE email IS NULL OR trim(email) = ''`,
  );
  const multiProfile = await tryQuery(
    v2,
    `SELECT count(*)::int AS n FROM (
       SELECT user_id FROM public.profiles GROUP BY user_id HAVING count(*) > 1
     ) t`,
  );
  const orphanProfiles = await tryQuery(
    v2,
    `SELECT count(*)::int AS n FROM public.profiles p
      WHERE NOT EXISTS (SELECT 1 FROM ${S} u WHERE u.id = p.user_id::text)`,
  );
  const noProfile = await tryQuery(
    v2,
    `SELECT count(*)::int AS n FROM ${S} u
      WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id::text = u.id)`,
  );
  return {
    duplicateEmails: dupes.ok ? dupes.rows : { error: dupes.error },
    usersWithoutEmail: missingEmail.ok ? missingEmail.rows[0].n : { error: missingEmail.error },
    usersWithMultipleProfiles: multiProfile.ok ? multiProfile.rows[0].n : { error: multiProfile.error },
    profilesWithoutUser: orphanProfiles.ok ? orphanProfiles.rows[0].n : { error: orphanProfiles.error },
    usersWithoutProfile: noProfile.ok ? noProfile.rows[0].n : { error: noProfile.error },
  };
}

/** How many rows can actually fill V3's two notNullable name columns. */
async function nameResolution(v2, src) {
  const r = await tryQuery(
    v2,
    `SELECT u.id, u.name, p.first_name AS "firstName", p.last_name AS "lastName"
       FROM ${srcSelect(src)} u
       LEFT JOIN public.profiles p ON p.user_id::text = u.id`,
  );
  if (!r.ok) return { error: r.error };

  const tally = { profile: 0, "user.name": 0, unresolved: 0 };
  const examples = [];
  for (const row of r.rows) {
    const split = splitName(row);
    if (!split) {
      tally.unresolved++;
      if (examples.length < 10) examples.push({ id: row.id, name: row.name ?? null });
    } else {
      tally[split.source]++;
    }
  }
  return { ...tally, unresolvedExamples: examples };
}

async function roleDistribution(v2) {
  const roles = await tryQuery(
    v2,
    `SELECT role::text AS role, count(*)::int AS n FROM public.user_roles GROUP BY 1 ORDER BY n DESC`,
  );
  const portals = await tryQuery(
    v2,
    `SELECT coalesce(portal_type,'(null)') AS portal_type, count(*)::int AS n
       FROM public.profiles GROUP BY 1 ORDER BY n DESC`,
  );
  const members = await tryQuery(
    v2,
    `SELECT role::text AS role, invite_status, count(*)::int AS n
       FROM public.business_members GROUP BY 1,2 ORDER BY n DESC`,
  );
  return {
    userRoles: roles.ok ? roles.rows : { error: roles.error },
    portalTypes: portals.ok ? portals.rows : { error: portals.error },
    businessMembers: members.ok ? members.rows : { error: members.error },
  };
}

/** V2 stores country as free text; V3 wants countries.id. What won't resolve? */
async function countryCoverage(v2, v3) {
  const v2Countries = await tryQuery(
    v2,
    `SELECT DISTINCT val FROM (
       SELECT nationality AS val FROM public.profiles
       UNION ALL SELECT country_of_residence FROM public.profiles
       UNION ALL SELECT personal_address_country FROM public.profiles
     ) t WHERE val IS NOT NULL AND trim(val) <> ''`,
  );
  if (!v2Countries.ok) return { error: v2Countries.error };

  const v3Countries = await tryQuery(v3, `SELECT id, name, iso2, iso3 FROM public.countries`);
  if (!v3Countries.ok) return { error: `V3 countries: ${v3Countries.error}` };

  const resolve = buildCountryResolver(v3Countries.rows);
  const distinct = v2Countries.rows.map((r) => r.val);
  const unmatched = distinct.filter((v) => resolve(v) === null).sort();
  return {
    v3CountriesSeeded: v3Countries.rows.length,
    v2DistinctValues: distinct.length,
    matched: distinct.length - unmatched.length,
    unmatched,
  };
}

/** Anything already sitting in the V3 target that a load would collide with. */
async function targetCollisions(v2, v3, src) {
  const existing = await tryQuery(v3, `SELECT lower(email) AS email FROM public.platform_users`);
  if (!existing.ok) return { error: existing.error };
  const v3Emails = new Set(existing.rows.map((r) => r.email));

  const source = await tryQuery(v2, `SELECT lower(trim(email)) AS email FROM ${srcSelect(src)} u`);
  if (!source.ok) return { error: source.error };

  const colliding = source.rows.map((r) => r.email).filter((e) => e && v3Emails.has(e));
  return { v3ExistingUsers: v3Emails.size, collidingEmails: colliding };
}

// ── Self-check ──────────────────────────────────────────────────────────────

function selfCheck() {
  assert.equal(normalizeEmail("  Amit@Globalyhub.COM "), "amit@globalyhub.com");
  assert.equal(normalizeEmail(null), null);

  assert.deepEqual(splitName({ firstName: "Amit", lastName: "Ranjitkar" }), {
    first: "Amit",
    last: "Ranjitkar",
    source: "profile",
  });
  // Profile wins over user.name when complete.
  assert.equal(splitName({ firstName: "A", lastName: "B", name: "Zed Zulu" }).source, "profile");
  // Falls back to user.name, keeping compound surnames intact.
  assert.deepEqual(splitName({ name: "Ada  van  Berg" }), {
    first: "Ada",
    last: "van Berg",
    source: "user.name",
  });
  // A half-name cannot fill two notNullable columns.
  assert.equal(splitName({ name: "Cher" }), null);
  assert.equal(splitName({ firstName: "OnlyFirst" }), null);
  assert.equal(splitName({}), null);

  assert.equal(normalizeCountry(" Nepal "), "nepal");
  assert.equal(normalizeCountry("   "), null);
  assert.equal(normalizeCountry(undefined), null);

  const resolve = buildCountryResolver([
    { id: 1, name: "Australia", iso2: "AU", iso3: "AUS" },
    { id: 2, name: "Nepal", iso2: "NP", iso3: "NPL" },
    { id: 3, name: "Croatia", iso2: "HR", iso3: "HRV" },
  ]);
  assert.equal(resolve("Australia"), 1); // by name
  assert.equal(resolve("au"), 1); // by ISO-2, case-insensitive
  assert.equal(resolve(" NPL "), 2); // by ISO-3, padded
  assert.equal(resolve("HR"), 3); // the code that failed the first recon
  assert.equal(resolve("Atlantis"), null);
  assert.equal(resolve(null), null);
  assert.equal(resolve(""), null);

  console.log("self-check: all assertions passed");
}

// ── Main ────────────────────────────────────────────────────────────────────

/** A failed query must never render as a number — silence would read as "all clear". */
function fmt(value) {
  if (value && typeof value === "object" && "error" in value) return `ERROR: ${value.error}`;
  return value;
}

function printReport(report) {
  const line = (s = "") => console.log(s);
  line("\n=== V2 -> V3 user migration recon (read-only) ===\n");
  line(`User source: ${report.userSource}\n`);

  line("Source inventory");
  for (const [k, v] of Object.entries(report.inventory)) line(`  ${k.padEnd(34)} ${v}`);

  line("\nIdentity overlap (auth.users vs better-auth user)");
  for (const [k, v] of Object.entries(report.identityOverlap)) line(`  ${k.padEnd(34)} ${v}`);

  line("\nLoad blockers");
  const b = report.blockers;
  line(`  users without email               ${fmt(b.usersWithoutEmail)}`);
  line(`  users with >1 profile             ${fmt(b.usersWithMultipleProfiles)}`);
  line(`  profiles with no user             ${fmt(b.profilesWithoutUser)}`);
  line(`  users with no profile             ${fmt(b.usersWithoutProfile)}`);
  if (!Array.isArray(b.duplicateEmails)) {
    line(`  duplicate emails (case-insens.)   ${fmt(b.duplicateEmails)}`);
  } else {
    const d = b.duplicateEmails;
    line(`  duplicate emails (case-insens.)   ${d.length}${d.length ? " -> " + d.map((x) => `${x.email} x${x.n}`).join(", ") : ""}`);
  }

  line("\nName resolution (V3 first_name + last_name are NOT NULL)");
  const n = report.nameResolution;
  if (n.error) line(`  ERROR: ${n.error}`);
  else {
    line(`  from profiles.first/last_name     ${n.profile}`);
    line(`  from user.name split              ${n["user.name"]}`);
    line(`  UNRESOLVED (needs a decision)     ${n.unresolved}`);
    for (const ex of n.unresolvedExamples) line(`      ${ex.id}  name=${JSON.stringify(ex.name)}`);
  }

  line("\nRole distribution");
  for (const [group, rows] of Object.entries(report.roleDistribution)) {
    line(`  ${group}:`);
    if (!Array.isArray(rows)) line(`    ERROR: ${rows.error}`);
    else for (const r of rows) line(`    ${JSON.stringify(r)}`);
  }

  line("\nCountry text -> countries.id coverage");
  const c = report.countryCoverage;
  if (c.error) line(`  ERROR: ${c.error}`);
  else {
    line(`  countries seeded in V3            ${c.v3CountriesSeeded}`);
    line(`  distinct V2 country strings       ${c.v2DistinctValues}`);
    line(`  matched / unmatched               ${c.matched} / ${c.unmatched.length}`);
    if (c.unmatched.length) line(`  unmatched: ${c.unmatched.join(", ")}`);
  }

  line("\nCollisions with the V3 target");
  const t = report.targetCollisions;
  if (t.error) line(`  ERROR: ${t.error}`);
  else {
    line(`  users already in V3               ${t.v3ExistingUsers}`);
    line(`  emails colliding on load          ${t.collidingEmails.length}${t.collidingEmails.length ? " -> " + t.collidingEmails.join(", ") : ""}`);
  }
  line();
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--self-check")) return selfCheck();

  const v2Url = process.env.V2_DATABASE_URL;
  if (!v2Url) {
    console.error("V2_DATABASE_URL is not set. Start the cloud-sql-proxy tunnel, then:");
    console.error("  V2_DATABASE_URL=postgres://user:pass@localhost:5544/globaly_staging \\");
    console.error("    node database/scripts/recon-v2-users.mjs");
    process.exit(2);
  }
  const v3Url = v3UrlFromEnv();
  if (!v3Url) {
    console.error("No V3 connection: set V3_DATABASE_URL or DB_USERNAME/DB_NAME in backend/.env");
    process.exit(2);
  }

  let v2, v3;
  try {
    v2 = await readOnlyClient(v2Url, "V2");
    v3 = await readOnlyClient(v3Url, "V3");

    const src = await resolveUserSource(v2);
    if (!src) {
      console.error('No user table found: neither public."user" nor auth.users exists.');
      process.exit(1);
    }

    const report = {
      userSource: src.label,
      inventory: await inventory(v2),
      identityOverlap: await identityOverlap(v2),
      blockers: await blockers(v2, src),
      nameResolution: await nameResolution(v2, src),
      roleDistribution: await roleDistribution(v2),
      countryCoverage: await countryCoverage(v2, v3),
      targetCollisions: await targetCollisions(v2, v3, src),
    };

    if (args.includes("--json")) console.log(JSON.stringify(report, null, 2));
    else printReport(report);
  } catch (err) {
    console.error(`recon failed: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await v2?.end().catch(() => {});
    await v3?.end().catch(() => {});
  }
}

// Only run when invoked directly — import-v1-users.mjs imports the helpers above.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
