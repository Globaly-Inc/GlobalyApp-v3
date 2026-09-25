import { masterKnex } from "../../../../../core/db/master-pool.js";

const TABLE = "superadmin.blog_generation_jobs";

export type GenerationJobStatus = "pending" | "running" | "done" | "failed";

export interface GenerationJobRow {
  id: number;
  status: GenerationJobStatus;
  keywords: string[];
  context: string | null;
  topic: string | null;
  country: string | null;
  blog_post_id: number | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface GenerationJobStatusRow {
  id: number;
  status: GenerationJobStatus;
  error: string | null;
  blog_post_id: number | null;
}

export interface NewGenerationJob {
  keywords: string[];
  context: string | null;
  topic: string | null;
  country: string | null;
}

export async function createJobs(jobs: NewGenerationJob[]): Promise<GenerationJobRow[]> {
  // pg serializes a plain JS array as a Postgres array literal, not JSON — stringify
  // explicitly for the jsonb column (same fix posts.repository.ts applies to `tags`).
  return masterKnex(TABLE)
    .insert(jobs.map((j) => ({ ...j, keywords: JSON.stringify(j.keywords) })))
    .returning("*");
}

/**
 * Atomically flips one job from pending -> running. The WHERE clause IS the
 * atomicity: a single UPDATE is one statement, so two concurrent claims on the
 * same id serialize at the row lock — only the first sees status = 'pending' and
 * wins; the second's WHERE no longer matches and it gets back no row. Guards
 * against a job being double-processed by concurrent workers or a redelivered
 * queue message.
 */
export async function claimJob(id: number): Promise<GenerationJobRow | undefined> {
  const [row] = await masterKnex(TABLE)
    .where({ id, status: "pending" })
    .update({ status: "running", updated_at: masterKnex.fn.now() })
    .returning("*");
  return row;
}

/** Sweep: atomically claim the oldest pending job (SKIP LOCKED — safe under concurrent sweepers). */
export async function claimNextPending(): Promise<GenerationJobRow | undefined> {
  const [row] = await masterKnex(TABLE)
    .whereIn(
      "id",
      masterKnex(TABLE).select("id").where({ status: "pending" }).orderBy("id").limit(1).forUpdate().skipLocked(),
    )
    .update({ status: "running", updated_at: masterKnex.fn.now() })
    .returning("*");
  return row;
}

export async function findJobsByIds(ids: number[]): Promise<GenerationJobStatusRow[]> {
  if (ids.length === 0) return [];
  return masterKnex(TABLE).whereIn("id", ids).select("id", "status", "error", "blog_post_id");
}

/** `coverNote` (e.g. "cover: HIGGSFIELD_API_KEY not set") lands in `error` even on a
 * successful job — the column is the one place the progress panel reads notes from,
 * and a cover miss is exactly the kind of thing an editor should see before publishing. */
export async function markDone(id: number, blogPostId: number, coverNote: string | null): Promise<void> {
  await masterKnex(TABLE)
    .where({ id })
    .update({ status: "done", blog_post_id: blogPostId, error: coverNote, updated_at: masterKnex.fn.now() });
}

export async function markFailed(id: number, error: string): Promise<void> {
  await masterKnex(TABLE).where({ id }).update({ status: "failed", error, updated_at: masterKnex.fn.now() });
}
