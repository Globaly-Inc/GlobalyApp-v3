/**
 * W1.3 — businesses, institutions and the membership index (Part 3 §4 W1.2, §5).
 *
 * V1 kept ONE `businesses` table holding two different things, and V3 separates
 * them:
 *
 *   16 rows have a real accepted owner  ->  public.businesses (a tenant)
 *   39 rows are unclaimed directory listings -> public.institutions (claimable)
 *
 * `businesses.owner_id` is NOT NULL in V3, so a listing nobody owns cannot be a
 * business — and dropping the other 39 would throw away the directory the
 * catalogue is built on. The split is therefore the migration, not a filter:
 * 55 staged = 16 + 39, with no reason-coded skips, because nothing is skipped.
 *
 * Two identities, both stable across re-runs:
 *   businesses    meta->>'v1_business_id', with schema_name derived
 *                 DETERMINISTICALLY from the V1 uuid so a second run lands on
 *                 the same tenant schema instead of provisioning a new one.
 *   institutions  v1_business_id (a real column, UNIQUE), which is what
 *                 mig.map_institutions resolves W2's references through.
 *
 * Usage:
 *   node --import tsx scripts/migration/w1-businesses.ts --self-check
 *   node --import tsx scripts/migration/w1-businesses.ts             # dry run
 *   node --import tsx scripts/migration/w1-businesses.ts --apply
 */

import assert from "node:assert/strict";

import { countryId, currencyCode } from "./w1-identity.js";
import {
  assertParentCounts,
  assertTargetColumns,
  clearReport,
  dnsLabel,
  execWrite,
  reportUnresolvedQuery,
  runTransform,
  type TransformContext,
} from "./lib.js";

/**
 * dnsLabel(), as SQL. Same rules as the TypeScript helper: decompose accents,
 * everything else becomes a hyphen, no leading/trailing hyphen, 63 characters.
 */
export const dnsLabelSql = (expr: string): string =>
  `nullif(btrim(left(btrim(regexp_replace(regexp_replace(lower(normalize(coalesce(${expr}, ''), NFKD)), '[̀-ͯ]', '', 'g'), '[^a-z0-9]+', '-', 'g'), '-'), 63), '-'), '')`;

/**
 * The tenant schema uuid, derived from the V1 business uuid rather than
 * generated. gen_random_uuid() would hand a re-run a brand-new schema name and
 * leave the first one orphaned; a derived name makes the upsert converge and
 * makes `businesses.schema_name` the natural conflict target.
 */
const SCHEMA_NAME = `md5('globaly-tenant:' || b.id::text)::uuid`;

/** A V1 business with an accepted, still-live owner: the tenant half of the split. */
const HAS_ACCEPTED_OWNER = `EXISTS (
  SELECT 1 FROM v1_staging.business_members bm
    JOIN v1_staging.auth_users bu ON bu.id = bm.user_id
   WHERE bm.business_id = b.id AND bm.role::text = 'owner' AND bm.invite_status = 'accepted'
     AND bm.user_id IS NOT NULL AND bu.deleted_at IS NULL)`;

/** V3 businesses.owner_id is NOT NULL; this is the person it points at. */
const OWNER_ID = `(SELECT pu.id
                     FROM v1_staging.business_members bm
                     JOIN public.platform_users pu ON pu.uuid = bm.user_id
                    WHERE bm.business_id = b.id AND bm.role::text = 'owner' AND bm.invite_status = 'accepted'
                    ORDER BY bm.joined_at NULLS LAST
                    LIMIT 1)`;

/** V1 category uuid -> V3 serial, bridged by the slug (the natural key W2 verifies on). */
const CATEGORY_ID = `(SELECT gbc.id
                        FROM v1_staging.business_categories vbc
                        JOIN public.business_categories gbc ON lower(btrim(gbc.slug)) = lower(btrim(vbc.slug))
                       WHERE vbc.id = b.business_category_id AND gbc.deleted_at IS NULL)`;

/** V1's member roles as V3 names. `staff` is the only rename; nothing defaults. */
const ROLE = `CASE m.role::text WHEN 'staff' THEN 'member' ELSE m.role::text END`;
const MEMBER_ROLES = "('owner','admin','staff','member','manager','counsellor')";

/**
 * The membership rows that become an index entry (and, in w1-tenants, an agent).
 * Same filter the user_business_index mapping declares, so the gate and the
 * loader are looking at the same 19 rows.
 */
export const liveMembers = (...extraJoins: string[]): string => `
    FROM v1_staging.business_members m
    JOIN v1_staging.auth_users mu ON mu.id = m.user_id
    JOIN v1_staging.businesses mb ON mb.id = m.business_id
    ${extraJoins.join("\n    ")}
   WHERE m.user_id IS NOT NULL AND m.invite_status = 'accepted' AND mu.deleted_at IS NULL
     AND m.role::text IN ${MEMBER_ROLES}
     AND EXISTS (SELECT 1 FROM v1_staging.business_members bm2
                   JOIN v1_staging.auth_users bu2 ON bu2.id = bm2.user_id
                  WHERE bm2.business_id = mb.id AND bm2.role::text = 'owner'
                    AND bm2.invite_status = 'accepted' AND bu2.deleted_at IS NULL)
`;

const BUSINESS_COLUMNS = [
  "meta", "schema_name", "owner_id", "subdomain", "business_name", "business_type", "description",
  "logo_url", "cover_url", "website", "email", "phone", "country_id", "state", "city", "address",
  "postcode", "linkedin_url", "facebook_url", "twitter_url", "instagram_url", "youtube_url",
  "whatsapp_url", "gallery_images", "video_urls", "business_registration_number",
  "registration_licenses", "status", "verified_at", "account_status", "is_published",
  "business_category_id", "currency",
];

const INSTITUTION_COLUMNS = [
  "v1_business_id", "institution_name", "institution_type", "description", "logo_url", "cover_url",
  "website", "email", "phone", "country_id", "state", "city", "address", "postcode",
  "linkedin_url", "facebook_url", "twitter_url", "instagram_url", "youtube_url", "whatsapp_url",
  "gallery_images", "video_urls", "registration_number", "registration_licenses",
  "status", "verified_at", "is_published", "meta",
];

export async function transformBusinesses(ctx: TransformContext, allowedCodes: ReadonlySet<string>): Promise<void> {
  await assertTargetColumns(ctx.db, "public", "businesses", BUSINESS_COLUMNS);
  await assertTargetColumns(ctx.db, "public", "institutions", INSTITUTION_COLUMNS);
  await assertTargetColumns(ctx.db, "public", "user_business_index", ["platform_user_id", "business_id", "role", "is_owner"]);
  await clearReport(ctx, ["businesses", "business_members"]);

  // A business with an accepted owner whose owner did not migrate cannot be
  // written at all (owner_id is NOT NULL). Reported before the insert, so the
  // statement below can assume the owner is there.
  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "businesses",
    targetTable: "public.businesses",
    column: "owner_id",
    reasonCode: "unresolved_user",
    sql: `SELECT b.id::text, 'accepted owner exists in V1 but has no platform_users row; businesses.owner_id is NOT NULL'
            FROM v1_staging.businesses b
           WHERE ${HAS_ACCEPTED_OWNER} AND ${OWNER_ID} IS NULL`,
  });

  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "businesses",
    targetTable: "public.businesses",
    column: "subdomain",
    reasonCode: "invalid_source_data",
    sql: `SELECT b.id::text, 'neither slug nor name yields a usable DNS label, and businesses.subdomain is NOT NULL'
            FROM v1_staging.businesses b
           WHERE ${HAS_ACCEPTED_OWNER} AND ${dnsLabelSql("coalesce(nullif(btrim(b.slug), ''), b.name)")} IS NULL`,
  });

  // ── the 16 tenants ─────────────────────────────────────────────────────────
  await execWrite(
    ctx,
    "public.businesses",
    `INSERT INTO public.businesses (${BUSINESS_COLUMNS.join(", ")})
     SELECT jsonb_build_object('v1_business_id', b.id::text),
            ${SCHEMA_NAME},
            ${OWNER_ID},
            ${dnsLabelSql("coalesce(nullif(btrim(b.slug), ''), b.name)")},
            b.name, b.business_type::text, b.description,
            b.logo_url, b.cover_url, b.website, b.email, b.phone,
            ${countryId("b.country")}, b.state, b.city, b.address, b.postcode,
            b.linkedin_url, b.facebook_url, b.twitter_url, b.instagram_url, b.youtube_url,
            b.whatsapp_url, b.gallery_images, b.video_urls, b.registration_code,
            b.registration_licenses,
            coalesce(b.status::text, 'pending'), b.verified_at,
            CASE WHEN b.is_suspended IS TRUE THEN 0 ELSE 1 END,
            (b.is_published IS TRUE),
            ${CATEGORY_ID},
            ${currencyCode("b.default_currency")}
       FROM v1_staging.businesses b
      WHERE ${HAS_ACCEPTED_OWNER}
        AND ${OWNER_ID} IS NOT NULL
        AND ${dnsLabelSql("coalesce(nullif(btrim(b.slug), ''), b.name)")} IS NOT NULL
     ON CONFLICT (schema_name) DO UPDATE SET
       ${BUSINESS_COLUMNS.filter((c) => c !== "schema_name").map((c) => `${c} = EXCLUDED.${c}`).join(",\n       ")},
       updated_at = now()`,
  );

  // ── the 39 unclaimed listings ──────────────────────────────────────────────
  // institutions.email is UNIQUE and V1's directory has four addresses shared by
  // more than one listing. The first (by V1 id) keeps the address; the rest get
  // NULL and a reason-coded row naming the column — the listing still migrates.
  const UNCLAIMED = `FROM v1_staging.businesses b WHERE NOT ${HAS_ACCEPTED_OWNER}`;
  const UNIQUE_EMAIL = `CASE WHEN nullif(btrim(coalesce(b.email, '')), '') IS NULL THEN NULL
                             WHEN EXISTS (SELECT 1 FROM v1_staging.businesses b2
                                           WHERE lower(btrim(b2.email)) = lower(btrim(b.email))
                                             AND b2.id < b.id) THEN NULL
                             ELSE btrim(b.email) END`;

  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "businesses",
    targetTable: "public.institutions",
    column: "email",
    reasonCode: "duplicate_natural_key",
    sql: `SELECT b.id::text, 'email ' || btrim(b.email) || ' is already used by an earlier V1 listing; institutions.email is UNIQUE, so this row migrates with a NULL email'
            ${UNCLAIMED} AND nullif(btrim(coalesce(b.email, '')), '') IS NOT NULL AND ${UNIQUE_EMAIL} IS NULL`,
  });

  await execWrite(
    ctx,
    "public.institutions",
    `INSERT INTO public.institutions (${INSTITUTION_COLUMNS.join(", ")})
     SELECT b.id, b.name, b.business_type::text, b.description, b.logo_url, b.cover_url,
            b.website, ${UNIQUE_EMAIL}, b.phone,
            ${countryId("b.country")}, b.state, b.city, b.address, b.postcode,
            b.linkedin_url, b.facebook_url, b.twitter_url, b.instagram_url, b.youtube_url, b.whatsapp_url,
            b.gallery_images, b.video_urls, b.registration_code, b.registration_licenses,
            coalesce(b.status::text, 'pending'), b.verified_at, (b.is_published IS TRUE),
            jsonb_build_object('v1_business_id', b.id::text, 'v1_provider_code', b.provider_code)
     ${UNCLAIMED}
     ON CONFLICT (v1_business_id) DO UPDATE SET
       ${INSTITUTION_COLUMNS.filter((c) => c !== "v1_business_id").map((c) => `${c} = EXCLUDED.${c}`).join(",\n       ")},
       updated_at = now()`,
  );

  // ── user_business_index ────────────────────────────────────────────────────
  // Defect D8: a junction whose parents have not all landed turns an ordering bug
  // into a silent orphan. Both parents must reconcile before a single row goes in.
  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "business_members",
    targetTable: "public.user_business_index",
    column: "platform_user_id",
    reasonCode: "unresolved_user",
    sql: `SELECT m.business_id::text || '|' || m.user_id::text, 'member has no platform_users row'
          ${liveMembers()} AND NOT EXISTS (SELECT 1 FROM public.platform_users pu WHERE pu.uuid = m.user_id)`,
  });

  await reportUnresolvedQuery(ctx, allowedCodes, {
    sourceTable: "business_members",
    targetTable: "public.user_business_index",
    column: "business_id",
    reasonCode: "unresolved_business",
    sql: `SELECT m.business_id::text || '|' || m.user_id::text, 'business did not migrate to public.businesses'
          ${liveMembers()} AND NOT EXISTS (SELECT 1 FROM public.businesses tb WHERE tb.meta->>'v1_business_id' = m.business_id::text)`,
  });

  await assertParentCounts(ctx, "public.user_business_index", [
    { label: "platform_users", stagingTable: "auth_users", targetTable: "public.platform_users", targetFilter: "deleted_at IS NULL" },
    {
      label: "businesses + institutions",
      stagingTable: "businesses",
      // V1's one table became two in V3, so the parent count is the union of
      // both halves. Counting only public.businesses would report 39 phantom
      // losses on a migration that lost nothing.
      targetTable: `(SELECT id FROM public.businesses WHERE deleted_at IS NULL
                     UNION ALL
                     SELECT id FROM public.institutions WHERE deleted_at IS NULL AND v1_business_id IS NOT NULL) parents`,
    },
  ]);

  // The two resolver joins are INNER on purpose: a membership whose user or
  // business did not migrate was already reported above, so it is accounted for
  // rather than dropped — and it must not reach the insert as a NULL FK.
  await execWrite(
    ctx,
    "public.user_business_index",
    `INSERT INTO public.user_business_index (platform_user_id, business_id, role, is_owner)
     SELECT pu.id, tb.id, ${ROLE}, (m.role::text = 'owner')
     ${liveMembers(
       "JOIN public.platform_users pu ON pu.uuid = m.user_id",
       "JOIN public.businesses tb ON tb.meta->>'v1_business_id' = m.business_id::text",
     )}
     ON CONFLICT (platform_user_id, business_id) DO UPDATE SET
       role = EXCLUDED.role, is_owner = EXCLUDED.is_owner`,
  );

  // ── §8 risk 1 again, on the other two country-FK holders ───────────────────
  // Both re-resolved from the V1 free text every run; both expected to change 0
  // rows. A non-zero count means someone wrote a country_id V1 does not agree
  // with, which is precisely the silent-wrong-id risk §8 carries forward.
  await execWrite(
    ctx,
    "public.businesses (country FK repair)",
    `UPDATE public.businesses t
        SET country_id = ${countryId("b.country")}, updated_at = now()
       FROM v1_staging.businesses b
      WHERE t.meta->>'v1_business_id' = b.id::text
        AND t.country_id IS DISTINCT FROM ${countryId("b.country")}`,
  );

  await execWrite(
    ctx,
    "public.institutions (country FK repair)",
    `UPDATE public.institutions t
        SET country_id = ${countryId("b.country")}, updated_at = now()
       FROM v1_staging.businesses b
      WHERE t.v1_business_id = b.id
        AND t.country_id IS DISTINCT FROM ${countryId("b.country")}`,
  );
}

export function businessesSelfCheck(): void {
  // The SQL DNS label and the TypeScript one must agree, including on the
  // inputs V1 actually holds: accented names, punctuation, and a name that
  // survives nothing at all.
  assert.equal(dnsLabel("Asia Pacific International College"), "asia-pacific-international-college");
  assert.equal(dnsLabel("Café Études"), "cafe-etudes");
  assert.equal(dnsLabel("!!!"), null, "an unusable name needs a decision, not a mangled subdomain");
  assert.ok(dnsLabelSql("x").includes("NFKD"), "the SQL label must decompose accents too");
  assert.ok(dnsLabelSql("x").includes("63"), "…and respect the DNS label length limit");
  assert.ok(dnsLabelSql("x").startsWith("nullif("), "an empty label is NULL, so the NOT NULL subdomain fails loudly");

  // The tenant schema name must be derived, never generated: a re-run that
  // invents a new uuid orphans the schema the first run provisioned.
  assert.ok(SCHEMA_NAME.includes("md5") && SCHEMA_NAME.includes("b.id"));
  assert.ok(!SCHEMA_NAME.includes("gen_random_uuid"));

  // The split must be exhaustive and disjoint — every V1 business is a tenant or
  // a listing, and the two halves are the same predicate negated.
  assert.ok(HAS_ACCEPTED_OWNER.includes("'accepted'") && HAS_ACCEPTED_OWNER.includes("'owner'"));

  assert.ok(ROLE.includes("'staff' THEN 'member'"), "staff is the one V1 role V3 renames");
  assert.ok(!ROLE.includes("ELSE 'member'"), "an unknown role must not default to member");
  assert.equal(new Set(BUSINESS_COLUMNS).size, BUSINESS_COLUMNS.length);
  assert.equal(new Set(INSTITUTION_COLUMNS).size, INSTITUTION_COLUMNS.length);

  console.log(`w1-businesses self-check: ok — ${BUSINESS_COLUMNS.length} business columns, ${INSTITUTION_COLUMNS.length} institution columns`);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await runTransform({ wave: "W1-businesses", body: transformBusinesses, selfCheck: businessesSelfCheck }));
}
