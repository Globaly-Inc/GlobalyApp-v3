// Tracks bulk-import jobs so the admin UI can poll progress instead of blocking
// on one long request (see scholarship-import.worker.ts for the consumer side).

import { masterKnex } from "../../../../../core/db/master-pool.js";

const TABLE = "scholarship_import_jobs";

export type ImportRowResult = { title: string; status: "ok" | "error"; detail?: string };

export async function createJob(createdBy: number, totalRows: number) {
  const [row] = await masterKnex(TABLE).insert({ created_by: createdBy, total_rows: totalRows }).returning("*");
  return row;
}

export async function findJob(id: number) {
  return masterKnex(TABLE).where({ id }).first();
}

export async function markProcessing(id: number) {
  return masterKnex(TABLE).where({ id }).update({ status: "processing", updated_at: masterKnex.fn.now() });
}

export async function recordRowResult(id: number, result: ImportRowResult) {
  await masterKnex(TABLE)
    .where({ id })
    .update({
      processed_rows: masterKnex.raw("processed_rows + 1"),
      created_count: masterKnex.raw(result.status === "ok" ? "created_count + 1" : "created_count"),
      error_count: masterKnex.raw(result.status === "error" ? "error_count + 1" : "error_count"),
      results: masterKnex.raw("results || ?::jsonb", [JSON.stringify([result])]),
      updated_at: masterKnex.fn.now(),
    });
}

export async function markCompleted(id: number) {
  return masterKnex(TABLE).where({ id }).update({ status: "completed", updated_at: masterKnex.fn.now() });
}

export async function markFailed(id: number, reason: string) {
  return masterKnex(TABLE).where({ id }).update({ status: "failed", failure_reason: reason, updated_at: masterKnex.fn.now() });
}
