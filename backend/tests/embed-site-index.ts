/**
 * An institution's widget must be able to read its OWN crawled website and nothing else,
 * and its private site index must never surface in the platform-wide counsellor. Both
 * directions are enforced by superadmin.match_ai_knowledge_chunks, so both get asserted.
 * Run: node --import tsx tests/embed-site-index.ts
 */
import "dotenv/config";
import * as knowledge from "../src/modules/ai-counsellor/repositories/knowledge.repository.js";
import { ensureOwnerSiteIndex } from "../src/modules/ai-counsellor/services/site-index.service.js";
import { masterKnex } from "../src/core/db/master-pool.js";

let failed = 0;
function assert(ok: boolean, label: string) {
  if (ok) return;
  failed++;
  console.error(`FAIL: ${label}`);
}

async function main() {
  // ── No-DB guards: a site index is institution-only and needs a usable website ──
  assert(
    (await ensureOwnerSiteIndex({ kind: "business", id: 9 }, "https://example.edu")) === null,
    "a business owner gets no site index (its business_id column is the wrong type)",
  );
  assert(
    (await ensureOwnerSiteIndex({ kind: "institution", id: 51 }, null)) === null,
    "an institution with no website on file gets no site index",
  );
  assert(
    (await ensureOwnerSiteIndex({ kind: "institution", id: 51 }, "not a url")) === null,
    "an unparseable website is skipped, not crawled",
  );

  // SSRF: whatever lands in the website field is fetched by the SERVER and then served
  // back to this same institution through its widget, so a private target would be
  // credential exfiltration, not a blind request. institution-profile.schema.ts has no
  // .url() on the field, so these are reachable by any authenticated institution member.
  for (const target of [
    "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
    "http://metadata.google.internal/computeMetadata/v1/",
    "http://localhost:6379",
    "http://127.0.0.1/admin",
    "http://10.0.0.5/",
    "file:///etc/passwd",
  ]) {
    assert(
      (await ensureOwnerSiteIndex({ kind: "institution", id: 51 }, target)) === null,
      `refuses to index ${target}`,
    );
  }

  // ── Retrieval isolation, once migration 20260909_003 is applied ──
  const [{ applied }] = (await masterKnex.raw(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'superadmin' AND table_name = 'ai_knowledge_sources'
        AND column_name = 'institution_id'
    ) AS applied
  `)).rows;

  if (!applied) {
    console.log("SKIP retrieval checks — migration 20260909_003 not applied yet");
  } else {
    const owned = await masterKnex("superadmin.ai_knowledge_sources")
      .whereNotNull("institution_id")
      .select("institution_id")
      .first();

    if (!owned) {
      console.log("SKIP retrieval checks — no institution has a site index yet");
    } else {
      const chunk = await masterKnex("superadmin.ai_knowledge_chunks")
        .whereNotNull("embedding")
        .select("embedding")
        .first();
      if (!chunk) {
        console.log("SKIP retrieval checks — no embedded chunks (run: npm run chunk:backfill)");
      } else {
        const vector = JSON.parse(chunk.embedding) as number[];
        const own = await knowledge.matchKnowledgeChunks(vector, 10, null, owned.institution_id);
        const global = await knowledge.matchKnowledgeChunks(vector, 10, null, null);

        const ownDocs = new Set(own.map((h) => h.document_id));
        assert(
          global.every((h) => !ownDocs.has(h.document_id)),
          "the global counsellor never returns an institution's private site pages",
        );
        // A different institution id must see none of them either.
        const other = await knowledge.matchKnowledgeChunks(vector, 10, null, owned.institution_id + 100000);
        assert(other.length === 0, "an unrelated institution id matches no site pages");
      }
    }
  }

  console.log(failed === 0 ? "PASS — institution site indexes are read only by their own widget" : `${failed} failure(s)`);
  await masterKnex.destroy();
  process.exit(failed === 0 ? 0 : 1);
}

main();
