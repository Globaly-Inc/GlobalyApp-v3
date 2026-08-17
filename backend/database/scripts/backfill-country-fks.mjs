// Repairs country FKs that were written as NULL because V3 only had 24 countries.
//
//   node database/scripts/backfill-country-fks.mjs               # dry run (default)
//   node database/scripts/backfill-country-fks.mjs --apply       # write
//   node database/scripts/backfill-country-fks.mjs --self-check  # pure-fn asserts
//
// import-v1-users.mjs and import-v1-businesses.ts resolve free-text country
// values through buildCountryResolver(), which returns null for anything not
// seeded. Against a 24-country V3 that silently NULLed every FK derived from an
// unmatched name. Run import-v1-geo.mjs first, then this: it re-reads the V1
// source values, re-resolves them against the full country table and writes the
// ones that now resolve.
//
// Idempotent: re-resolving the same source values produces the same ids, so a
// second run reports zero changes.

import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

import { buildCountryResolver } from "./recon-v2-users.mjs";
import { parseArgs, printList, withMigration } from "./migrate-lib.mjs";

// V1 profile column -> V3 platform_user_profiles column.
const PROFILE_FIELDS = [
  ["nationality", "nationality_id"],
  ["country_of_residence", "country_of_residence_id"],
  ["personal_address_country", "personal_address_country_id"],
];

// ── Pure helpers (covered by --self-check) ──────────────────────────────────

/**
 * Decide what to do with one field. Only a NULL-to-value repair or a genuine
 * correction counts as a change; re-running must produce "unchanged" everywhere.
 */
export function planFix(currentId, resolvedId, sourceValue) {
  const hasSource = typeof sourceValue === "string" && sourceValue.trim() !== "";
  // Nothing in V1 to resolve — a NULL here is data absence, not the seeding bug.
  if (!hasSource) return { action: "unchanged", reason: "no source value" };
  if (resolvedId === null) return { action: "unresolved" };
  if (currentId === resolvedId) return { action: "unchanged" };
  return { action: currentId === null ? "repaired" : "corrected", to: resolvedId };
}

// ── Counts ──────────────────────────────────────────────────────────────────

async function nullCounts(v3) {
  const { rows } = await v3.query(
    `SELECT
       (SELECT count(*)::int FROM public.platform_user_profiles WHERE nationality_id IS NULL)              AS nationality_id,
       (SELECT count(*)::int FROM public.platform_user_profiles WHERE country_of_residence_id IS NULL)     AS country_of_residence_id,
       (SELECT count(*)::int FROM public.platform_user_profiles WHERE personal_address_country_id IS NULL) AS personal_address_country_id,
       (SELECT count(*)::int FROM public.businesses WHERE country_id IS NULL)                              AS businesses_country_id`,
  );
  return rows[0];
}

// ── Backfill ────────────────────────────────────────────────────────────────

async function backfillProfiles(v1, v3, resolve, report) {
  const { rows: source } = await v1.query(
    `SELECT user_id::text AS uuid, nationality, country_of_residence, personal_address_country
       FROM public.profiles WHERE user_id IS NOT NULL`,
  );
  const { rows: current } = await v3.query(
    `SELECT p.user_id, u.uuid, u.email, p.nationality_id, p.country_of_residence_id,
            p.personal_address_country_id
       FROM public.platform_user_profiles p
       JOIN public.platform_users u ON u.id = p.user_id`,
  );
  const byUuid = new Map(current.map((r) => [r.uuid, r]));

  for (const row of source) {
    const target = byUuid.get(row.uuid);
    if (!target) {
      report.profilesNotInV3++;
      continue;
    }
    for (const [v1Column, v3Column] of PROFILE_FIELDS) {
      const value = row[v1Column];
      const fix = planFix(target[v3Column] ?? null, resolve(value), value);
      if (fix.action === "unresolved") {
        report.unresolved.push({ email: target.email, field: v3Column, value });
        continue;
      }
      if (fix.action === "unchanged") continue;
      await v3.query(
        `UPDATE public.platform_user_profiles SET ${v3Column} = $1, updated_at = now() WHERE user_id = $2`,
        [fix.to, target.user_id],
      );
      report[fix.action].push({ email: target.email, field: v3Column, value, id: fix.to });
    }
  }
}

async function backfillBusinesses(v1, v3, resolve, report) {
  const { rows: source } = await v1.query(`SELECT id::text AS uuid, name, country FROM public.businesses`);
  const countryByUuid = new Map(source.map((r) => [r.uuid, r.country]));

  const { rows: current } = await v3.query(
    `SELECT id, business_name, country_id, meta->>'v1_business_id' AS v1_id FROM public.businesses`,
  );

  for (const biz of current) {
    if (!biz.v1_id) {
      report.businessesWithoutV1Id.push(biz.business_name);
      continue;
    }
    const value = countryByUuid.get(biz.v1_id) ?? null;
    const fix = planFix(biz.country_id ?? null, resolve(value), value);
    if (fix.action === "unresolved") {
      report.unresolved.push({ email: biz.business_name, field: "businesses.country_id", value });
      continue;
    }
    if (fix.action === "unchanged") continue;
    await v3.query(`UPDATE public.businesses SET country_id = $1, updated_at = now() WHERE id = $2`, [fix.to, biz.id]);
    report[fix.action].push({ email: biz.business_name, field: "businesses.country_id", value, id: fix.to });
  }
}

// ── Self-check ──────────────────────────────────────────────────────────────

function selfCheck() {
  assert.equal(planFix(null, 5, "Nepal").action, "repaired");
  assert.equal(planFix(null, 5, "Nepal").to, 5);
  assert.equal(planFix(5, 5, "Nepal").action, "unchanged"); // second run
  assert.equal(planFix(4, 5, "Nepal").action, "corrected");
  assert.equal(planFix(null, null, "Atlantis").action, "unresolved");
  // A source value that was never set is not a repair opportunity.
  assert.equal(planFix(null, null, null).action, "unchanged");
  assert.equal(planFix(null, null, "   ").action, "unchanged");

  const resolve = buildCountryResolver([{ id: 1, name: "Croatia", iso2: "HR", iso3: "HRV" }]);
  assert.equal(planFix(null, resolve("HR"), "HR").to, 1);

  console.log("self-check: all assertions passed");
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.selfCheck) return selfCheck();

  const report = {
    repaired: [],
    corrected: [],
    unresolved: [],
    profilesNotInV3: 0,
    businessesWithoutV1Id: [],
  };

  await withMigration({ apply: args.apply, label: "country FK backfill" }, async (v1, v3) => {
    const { rows: countries } = await v3.query(`SELECT id, name, iso2, iso3 FROM public.countries`);
    const resolve = buildCountryResolver(countries);
    console.log(`countries available to the resolver: ${countries.length}`);

    report.before = await nullCounts(v3);
    await backfillProfiles(v1, v3, resolve, report);
    await backfillBusinesses(v1, v3, resolve, report);
    report.after = await nullCounts(v3);
  });

  if (report.before && report.after) {
    console.log("\nNULL counts (before -> after):");
    for (const key of Object.keys(report.before)) {
      console.log(`  ${key.padEnd(30)} ${report.before[key]} -> ${report.after[key]}`);
    }
  }
  console.log(`\nrepaired (NULL -> id):  ${report.repaired.length}`);
  console.log(`corrected (wrong id):   ${report.corrected.length}`);
  if (report.profilesNotInV3) console.log(`V1 profiles with no V3 user: ${report.profilesNotInV3}`);

  printList("repaired", report.repaired, (r) => `${r.email} ${r.field} "${r.value}" -> ${r.id}`);
  printList("corrected", report.corrected, (r) => `${r.email} ${r.field} "${r.value}" -> ${r.id}`);
  printList("STILL UNRESOLVED (left NULL)", report.unresolved, (r) => `${r.email} ${r.field} = "${r.value}"`);
  printList("businesses with no v1_business_id in meta", report.businessesWithoutV1Id, (n) => n);

  if (args.json) console.log(JSON.stringify(report, null, 2));
}

// Only run when invoked directly — the tests import the pure helpers above.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
