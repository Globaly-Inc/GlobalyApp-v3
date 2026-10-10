/**
 * How many staged agents are still keyed by a pre-SHA-256 external_id.
 *
 *   npm run agents:legacy-ids            # count, by job
 *   npm run agents:legacy-ids -- --list  # also print the first rows of each kind
 *
 * READ ONLY. It writes nothing and is safe against production.
 *
 * Why it exists: `external_id` is how a re-run of the agents step finds the row it wrote last
 * time, and the switch from SHA-1 to SHA-256 changed every id we synthesise. upsertAgent adopts
 * and re-keys such a row when the caller hands it the legacy id, so the fix is self-healing —
 * but only for sources that still pass one. This is how you check what is left:
 *
 *   - a 40-character hex id is the worker's own fallback, written by the old code;
 *   - an `ao:` id is AscentOne's, and is NOT distinguishable by shape — the old and new forms
 *     are both `ao:` plus 32 hex — so the only way to tell is to recompute both and compare.
 *
 * When every count here is zero, legacyIdentityKey and legacyStableHash can be deleted.
 */

import "dotenv/config";
import { createHash } from "node:crypto";
import { masterKnex } from "../src/core/db/master-pool.js";

const TABLE = "superadmin.extraction_agents";
const list = process.argv.includes("--list");

/** The AscentOne id for a row, under either algorithm. Mirrors agent-sources/ascentone.ts. */
const aoId = (alg: "sha1" | "sha256", name: string | null, country: string | null) =>
  `ao:${createHash(alg)
    .update(`${(name ?? "").toLowerCase().trim()}|${(country ?? "").toLowerCase().trim()}`)
    .digest("hex")
    .slice(0, 32)}`;

async function main() {
  const all: Array<{ id: string; job_id: string; external_id: string | null; name: string | null; country: string | null }> =
    await masterKnex(TABLE).select("id", "job_id", "external_id", "name", "country");

  // A null external_id is a row no re-run can match by id at all — a different problem from this
  // one, and worth seeing rather than crashing on.
  const unkeyed = all.filter((r) => !r.external_id);
  const rows = all.filter((r): r is typeof r & { external_id: string } => !!r.external_id);

  const legacyFallback = rows.filter((r) => /^[0-9a-f]{40}$/.test(r.external_id));
  const ao = rows.filter((r) => r.external_id.startsWith("ao:"));
  const legacyAo = ao.filter((r) => r.external_id === aoId("sha1", r.name, r.country));
  const currentAo = ao.filter((r) => r.external_id === aoId("sha256", r.name, r.country));

  console.log(`rows                     ${all.length}`);
  console.log(`no external_id at all    ${unkeyed.length}   (unmatchable on any re-run; not this change's doing)`);
  console.log(`legacy worker fallback   ${legacyFallback.length}   (40-hex, written by the SHA-1 code)`);
  console.log(`ascentone, legacy key    ${legacyAo.length}   of ${ao.length} ao: rows`);
  console.log(`ascentone, current key   ${currentAo.length}`);
  console.log(`ascentone, neither       ${ao.length - legacyAo.length - currentAo.length}   (name or country edited since)`);

  const byJob = new Map<string, number>();
  for (const r of [...legacyFallback, ...legacyAo]) byJob.set(r.job_id, (byJob.get(r.job_id) ?? 0) + 1);
  if (byJob.size) {
    console.log("\nstill on a legacy key, by job:");
    for (const [job, n] of [...byJob].sort((a, b) => b[1] - a[1])) console.log(`  ${job}  ${n}`);
    console.log("\nRe-running the agents step on these adopts and re-keys them. Nothing else is needed.");
  } else {
    console.log("\nNothing is on a legacy key. The two legacy hash helpers can go.");
  }

  if (list) {
    for (const r of [...legacyFallback.slice(0, 5), ...legacyAo.slice(0, 5)]) {
      console.log(`  ${r.external_id}  ${r.name ?? "—"}  (${r.country ?? "—"})`);
    }
  }
}

main()
  .then(() => masterKnex.destroy())
  .catch(async (err) => {
    console.error(err);
    await masterKnex.destroy();
    process.exit(1);
  });
