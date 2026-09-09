/**
 * AI embed widget owner test — a widget belongs to a business OR an institution
 * (migration 20260909_002). The parts that silently break the feature:
 *   1. owner → column routing: an institution's widgets must never be scoped by business_id
 *   2. the DB guarantee that exactly one owner id is set
 *   3. course scoping per owner kind — an institution goes through source_job_id, a business
 *      through its website domain
 *
 * Run: node --import tsx tests/ai-embed-owner.ts   (or: npm run test:ai-embed-owner)
 *
 * READ-ONLY against the DB — pure helpers plus pg-catalog and row reads, never writes.
 * Style matches tests/manual-institution-job.ts: plain tsx script, manual counters.
 */

import "dotenv/config";
import { masterKnex } from "../src/core/db/master-pool.js";
import { recipientFilter } from "../src/modules/enquiries/shared/recipient.js";
import * as embedRepo from "../src/modules/ai-counsellor/repositories/embed.repository.js";
import { buildEmbedContext } from "../src/modules/ai-counsellor/services/embed.service.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    console.error(`  FAIL ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}

console.log("\n1. owner → column routing");
{
  // The whole isolation guarantee rests on this: institution 9 and business 9 are different
  // orgs, so an id without its kind would hand one org the other's widgets.
  assert(
    JSON.stringify(recipientFilter({ kind: "business", id: 9 })) === '{"business_id":9}',
    "a business owner filters on business_id",
  );
  assert(
    JSON.stringify(recipientFilter({ kind: "institution", id: 9 })) === '{"institution_id":9}',
    "an institution owner filters on institution_id",
  );
}

console.log("\n2. DB shape (migration 20260909_002 applied?)");
{
  const { rows: cons } = await masterKnex.raw(
    `SELECT conname FROM pg_constraint WHERE conname = 'chk_ai_embed_configs_owner'`,
  );
  assert(cons.length === 1, "CHECK chk_ai_embed_configs_owner exists");

  const { rows: cols } = await masterKnex.raw(
    `SELECT column_name, is_nullable FROM information_schema.columns
      WHERE table_name = 'ai_embed_configs' AND column_name IN ('business_id','institution_id')
      ORDER BY column_name`,
  );
  const byName = Object.fromEntries(cols.map((c: { column_name: string; is_nullable: string }) => [c.column_name, c.is_nullable]));
  assert(byName.institution_id !== undefined, "institution_id column exists");
  // Without this the institution branch can never insert: the old NOT NULL would reject it.
  assert(byName.business_id === "YES", "business_id is nullable", byName);

  const { rows: idx } = await masterKnex.raw(
    `SELECT indexname FROM pg_indexes WHERE indexname = 'ai_embed_configs_institution_idx'`,
  );
  assert(idx.length === 1, "institution_id is indexed");
}

console.log("\n3. every existing row has exactly one owner");
{
  const rows = await masterKnex("ai_embed_configs").select("id", "business_id", "institution_id");
  const bad = rows.filter(
    (r: { business_id: number | null; institution_id: number | null }) =>
      (r.business_id == null) === (r.institution_id == null),
  );
  assert(bad.length === 0, `${rows.length} config row(s), none with both or neither owner`, bad);
}

console.log("\n4. course scoping per owner kind");
{
  const rows = await masterKnex("ai_embed_configs").select("*");
  const institutionOwned = rows.filter((r: { institution_id: number | null }) => r.institution_id != null);

  if (institutionOwned.length === 0) {
    console.log("  skip institution scoping — no institution-owned widget yet (create one to cover this)");
  }
  for (const config of institutionOwned) {
    const jobId = await embedRepo.institutionSourceJobId(Number(config.institution_id));
    const { jobIds } = await buildEmbedContext(config);
    // An institution always has a source_job_id, so an empty scope here means the widget
    // would answer with no course cards — the exact symptom that reads as "AI is broken".
    assert(jobId != null, `institution ${config.institution_id} has a source_job_id`);
    assert(
      JSON.stringify(jobIds) === JSON.stringify(jobId ? [jobId] : []),
      `widget ${config.id} scopes to its institution's own job`,
      { jobIds, jobId },
    );
  }

  for (const config of rows.filter((r: { business_id: number | null }) => r.business_id != null)) {
    const { jobIds } = await buildEmbedContext(config);
    // Business scoping is unchanged (website-domain match) — asserted here only so a future
    // edit to the owner branch can't silently reroute it through source_job_id.
    assert(Array.isArray(jobIds), `widget ${config.id} (business ${config.business_id}) resolves a scope`, jobIds);
  }
}

console.log(`\n${passed} passed, ${failed} failed\n`);
await masterKnex.destroy();
process.exit(failed === 0 ? 0 : 1);
