/**
 * W1.2 — identity (Part 3 §4 W1.2, §5).
 *
 * v1_staging.auth_users + profiles  ->  public.platform_users + platform_user_profiles
 * v1_staging.user_roles             ->  superadmin.admin_users
 *
 * THE KEY IS EMAIL (§5). V1's auth uuid is preserved verbatim in
 * platform_users.uuid, but the upsert converges on the email, because the whole
 * point of W1.2 is that it can be re-run against a database that already holds
 * hand-migrated users and absorb them rather than creating shadow copies. The
 * table happens to be empty today; the convergence property is what has to hold
 * on the second run, not the first.
 *
 * Set-based on purpose: one statement per target, so the dry run exercises the
 * identical statement — including every NOT NULL and UNIQUE the apply will hit —
 * and the only difference between rehearsal and cutover is ROLLBACK vs COMMIT.
 *
 * The last step is the §8 risk-1 repair: businesses and profiles carry country
 * FKs resolved from V1 free text, and §8 lists "silent-wrong country_ids already
 * in the database" as a carried-forward risk. Rather than repairing after the
 * fact, the transform re-resolves them from the source every run and reports how
 * many rows it had to change. On a correct load that number is 0 — which is the
 * proof, not the absence of evidence.
 *
 * Usage:
 *   node --import tsx scripts/migration/w1-identity.ts --self-check
 *   node --import tsx scripts/migration/w1-identity.ts             # dry run
 *   node --import tsx scripts/migration/w1-identity.ts --apply
 */

import assert from "node:assert/strict";

import {
  assertTargetColumns,
  clearReport,
  execWrite,
  normKeySql,
  normalizeEmail,
  reportUnresolvedQuery,
  runTransform,
  type TransformContext,
} from "./lib.js";

/**
 * Country free text -> countries.id, through the same resolver every wave uses.
 * NULL in, NULL out; unresolvable in, NULL out AND a reported row — never a
 * quietly wrong id, which is exactly the §8 risk this replaces.
 */
export const countryId = (expr: string): string =>
  `(SELECT mc.id FROM mig.map_countries mc WHERE mc.key = ${normKeySql(expr)})`;

/**
 * V1 kept one identity per person but wrote the name in two places, and V3 needs
 * first + last, both NOT NULL. The profile's first+last wins when BOTH are
 * present; otherwise the GoTrue metadata name is split at the first space. A
 * user with neither is not given an invented name — it is reported.
 */
const NAME_TOKENS = `regexp_split_to_array(btrim(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')), '\\s+')`;
const FIRST_NAME = `CASE WHEN btrim(coalesce(p.first_name,'')) <> '' AND btrim(coalesce(p.last_name,'')) <> '' THEN btrim(p.first_name)
                         WHEN coalesce(array_length(${NAME_TOKENS}, 1), 0) >= 2 THEN (${NAME_TOKENS})[1] END`;
const LAST_NAME = `CASE WHEN btrim(coalesce(p.first_name,'')) <> '' AND btrim(coalesce(p.last_name,'')) <> '' THEN btrim(p.last_name)
                        WHEN coalesce(array_length(${NAME_TOKENS}, 1), 0) >= 2 THEN array_to_string((${NAME_TOKENS})[2:], ' ') END`;

/** Live V1 identities: soft-deleted and email-less rows never become accounts. */
const LIVE_USERS = `
    FROM v1_staging.auth_users u
    LEFT JOIN v1_staging.profiles p ON p.user_id = u.id
   WHERE u.deleted_at IS NULL AND u.email IS NOT NULL AND btrim(u.email::text) <> ''
`;

/**
 * V1's `individual_category` labels -> V3's PERSONAL_SUB_CATEGORIES.
 * An unlisted label lands NULL and is reported; coercing it to `student` would
 * silently reclassify a person.
 */
const INDIVIDUAL_CATEGORY = `CASE nullif(btrim(coalesce(p.individual_category,'')),'')
                                  WHEN 'student' THEN 'student'
                                  WHEN 'exploring' THEN 'explorer'
                                  WHEN 'education_professional' THEN 'education_provider' END`;

/**
 * V1 stores the currency as a display label ("AUD - Australian Dollar"); V3
 * stores the ISO-4217 code. Anything that is not a 3-letter code is kept
 * verbatim rather than dropped — a value nobody planned for is still data.
 */
export const currencyCode = (expr: string): string =>
  `CASE WHEN btrim(coalesce(${expr},'')) = '' THEN NULL
        WHEN upper(btrim(split_part(btrim(${expr}), '-', 1))) ~ '^[A-Z]{3}$' THEN upper(btrim(split_part(btrim(${expr}), '-', 1)))
        ELSE btrim(${expr}) END`;

const USER_COLUMNS = [
  "uuid", "first_name", "last_name", "email", "phone", "photo_url",
  "account_status", "is_email_verified", "is_personal_account", "is_business_account", "account_categories",
];

const PROFILE_COLUMNS = [
  "user_id", "nationality_id", "country_of_residence_id", "personal_address_country_id",
  "date_of_birth", "gender", "highest_degree_level", "institution_attended", "gpa", "graduation_year",
  "english_test_type", "english_test_score", "english_test_date", "budget_min", "budget_max",
  "budget_currency", "include_living_expenses", "preferred_destinations", "fields_of_study",
  "preferred_degree_levels", "expected_start_date", "latitude", "longitude",
  "completion_percentage", "onboarding_completed", "individual_category",
  "personal_address_city", "personal_address_state", "personal_address_street", "personal_address_postcode",
  "linkedin_url", "website_url",
];

export async function transformIdentity(ctx: TransformContext, allowedCodes: ReadonlySet<string>): Promise<void> {
  await assertTargetColumns(ctx.db, "public", "platform_users", USER_COLUMNS);
  await assertTargetColumns(ctx.db, "public", "platform_user_profiles", PROFILE_COLUMNS);
  await assertTargetColumns(ctx.db, "superadmin", "admin_users", ["platform_user_id", "role", "is_active"]);
  await clearReport(ctx, ["auth_users", "profiles", "user_roles"]);

  // ── platform_users ─────────────────────────────────────────────────────────
  // Both name columns are NOT NULL, so a user with no derivable name cannot be
  // written. Reported first, then excluded — never given a placeholder name.
  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "auth_users",
    targetTable: "public.platform_users",
    column: "first_name",
    reasonCode: "invalid_source_data",
    sql: `SELECT u.id::text, 'no first+last on the profile and no full_name/name in raw_user_meta_data; '
                 || 'platform_users.first_name and last_name are both NOT NULL'
          ${LIVE_USERS} AND (${FIRST_NAME}) IS NULL`,
  });

  await execWrite(
    ctx,
    "public.platform_users",
    `INSERT INTO public.platform_users (${USER_COLUMNS.join(", ")})
     SELECT u.id,
            ${FIRST_NAME},
            coalesce(${LAST_NAME}, ''),
            lower(btrim(u.email::text)),
            nullif(btrim(coalesce(p.phone, '')), ''),
            p.avatar_url,
            1,
            (u.email_confirmed_at IS NOT NULL),
            (coalesce(p.portal_type, 'student') <> 'business'),
            (coalesce(p.portal_type, 'student') = 'business'),
            CASE WHEN coalesce(p.portal_type, 'student') = 'business'
                 THEN '[{"type":"business","role":"education_agent"}]'::jsonb
                 ELSE '[{"type":"personal","role":"student"}]'::jsonb END
     ${LIVE_USERS} AND (${FIRST_NAME}) IS NOT NULL
     ON CONFLICT (email) DO UPDATE SET
       uuid = EXCLUDED.uuid,
       first_name = EXCLUDED.first_name,
       last_name = EXCLUDED.last_name,
       phone = EXCLUDED.phone,
       photo_url = EXCLUDED.photo_url,
       is_email_verified = EXCLUDED.is_email_verified,
       is_personal_account = EXCLUDED.is_personal_account,
       is_business_account = EXCLUDED.is_business_account,
       account_categories = EXCLUDED.account_categories,
       updated_at = now()`,
  );

  // ── platform_user_profiles ─────────────────────────────────────────────────
  // Country free text that resolves to nothing is reported per column, and the
  // FK is left NULL. NULL here is valid business state ("we don't know"); a
  // wrong id is not, and §8 says wrong ids are exactly what V1 left behind.
  for (const [column, source] of [
    ["nationality_id", "p.nationality"],
    ["country_of_residence_id", "p.country_of_residence"],
    ["personal_address_country_id", "p.personal_address_country"],
  ] as const) {
    await reportUnresolvedQuery(ctx, allowedCodes, {
      sourceTable: "profiles",
      targetTable: "public.platform_user_profiles",
      column,
      reasonCode: "unresolved_country",
      sql: `SELECT p.user_id::text, ${source} || ' did not resolve to a countries row'
              FROM v1_staging.profiles p
             WHERE btrim(coalesce(${source}, '')) <> '' AND ${countryId(source)} IS NULL`,
    });
  }

  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "profiles",
    targetTable: "public.platform_user_profiles",
    column: "preferred_destinations",
    reasonCode: "unresolved_country",
    sql: `SELECT p.user_id::text, 'preferred destination ' || d.v || ' did not resolve to a countries row'
            FROM v1_staging.profiles p, unnest(coalesce(p.preferred_destinations, '{}'::text[])) AS d(v)
           WHERE btrim(coalesce(d.v, '')) <> '' AND ${countryId("d.v")} IS NULL`,
  });

  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "profiles",
    targetTable: "public.platform_user_profiles",
    column: "individual_category",
    reasonCode: "invalid_source_data",
    sql: `SELECT p.user_id::text, 'individual_category "' || p.individual_category || '" is not one of V3 PERSONAL_SUB_CATEGORIES'
            FROM v1_staging.profiles p
           WHERE nullif(btrim(coalesce(p.individual_category,'')),'') IS NOT NULL AND (${INDIVIDUAL_CATEGORY}) IS NULL`,
  });

  await execWrite(
    ctx,
    "public.platform_user_profiles",
    `INSERT INTO public.platform_user_profiles (${PROFILE_COLUMNS.join(", ")})
     SELECT pu.id,
            ${countryId("p.nationality")},
            ${countryId("p.country_of_residence")},
            ${countryId("p.personal_address_country")},
            p.date_of_birth, p.gender, p.highest_degree_level, p.institution_attended,
            p.gpa, p.graduation_year,
            p.english_test_type, p.english_test_score, p.english_test_date,
            p.budget_min, p.budget_max,
            ${currencyCode("p.budget_currency")},
            (p.include_living_expenses IS TRUE),
            (SELECT coalesce(jsonb_agg(gc.id ORDER BY d.ord), '[]'::jsonb)
               FROM unnest(coalesce(p.preferred_destinations, '{}'::text[])) WITH ORDINALITY AS d(v, ord)
               JOIN mig.map_countries gc ON gc.key = ${normKeySql("d.v")}),
            (SELECT coalesce(jsonb_agg(jsonb_build_object('name', f.v) ORDER BY f.ord), '[]'::jsonb)
               FROM unnest(coalesce(p.preferred_fields, '{}'::text[])) WITH ORDINALITY AS f(v, ord)),
            p.preferred_degree_levels, p.expected_start_date,
            p.personal_address_lat::numeric(10,7), p.personal_address_lng::numeric(10,7),
            coalesce(p.completion_percentage, 0), (p.onboarding_completed IS TRUE),
            ${INDIVIDUAL_CATEGORY},
            p.personal_address_city, p.personal_address_state, p.personal_address_street, p.personal_address_postcode,
            p.linkedin_url, p.website_url
       FROM v1_staging.profiles p
       JOIN v1_staging.auth_users u ON u.id = p.user_id
       JOIN public.platform_users pu ON pu.uuid = u.id
      WHERE u.deleted_at IS NULL AND u.email IS NOT NULL AND btrim(u.email::text) <> ''
     ON CONFLICT (user_id) DO UPDATE SET
       ${PROFILE_COLUMNS.filter((c) => c !== "user_id").map((c) => `${c} = EXCLUDED.${c}`).join(",\n       ")},
       updated_at = now()`,
  );

  // ── superadmin.admin_users ─────────────────────────────────────────────────
  // V1's user_roles is the PLATFORM role grant, not a tenant role. Roles are
  // mapped explicitly, never downgraded to a default: an unrecognised role would
  // hand someone the wrong console.
  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "user_roles",
    targetTable: "superadmin.admin_users",
    column: "role",
    reasonCode: "invalid_source_data",
    sql: `SELECT r.user_id::text, 'V1 platform role "' || r.role::text || '" has no superadmin.admin_users equivalent'
            FROM v1_staging.user_roles r
            JOIN v1_staging.auth_users u ON u.id = r.user_id
           WHERE u.deleted_at IS NULL AND u.email IS NOT NULL AND btrim(u.email::text) <> ''
             AND r.role::text NOT IN ('super_admin','data_admin')`,
  });

  await execWrite(
    ctx,
    "superadmin.admin_users",
    `INSERT INTO superadmin.admin_users (platform_user_id, role, is_active)
     SELECT pu.id, r.role::text, true
       FROM v1_staging.user_roles r
       JOIN v1_staging.auth_users u ON u.id = r.user_id
       JOIN public.platform_users pu ON pu.uuid = u.id
      WHERE u.deleted_at IS NULL AND u.email IS NOT NULL AND btrim(u.email::text) <> ''
        AND r.role::text IN ('super_admin','data_admin')
     ON CONFLICT (platform_user_id) DO UPDATE SET
       role = EXCLUDED.role, is_active = EXCLUDED.is_active, updated_at = now()`,
  );

  // ── §8 risk 1: the country-FK repair ───────────────────────────────────────
  // Re-resolve every country FK on the profile straight from the V1 free text.
  // The load above already wrote the right value, so this is expected to change
  // 0 rows — and a non-zero count is the alarm, not the fix.
  await execWrite(
    ctx,
    "public.platform_user_profiles (country FK repair)",
    `UPDATE public.platform_user_profiles t
        SET nationality_id              = ${countryId("p.nationality")},
            country_of_residence_id     = ${countryId("p.country_of_residence")},
            personal_address_country_id = ${countryId("p.personal_address_country")},
            updated_at                  = now()
       FROM v1_staging.profiles p
       JOIN v1_staging.auth_users u ON u.id = p.user_id
       JOIN public.platform_users pu ON pu.uuid = u.id
      WHERE t.user_id = pu.id
        AND (t.nationality_id              IS DISTINCT FROM ${countryId("p.nationality")}
          OR t.country_of_residence_id     IS DISTINCT FROM ${countryId("p.country_of_residence")}
          OR t.personal_address_country_id IS DISTINCT FROM ${countryId("p.personal_address_country")})`,
  );
}

export function identitySelfCheck(): void {
  // Email is the convergence key (§5), so a value that cannot be one must not
  // become one — two blank emails are not the same person.
  assert.equal(normalizeEmail(" A@B.com "), "a@b.com");
  assert.equal(normalizeEmail("   "), null);

  // The currency label V1 actually stores, and the two shapes it comes in.
  assert.match(currencyCode("x"), /\^\[A-Z\]\{3\}\$/);
  assert.ok(currencyCode("x").includes("split_part"), "the ISO code is the prefix before the dash");
  assert.ok(currencyCode("x").includes("ELSE btrim(x)"), "an unrecognised currency is kept, not dropped");

  // Both name paths must be present, and neither may invent a name.
  assert.ok(FIRST_NAME.includes("p.first_name") && FIRST_NAME.includes("raw_user_meta_data"));
  assert.ok(!FIRST_NAME.includes("'Unknown'") && !LAST_NAME.includes("'Unknown'"));
  assert.ok(LAST_NAME.includes("[2:]"), "the surname is everything after the first token");

  // The category map is closed: three known labels in, nothing else coerced.
  for (const label of ["student", "exploring", "education_professional"]) {
    assert.ok(INDIVIDUAL_CATEGORY.includes(`'${label}'`), `${label} must be mapped explicitly`);
  }
  assert.ok(!INDIVIDUAL_CATEGORY.includes("ELSE"), "an unlisted category falls through to NULL, never to a default");

  // Every profile column written must be updated on conflict, or a re-run would
  // leave stale values behind and convergence would be a claim, not a property.
  assert.ok(PROFILE_COLUMNS.includes("user_id") && PROFILE_COLUMNS[0] === "user_id");
  assert.equal(new Set(PROFILE_COLUMNS).size, PROFILE_COLUMNS.length);
  assert.equal(new Set(USER_COLUMNS).size, USER_COLUMNS.length);

  console.log(`w1-identity self-check: ok — ${USER_COLUMNS.length} user columns, ${PROFILE_COLUMNS.length} profile columns`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await runTransform({ wave: "W1-identity", body: transformIdentity, selfCheck: identitySelfCheck }));
}
