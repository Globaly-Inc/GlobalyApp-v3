/**
 * Index the website of every institution widget that has no site index yet.
 *
 *   npm run site-index:backfill            # widgets with no source row
 *   npm run site-index:backfill -- --dry   # list them, queue nothing
 *
 * ensureOwnerSiteIndex only runs on widget create and activate, so every widget that
 * existed before that feature shipped has an empty Knowledge Rack — and because a widget
 * passes its institution_id to match_ai_knowledge_chunks, an empty private corpus means
 * NO passages at all, not even global ones. The symptom is a widget that answers course
 * questions from structured data and then says "I don't have that on file" to anything
 * that needs the institution's own page prose (entry tests, deadlines, how to apply).
 *
 * Idempotent: ensureOwnerSiteIndex re-queues an existing source rather than duplicating it.
 */

import "dotenv/config";
import { masterKnex } from "../src/core/db/master-pool.js";
import { ownerWebsite } from "../src/modules/ai-counsellor/repositories/embed.repository.js";
import { ensureOwnerSiteIndex } from "../src/modules/ai-counsellor/services/site-index.service.js";

const dry = process.argv.includes("--dry");

async function main() {
  // Institutions only — ensureOwnerSiteIndex returns null for a business owner, since
  // ai_knowledge_sources has no usable business column to scope a site index by.
  const widgets: Array<{ institution_id: number; institution_name: string }> = await masterKnex("ai_embed_configs as c")
    .join("institutions as i", "i.id", "c.institution_id")
    .whereNotNull("c.institution_id")
    .select("c.institution_id", "i.institution_name")
    .orderBy("c.institution_id");

  console.log(`${widgets.length} institution widget(s)`);
  for (const w of widgets) {
    const owner = { kind: "institution" as const, id: Number(w.institution_id) };
    const website = await ownerWebsite(owner);
    if (!website) {
      console.log(`  skip  ${w.institution_name} (#${owner.id}) — no website on file`);
      continue;
    }
    if (dry) {
      console.log(`  would index  ${w.institution_name} (#${owner.id}) — ${website}`);
      continue;
    }
    const result = await ensureOwnerSiteIndex(owner, website);
    console.log(result
      ? `  ok    ${w.institution_name} (#${owner.id}) — source ${result.sourceId}${result.queued ? " queued" : " NOT queued (is the queue up?)"}`
      : `  skip  ${w.institution_name} (#${owner.id}) — ${website} refused (unsafe or unparseable)`);
  }
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => masterKnex.destroy());
