/**
 * findRepresentingBusinesses tests — the query that replaced the match directory.
 * Run: node --import tsx tests/enquiries/business-representations.ts
 *
 * Covers:
 *  1. A live link returns the business with the attributes the ranker needs, mapped off
 *     `businesses`/`countries` rather than a synced projection row.
 *  2-6. Every gate: representation status, soft-delete, validity window, business suspension,
 *     enquiry_enabled.
 *  7. Exactly one row per business — the UNIQUE on the table is what makes the old
 *     "one candidate per directory row" slot-hogging bug impossible.
 *  8. A link targeting a DIFFERENT institution is not returned (target_id is really scoped).
 */

import { masterKnex } from "../../src/core/db/master-pool.js";
import { findRepresentingBusinesses } from "../../src/modules/enquiries/repositories/representations.repository.js";

let passed = 0;
let failed = 0;

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

async function getCountryId(iso2: string): Promise<number> {
  const row = await masterKnex("countries").where({ iso2 }).first("id");
  if (row) return row.id;
  const [inserted] = await masterKnex("countries")
    .insert({ name: `Test-${iso2}-${Date.now()}`, iso2, iso3: `${iso2}X`, is_active: true })
    .returning("id");
  return inserted.id;
}

const suffix = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function makeInstitution(): Promise<number> {
  const s = suffix();
  const [row] = await masterKnex("institutions")
    .insert({
      institution_name: `BR Test Institution ${s}`,
      subdomain: `br-test-inst-${s}`,
      email: `br-test-${s}@example.com`,
      status: "pending",
      claim_status: "unclaimed",
    })
    .returning("id");
  return row.id;
}

/** A business that is otherwise perfectly matchable: verified, AU, with coordinates. */
async function makeBusiness(over: Record<string, unknown> = {}): Promise<number> {
  const owner = await masterKnex("platform_users").orderBy("id").first();
  if (!owner) throw new Error("no platform_users row available to own the test business");
  const s = suffix();
  const [row] = await masterKnex("businesses")
    .insert({
      owner_id: owner.id,
      subdomain: `br-test-${s}`,
      business_name: `BR Test Biz ${s}`,
      account_status: 1,
      country_id: await getCountryId("AU"),
      status: "verified",
      enquiry_enabled: true,
      latitude: -33.87,
      longitude: 151.21,
      ...over,
    })
    .returning("id");
  return row.id;
}

async function link(businessId: number, institutionId: number, over: Record<string, unknown> = {}): Promise<string> {
  const [row] = await masterKnex("business_representations")
    .insert({
      originator_id: businessId,
      originator_type: "business",
      target_id: institutionId,
      target_type: "institution",
      status: "active",
      ...over,
    })
    .returning("uuid");
  return row.uuid;
}

async function cleanup(businessIds: number[], institutionIds: number[]) {
  if (businessIds.length) {
    await masterKnex("business_representations")
      .whereIn("originator_id", businessIds)
      .where("originator_type", "business")
      .delete();
    await masterKnex("businesses").whereIn("id", businessIds).delete();
  }
  if (institutionIds.length) {
    await masterKnex("business_representations")
      .whereIn("target_id", institutionIds)
      .where("target_type", "institution")
      .delete();
    await masterKnex("institutions").whereIn("id", institutionIds).delete();
  }
}

/** Seed one business + one link with `over` applied, then report whether it came back. */
async function isEligible(
  businessOver: Record<string, unknown>,
  linkOver: Record<string, unknown>,
): Promise<boolean> {
  const institutionId = await makeInstitution();
  const businessId = await makeBusiness(businessOver);
  try {
    await link(businessId, institutionId, linkOver);
    const rows = await findRepresentingBusinesses(institutionId);
    return rows.some((r) => r.business_id === businessId);
  } finally {
    await cleanup([businessId], [institutionId]);
  }
}

async function main() {
  console.log("business_representations lookup tests\n");

  await assert("a live link returns the business with its ranking attributes", async () => {
    const institutionId = await makeInstitution();
    const businessId = await makeBusiness();
    try {
      const representationId = await link(businessId, institutionId);
      const rows = await findRepresentingBusinesses(institutionId);
      eq(rows.length, 1, "one candidate");
      eq(rows[0].business_id, businessId, "business_id");
      eq(rows[0].representation_id, representationId, "representation_id is the business_representations uuid");
      eq(rows[0].country_code, "AU", "country_code comes from countries.iso2, uppercased");
      eq(rows[0].verification_status, "verified", "verification_status derived from businesses.status");
      eq(Number(rows[0].latitude), -33.87, "latitude");
    } finally {
      await cleanup([businessId], [institutionId]);
    }
  });

  await assert("a business with a non-'verified' status is reported unverified, not dropped", async () => {
    const institutionId = await makeInstitution();
    const businessId = await makeBusiness({ status: "pending" });
    try {
      await link(businessId, institutionId);
      const rows = await findRepresentingBusinesses(institutionId);
      eq(rows.length, 1, "still a candidate");
      eq(rows[0].verification_status, "unverified");
    } finally {
      await cleanup([businessId], [institutionId]);
    }
  });

  await assert("a business with no country_id yields a null country_code", async () => {
    const institutionId = await makeInstitution();
    const businessId = await makeBusiness({ country_id: null });
    try {
      await link(businessId, institutionId);
      const rows = await findRepresentingBusinesses(institutionId);
      eq(rows[0].country_code, null, "null, so the hard country gate in rankCandidates rejects it");
    } finally {
      await cleanup([businessId], [institutionId]);
    }
  });

  const gates: [string, Record<string, unknown>, Record<string, unknown>][] = [
    ["an inactive representation is excluded", {}, { status: "inactive" }],
    ["a soft-deleted representation is excluded", {}, { deleted_at: new Date() }],
    ["a representation past its valid_until is excluded", {}, { valid_until: "2020-01-01" }],
    ["a representation not yet at its valid_from is excluded", {}, { valid_from: "2999-01-01" }],
    ["a suspended business is excluded", { status: "suspended" }, {}],
    ["a business with enquiry_enabled = false is excluded", { enquiry_enabled: false }, {}],
    ["a soft-deleted business is excluded", { deleted_at: new Date() }, {}],
  ];
  for (const [name, businessOver, linkOver] of gates) {
    await assert(name, async () => {
      eq(await isEligible(businessOver, linkOver), false);
    });
  }

  await assert("an open-ended window (both dates null) is eligible", async () => {
    eq(await isEligible({}, { valid_from: null, valid_until: null }), true);
  });

  await assert("a window that is currently open is eligible", async () => {
    eq(await isEligible({}, { valid_from: "2020-01-01", valid_until: "2999-01-01" }), true);
  });

  await assert("exactly one row per business, however many institutions it represents", async () => {
    const institutionA = await makeInstitution();
    const institutionB = await makeInstitution();
    const businessId = await makeBusiness();
    try {
      await link(businessId, institutionA);
      await link(businessId, institutionB);
      const rows = await findRepresentingBusinesses(institutionA);
      eq(rows.length, 1, "the other institution's link must not duplicate the candidate");
    } finally {
      await cleanup([businessId], [institutionA, institutionB]);
    }
  });

  await assert("a link to a different institution is not returned", async () => {
    const mine = await makeInstitution();
    const theirs = await makeInstitution();
    const businessId = await makeBusiness();
    try {
      await link(businessId, theirs);
      const rows = await findRepresentingBusinesses(mine);
      eq(rows.length, 0);
    } finally {
      await cleanup([businessId], [mine, theirs]);
    }
  });

  await assert("a business->business link is never an enquiry candidate", async () => {
    // target_id spaces collide across institutions and businesses, so target_type is the only
    // thing keeping a partner consultancy out of an institution's candidate pool.
    const institutionId = await makeInstitution();
    const businessId = await makeBusiness();
    try {
      await masterKnex("business_representations").insert({
        originator_id: businessId,
        originator_type: "business",
        target_id: institutionId,
        target_type: "business",
        status: "active",
      });
      const rows = await findRepresentingBusinesses(institutionId);
      eq(rows.length, 0);
    } finally {
      await cleanup([businessId], [institutionId]);
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  await masterKnex.destroy();
  process.exit(failed > 0 ? 1 : 0);
}

main();
