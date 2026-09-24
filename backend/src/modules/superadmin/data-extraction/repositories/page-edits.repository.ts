// superadmin.extraction_page_manual_edits — one job's own correction of a page's content, kept
// apart from extraction_pages (shared by URL across every job) so two jobs never see or overwrite
// each other's edit of a URL they happen to share.

import { masterKnex } from "../../../../core/db/master-pool.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";

const T = `${S}.extraction_page_manual_edits`;

export interface PageManualEdit {
  markdown: string;
  editor_id: number | null;
  updated_at: Date;
}

export async function findManualEdit(jobId: string, url: string): Promise<PageManualEdit | undefined> {
  return masterKnex(T).where({ job_id: jobId, url }).select("markdown", "editor_id", "updated_at").first();
}

export async function findManualEditsForJob(jobId: string): Promise<{ url: string; markdown: string }[]> {
  return masterKnex(T).where({ job_id: jobId }).select("url", "markdown");
}

export async function upsertManualEdit(jobId: string, url: string, markdown: string, editorId: number): Promise<PageManualEdit> {
  const [row] = await masterKnex(T)
    .insert({ job_id: jobId, url, markdown, editor_id: editorId })
    .onConflict(["job_id", "url"])
    .merge({ markdown, editor_id: editorId, updated_at: masterKnex.fn.now() })
    .returning(["markdown", "editor_id", "updated_at"]);
  return row;
}

export async function deleteManualEdit(jobId: string, url: string): Promise<void> {
  await masterKnex(T).where({ job_id: jobId, url }).del();
}
