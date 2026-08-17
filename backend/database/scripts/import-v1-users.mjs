// Loads V1 users into V3: platform_users + platform_user_profiles + superadmin.admin_users.
// Enough to make OTP login work for the personal and admin portals. Business-portal
// membership needs businesses migrated first (see --report at the end of a run).
//
//   node database/scripts/import-v1-users.mjs                 # dry run (default)
//   node database/scripts/import-v1-users.mjs --apply         # write
//   node database/scripts/import-v1-users.mjs --only=a@b.com  # single user
//   node database/scripts/import-v1-users.mjs --self-check    # pure-fn asserts, no DB
//
// Idempotent: keyed on platform_users.uuid (the preserved V1 UUID), so re-running
// updates in place instead of duplicating. V1_DATABASE_URL must point at the V1
// source; V3 defaults to the local backend/.env database.

import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

import { splitName, normalizeEmail, buildCountryResolver } from "./recon-v2-users.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(HERE, "../..");

// V1 app_role -> V3 superadmin.admin_users.role. V3 also has "admin"/"moderator",
// which V1 never issued. Anything unlisted is reported, never silently downgraded.
const ADMIN_ROLE_MAP = { super_admin: "super_admin", data_admin: "data_admin" };

// V1 profiles.individual_category -> V3 PERSONAL_SUB_CATEGORIES
// (src/modules/platform-users/consts.ts). Anything unlisted is reported, never
// silently coerced into a category the app does not know about.
const INDIVIDUAL_CATEGORY_MAP = {
  student: "student",
  exploring: "explorer",
  education_professional: "education_provider",
};

// ── Pure helpers (covered by --self-check) ──────────────────────────────────

/** V1 portal_type -> V3 account flags + account_categories jsonb. */
export function deriveAccountShape(portalType) {
  const isBusiness = portalType === "business";
  return {
    is_personal_account: !isBusiness,
    is_business_account: isBusiness,
    account_categories: isBusiness
      ? [{ type: "business", role: "education_agent" }]
      : [{ type: "personal", role: "student" }],
  };
}

/** V1 numerics arrive as strings from pg; V3 wants numbers or null, never NaN. */
export function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * V1 stores a display label ("AUD - Australian Dollar"); V3 stores the ISO-4217
 * code its UI shows next to the budget. The code is the prefix, so this is a
 * narrowing, not a guess — anything that is not a 3-letter code is kept verbatim
 * rather than dropped.
 */
export function toCurrencyCode(value) {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  const code = raw.split("-")[0].trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : raw;
}

/** V1 individual_category -> V3 PERSONAL_SUB_CATEGORIES; null when unmapped. */
export function mapIndividualCategory(value) {
  return INDIVIDUAL_CATEGORY_MAP[(value ?? "").trim()] ?? null;
}

/** V1 preferred_fields text[] -> V3 fields_of_study jsonb [{ name }]. */
export function toFieldsOfStudy(values) {
  return (values ?? []).map((name) => ({ name }));
}

// ── DB plumbing ─────────────────────────────────────────────────────────────

function v3UrlFromEnv() {
  if (process.env.V3_DATABASE_URL) return process.env.V3_DATABASE_URL;
  dotenv.config({ path: path.join(BACKEND_ROOT, ".env"), quiet: true });
  const { DB_USERNAME, DB_PASSWORD, DB_NAME, DB_HOST = "localhost", DB_PORT = "5432" } = process.env;
  if (!DB_USERNAME || !DB_NAME) return null;
  const auth = `${encodeURIComponent(DB_USERNAME)}:${encodeURIComponent(DB_PASSWORD ?? "")}`;
  return `postgresql://${auth}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;
}

async function connect(connectionString, label, { readOnly = false } = {}) {
  const client = new pg.Client({ connectionString });
  try {
    await client.connect();
  } catch (err) {
    throw new Error(`${label}: cannot connect — ${err.message}`);
  }
  if (readOnly) await client.query("SET default_transaction_read_only = on");
  return client;
}

/** V1 users joined to their profile and role, already filtered to load candidates. */
async function loadSourceRows(v1, onlyEmail) {
  const params = [];
  let filter = "";
  if (onlyEmail) {
    params.push(onlyEmail);
    filter = `AND lower(u.email::text) = lower($1)`;
  }
  const { rows } = await v1.query(
    `SELECT u.id::text                              AS uuid,
            lower(trim(u.email::text))              AS email,
            (u.email_confirmed_at IS NOT NULL)      AS verified,
            coalesce(u.raw_user_meta_data->>'full_name',
                     u.raw_user_meta_data->>'name') AS meta_name,
            p.first_name, p.last_name, p.phone, p.avatar_url,
            p.nationality, p.country_of_residence, p.personal_address_country,
            p.date_of_birth, p.gender, p.highest_degree_level, p.institution_attended,
            p.gpa, p.graduation_year, p.english_test_type, p.english_test_score,
            p.english_test_date, p.budget_min, p.budget_max,
            p.completion_percentage, p.onboarding_completed, p.portal_type,
            p.personal_address_street, p.personal_address_city,
            p.personal_address_state, p.personal_address_postcode,
            p.budget_currency, p.preferred_destinations, p.preferred_fields,
            p.preferred_degree_levels, p.expected_start_date,
            p.include_living_expenses, p.individual_category,
            p.linkedin_url, p.website_url,
            p.personal_address_lat, p.personal_address_lng,
            r.role::text                            AS v1_role
       FROM auth.users u
       LEFT JOIN public.profiles   p ON p.user_id::text = u.id::text
       LEFT JOIN public.user_roles r ON r.user_id::text = u.id::text
      WHERE u.deleted_at IS NULL
        AND u.email IS NOT NULL AND trim(u.email::text) <> ''
        ${filter}
      ORDER BY u.email`,
    params,
  );
  return rows;
}

// ── Load ────────────────────────────────────────────────────────────────────

async function importUser(v3, row, resolveCountry, report) {
  const name = splitName({ firstName: row.first_name, lastName: row.last_name, name: row.meta_name });
  if (!name) {
    report.skipped.push({ email: row.email, reason: "no resolvable first+last name" });
    return;
  }

  const shape = deriveAccountShape(row.portal_type);
  const userValues = {
    uuid: row.uuid,
    first_name: name.first,
    last_name: name.last,
    email: row.email,
    phone: row.phone ?? null,
    photo_url: row.avatar_url ?? null,
    // V1 accounts are pre-existing and real; V3 activates on first OTP anyway.
    account_status: 1,
    is_email_verified: row.verified === true,
    ...shape,
  };

  // Upsert on uuid — the preserved V1 identity — so re-runs update, never duplicate.
  const { rows: upserted } = await v3.query(
    `INSERT INTO public.platform_users
       (uuid, first_name, last_name, email, phone, photo_url, account_status,
        is_email_verified, is_personal_account, is_business_account, account_categories)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (uuid) DO UPDATE SET
       first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name,
       email = EXCLUDED.email, phone = EXCLUDED.phone, photo_url = EXCLUDED.photo_url,
       is_email_verified = EXCLUDED.is_email_verified, updated_at = now()
     RETURNING id, (xmax = 0) AS inserted`,
    [
      userValues.uuid, userValues.first_name, userValues.last_name, userValues.email,
      userValues.phone, userValues.photo_url, userValues.account_status,
      userValues.is_email_verified, userValues.is_personal_account,
      userValues.is_business_account, JSON.stringify(userValues.account_categories),
    ],
  );
  const userId = upserted[0].id;
  report[upserted[0].inserted ? "inserted" : "updated"].push(userValues.email);

  // Profile — country text/ISO-2 resolved to FKs; unmatched values reported, not dropped silently.
  for (const [field, value] of [
    ["nationality", row.nationality],
    ["country_of_residence", row.country_of_residence],
    ["personal_address_country", row.personal_address_country],
  ]) {
    if (value && resolveCountry(value) === null) {
      report.unresolvedCountries.push({ email: row.email, field, value });
    }
  }

  // Study preferences. preferred_destinations is a jsonb array of V3 country ids,
  // so free-text country names go through the same resolver as nationality.
  const destinationIds = [];
  for (const name of row.preferred_destinations ?? []) {
    const id = resolveCountry(name);
    if (id === null) {
      report.unresolvedCountries.push({ email: row.email, field: "preferred_destinations", value: name });
    } else {
      destinationIds.push(id);
    }
  }

  const rawCategory = (row.individual_category ?? "").trim() || null;
  const individualCategory = rawCategory ? mapIndividualCategory(rawCategory) : null;
  if (rawCategory && !individualCategory) {
    report.unmappedCategories.push({ email: row.email, value: rawCategory });
  }

  await v3.query(
    `INSERT INTO public.platform_user_profiles
       (user_id, nationality_id, country_of_residence_id, personal_address_country_id,
        date_of_birth, gender, highest_degree_level, institution_attended, gpa,
        graduation_year, english_test_type, english_test_score, english_test_date,
        budget_min, budget_max, completion_percentage, onboarding_completed,
        personal_address_street, personal_address_city, personal_address_state,
        personal_address_postcode, budget_currency, preferred_destinations,
        fields_of_study, preferred_degree_levels, expected_start_date,
        include_living_expenses, individual_category, linkedin_url, website_url,
        latitude, longitude)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
             $22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32)
     ON CONFLICT (user_id) DO UPDATE SET
       budget_currency = EXCLUDED.budget_currency,
       preferred_destinations = EXCLUDED.preferred_destinations,
       fields_of_study = EXCLUDED.fields_of_study,
       preferred_degree_levels = EXCLUDED.preferred_degree_levels,
       expected_start_date = EXCLUDED.expected_start_date,
       include_living_expenses = EXCLUDED.include_living_expenses,
       individual_category = EXCLUDED.individual_category,
       linkedin_url = EXCLUDED.linkedin_url,
       website_url = EXCLUDED.website_url,
       latitude = EXCLUDED.latitude,
       longitude = EXCLUDED.longitude,
       nationality_id = EXCLUDED.nationality_id,
       country_of_residence_id = EXCLUDED.country_of_residence_id,
       personal_address_country_id = EXCLUDED.personal_address_country_id,
       date_of_birth = EXCLUDED.date_of_birth, gender = EXCLUDED.gender,
       highest_degree_level = EXCLUDED.highest_degree_level,
       institution_attended = EXCLUDED.institution_attended, gpa = EXCLUDED.gpa,
       graduation_year = EXCLUDED.graduation_year,
       english_test_type = EXCLUDED.english_test_type,
       english_test_score = EXCLUDED.english_test_score,
       english_test_date = EXCLUDED.english_test_date,
       budget_min = EXCLUDED.budget_min, budget_max = EXCLUDED.budget_max,
       completion_percentage = EXCLUDED.completion_percentage,
       onboarding_completed = EXCLUDED.onboarding_completed,
       personal_address_street = EXCLUDED.personal_address_street,
       personal_address_city = EXCLUDED.personal_address_city,
       personal_address_state = EXCLUDED.personal_address_state,
       personal_address_postcode = EXCLUDED.personal_address_postcode,
       updated_at = now()`,
    [
      userId,
      resolveCountry(row.nationality),
      resolveCountry(row.country_of_residence),
      resolveCountry(row.personal_address_country),
      row.date_of_birth ?? null,
      row.gender ?? null,
      row.highest_degree_level ?? null,
      row.institution_attended ?? null,
      toNumberOrNull(row.gpa),
      toNumberOrNull(row.graduation_year),
      row.english_test_type ?? null,
      toNumberOrNull(row.english_test_score),
      row.english_test_date ?? null,
      toNumberOrNull(row.budget_min),
      toNumberOrNull(row.budget_max),
      toNumberOrNull(row.completion_percentage) ?? 0,
      row.onboarding_completed === true,
      row.personal_address_street ?? null,
      row.personal_address_city ?? null,
      row.personal_address_state ?? null,
      row.personal_address_postcode ?? null,
      toCurrencyCode(row.budget_currency),
      JSON.stringify(destinationIds),
      JSON.stringify(toFieldsOfStudy(row.preferred_fields)),
      row.preferred_degree_levels ?? null,
      row.expected_start_date ?? null,
      row.include_living_expenses === true,
      individualCategory,
      row.linkedin_url ?? null,
      row.website_url ?? null,
      toNumberOrNull(row.personal_address_lat),
      toNumberOrNull(row.personal_address_lng),
    ],
  );

  // Admin portal access.
  if (row.v1_role) {
    const v3Role = ADMIN_ROLE_MAP[row.v1_role];
    if (!v3Role) {
      report.unmappedRoles.push({ email: row.email, role: row.v1_role });
    } else {
      await v3.query(
        `INSERT INTO superadmin.admin_users (platform_user_id, role, is_active)
         VALUES ($1, $2, true)
         ON CONFLICT (platform_user_id) DO UPDATE SET role = EXCLUDED.role, updated_at = now()`,
        [userId, v3Role],
      );
      report.admins.push({ email: row.email, role: v3Role });
    }
  }
}

// ── Self-check ──────────────────────────────────────────────────────────────

function selfCheck() {
  const student = deriveAccountShape("student");
  assert.equal(student.is_personal_account, true);
  assert.equal(student.is_business_account, false);
  assert.deepEqual(student.account_categories, [{ type: "personal", role: "student" }]);

  const business = deriveAccountShape("business");
  assert.equal(business.is_business_account, true);
  assert.equal(business.is_personal_account, false);

  // A null/unknown portal_type must not produce a user with no account type at all.
  assert.equal(deriveAccountShape(null).is_personal_account, true);

  assert.equal(toNumberOrNull("3.75"), 3.75);
  assert.equal(toNumberOrNull(""), null);
  assert.equal(toNumberOrNull(null), null);
  assert.equal(toNumberOrNull("not a number"), null);
  assert.equal(toNumberOrNull(0), 0);

  assert.equal(toCurrencyCode("AUD - Australian Dollar"), "AUD");
  assert.equal(toCurrencyCode("aud"), "AUD");
  assert.equal(toCurrencyCode(""), null);
  assert.equal(toCurrencyCode(null), null);
  // Not a 3-letter code: kept verbatim rather than silently dropped.
  assert.equal(toCurrencyCode("Australian Dollar"), "Australian Dollar");

  assert.equal(mapIndividualCategory("exploring"), "explorer");
  assert.equal(mapIndividualCategory("education_professional"), "education_provider");
  assert.equal(mapIndividualCategory("student"), "student");
  assert.equal(mapIndividualCategory("nonsense"), null);
  assert.equal(mapIndividualCategory(null), null);

  assert.deepEqual(toFieldsOfStudy(["Engineering", "Law"]), [{ name: "Engineering" }, { name: "Law" }]);
  assert.deepEqual(toFieldsOfStudy(null), []);

  assert.equal(normalizeEmail(" A@B.com "), "a@b.com");
  assert.equal(splitName({ name: "Amit Ranjitkar" }).first, "Amit");

  console.log("self-check: all assertions passed");
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--self-check")) return selfCheck();

  const apply = args.includes("--apply");
  const only = args.find((a) => a.startsWith("--only="))?.split("=")[1] ?? null;

  const v1Url = process.env.V1_DATABASE_URL;
  if (!v1Url) {
    console.error("V1_DATABASE_URL is not set (the restored V1 database).");
    process.exit(2);
  }
  const v3Url = v3UrlFromEnv();
  if (!v3Url) {
    console.error("No V3 connection: set V3_DATABASE_URL or DB_USERNAME/DB_NAME in backend/.env");
    process.exit(2);
  }

  let v1, v3;
  const report = {
    inserted: [], updated: [], skipped: [], admins: [],
    unresolvedCountries: [], unmappedRoles: [], unmappedCategories: [],
  };

  try {
    v1 = await connect(v1Url, "V1", { readOnly: true });
    v3 = await connect(v3Url, "V3");

    const { rows: countries } = await v3.query(`SELECT id, name, iso2, iso3 FROM public.countries`);
    const resolveCountry = buildCountryResolver(countries);

    const source = await loadSourceRows(v1, only);
    console.log(`source rows: ${source.length}${only ? ` (filtered to ${only})` : ""}`);
    console.log(apply ? "mode: APPLY (writing)\n" : "mode: DRY RUN (rolled back)\n");

    // One transaction for the whole load: a dry run rolls it back, and a mid-run
    // failure never leaves half the users imported.
    await v3.query("BEGIN");
    for (const row of source) await importUser(v3, row, resolveCountry, report);
    await v3.query(apply ? "COMMIT" : "ROLLBACK");

    console.log(`inserted: ${report.inserted.length}`);
    console.log(`updated:  ${report.updated.length}`);
    console.log(`admins:   ${report.admins.length}${report.admins.length ? " -> " + report.admins.map((a) => `${a.email}=${a.role}`).join(", ") : ""}`);
    if (report.skipped.length) {
      console.log(`skipped:  ${report.skipped.length}`);
      for (const s of report.skipped) console.log(`   ${s.email}: ${s.reason}`);
    }
    if (report.unmappedRoles.length) {
      console.log(`UNMAPPED ROLES (no admin row written):`);
      for (const r of report.unmappedRoles) console.log(`   ${r.email}: ${r.role}`);
    }
    if (report.unmappedCategories.length) {
      console.log(`UNMAPPED individual_category (stored as NULL):`);
      for (const c of report.unmappedCategories) console.log(`   ${c.email}: ${c.value}`);
    }
    if (report.unresolvedCountries.length) {
      console.log(`unresolved countries (stored as NULL):`);
      for (const c of report.unresolvedCountries) console.log(`   ${c.email} ${c.field}=${c.value}`);
    }
    if (!apply) console.log("\nnothing was written — re-run with --apply");
  } catch (err) {
    if (v3) await v3.query("ROLLBACK").catch(() => {});
    console.error(`import failed: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await v1?.end().catch(() => {});
    await v3?.end().catch(() => {});
  }
}

await main();
