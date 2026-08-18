// Job Context Bundle storage.
//
// One row in superadmin.extraction_additional_info per job, keyed CONTEXT_BUNDLE_KEY —
// the same table and the same one-row-per-blob shape V1 uses for site_intelligence.
// See lib/context-bundle.ts for why this is not pipeline_progress.

import { masterKnex } from "../../../../core/db/master-pool.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import { CONTEXT_BUNDLE_KEY, parseBundle, type ContextBundle } from "../lib/context-bundle.js";

/**
 * Upsert on (job_id, key) by delete-then-insert in one transaction: the table has no
 * unique on that pair (it is a general key/value sidecar, and other keys legitimately
 * repeat), so ON CONFLICT has nothing to target. Re-running the step overwrites rather
 * than accumulating, which is what makes a re-delivered queue message a no-op.
 */
export async function saveContextBundle(jobId: string, bundle: ContextBundle | null): Promise<void> {
  await masterKnex.transaction(async (trx) => {
    await trx(`${S}.extraction_additional_info`).where({ job_id: jobId, key: CONTEXT_BUNDLE_KEY }).del();
    if (bundle) {
      await trx(`${S}.extraction_additional_info`).insert({
        job_id: jobId,
        key: CONTEXT_BUNDLE_KEY,
        value: JSON.stringify(bundle),
      });
    }
  });
}

/**
 * Read the bundle back for a downstream prompt. Returns null when there is none, when
 * the row is unparseable, or when it no longer satisfies the schema — a prompt is never
 * worth failing a step over, and contextAddendum(null) is simply an empty string.
 */
export async function loadContextBundle(jobId: string): Promise<ContextBundle | null> {
  const row = await masterKnex(`${S}.extraction_additional_info`)
    .where({ job_id: jobId, key: CONTEXT_BUNDLE_KEY })
    .orderBy("created_at", "desc")
    .first("value");

  if (!row?.value) return null;
  try {
    return parseBundle(JSON.parse(row.value as string));
  } catch {
    return null;
  }
}
