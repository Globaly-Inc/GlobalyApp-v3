// Spreadsheet institution import — duplicate-name check + job creation. Staging itself runs in
// workers/extraction-spreadsheet.worker.ts so a large sheet never holds the request open.

import { masterKnex } from "../../../../core/db/master-pool.js";
import { queueService } from "../../../../shared/queue/queueService.js";
import { ConflictError } from "../../../../shared/errors.js";
import { logAudit } from "../shared/audit.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import { EXTRACTION_QUEUES } from "../shared/queues.js";
import { SPREADSHEET_SYNTHETIC_URL_PREFIX } from "../lib/spreadsheet-mappers.js";
import { findCategoryIdBySlug } from "../repositories/promote.repository.js";
import type { SpreadsheetImportInput } from "../schemas/spreadsheet-import.schema.js";

const key = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");
/** SQL twin of `key` — both sides of the comparison must normalise identically. */
const NORMALISED_NAME = "lower(regexp_replace(trim(institution_name), '\\s+', ' ', 'g'))";

/** A failed spreadsheet import — partial rows, can't be rerun. Its name stays free for a retry. */
const failedSpreadsheetJob = (q: any) => q.where({ source_type: "spreadsheet", status: "failed" });

/**
 * Which of these names already exist as an extraction job or a platform institution. The import
 * never merges into an existing one — the wizard shows these and asks for a rename (or a skip).
 * A FAILED spreadsheet import doesn't count: startImport replaces it.
 */
export async function findExistingNames(names: string[]): Promise<string[]> {
  const wanted = [...new Set(names.map(key))];
  const [jobs, institutions] = await Promise.all([
    masterKnex(`${S}.extraction_jobs`).whereRaw(`${NORMALISED_NAME} = any(?)`, [wanted])
      .whereNot((q) => failedSpreadsheetJob(q)).pluck("institution_name"),
    masterKnex("institutions").whereNull("deleted_at").whereRaw(`${NORMALISED_NAME} = any(?)`, [wanted]).pluck("institution_name"),
  ]);
  const taken = new Set([...jobs, ...institutions].map((n: string) => key(n)));
  return names.filter((n) => taken.has(key(n)));
}

export async function startImport(input: SpreadsheetImportInput, adminId: number) {
  const name = input.institution.name.trim();
  // Re-checked here, not trusted from the wizard: two tabs (or two admins) with one name race.
  if ((await findExistingNames([name])).length) {
    throw new ConflictError(`"${name}" already exists — rename it in the sheet or skip it`);
  }
  // Retrying after a failed import: drop the failed partial job first (its staged rows cascade),
  // otherwise its half-written courses and extras would sit beside the new job under one name.
  const replaced: string[] = await failedSpreadsheetJob(masterKnex(`${S}.extraction_jobs`))
    .whereRaw(`${NORMALISED_NAME} = ?`, [key(name)]).delete().returning("id").then((r: { id: string }[]) => r.map((x) => x.id));

  const slug = key(name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const website = input.institution.website || `${SPREADSHEET_SYNTHETIC_URL_PREFIX}${slug}`;
  const [job] = await masterKnex(`${S}.extraction_jobs`)
    .insert({
      institution_name: name,
      institution_url: website,
      status: "processing",
      source_type: "spreadsheet",
      aggregator_name: "Spreadsheet",
      // A sheet only ever holds institutions; without a category promotion refuses the job.
      business_category_id: await findCategoryIdBySlug("institutions"),
      created_by_platform_user_id: adminId,
      pipeline_progress: JSON.stringify({ phase: "queued", current: 0, total: input.rows.length }),
      processing_heartbeat_at: masterKnex.fn.now(),
    })
    .returning("id");
  const jobId = job.id as string;

  try {
    await queueService.publish(EXTRACTION_QUEUES.SPREADSHEET, { jobId, website, input });
  } catch (err) {
    // Otherwise the job sits "processing" forever with nothing ever consuming it.
    await masterKnex(`${S}.extraction_jobs`).where({ id: jobId })
      .update({ status: "failed", error_message: "Failed to queue import for processing" });
    throw err;
  }

  await logAudit(adminId, "SPREADSHEET_IMPORT_DISPATCH", {
    entityType: "extraction_jobs", entityId: jobId, details: { name, rows: input.rows.length, replaced_failed_jobs: replaced },
  });
  return { job_id: jobId };
}
