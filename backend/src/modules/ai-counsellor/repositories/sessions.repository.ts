import { masterKnex } from "../../../core/db/master-pool.js";

/**
 * What the counsellor has learned in conversation, as opposed to what the student
 * filled into a form. Deliberately a small fixed set of keys: an open-ended shape
 * would drift into whatever the model felt like writing that turn, and nothing
 * downstream could read it reliably.
 */
export interface CounsellingContext {
  /** What they want out of it — career or study outcome, in their words. */
  goals?: string[];
  interests?: string[];
  strengths?: string[];
  /** Budget, family, timing, location, anything limiting the options. */
  constraints?: string[];
  preferred_countries?: string[];
  /** Where they are in the journey. Drives how directive the counsellor should be. */
  stage?: "exploring" | "narrowing" | "applying" | "post_offer";
  /** Anything worth carrying that has no home above. */
  notes?: string[];
}

/** Per-key cap: the context is injected into every prompt, so it cannot grow forever. */
const MAX_ITEMS_PER_KEY = 8;

const LIST_KEYS = [
  "goals", "interests", "strengths", "constraints", "preferred_countries", "notes",
] as const satisfies ReadonlyArray<keyof CounsellingContext>;

/**
 * Merge a tool-supplied patch into the stored context.
 *
 * Lists union (case-insensitively deduped, newest last, capped); `stage` overwrites,
 * because a student is in one stage at a time and the latest read wins. Nothing is
 * ever removed by a merge — the model correcting itself replaces the stage, and stale
 * list items age out through the cap rather than by deletion.
 */
export function mergeCounsellingContext(
  current: CounsellingContext | null | undefined,
  patch: CounsellingContext,
): CounsellingContext {
  const merged: CounsellingContext = { ...(current ?? {}) };

  for (const key of LIST_KEYS) {
    const incoming = patch[key];
    if (!incoming?.length) continue;
    const seen = new Set<string>();
    const items: string[] = [];
    for (const raw of [...(merged[key] ?? []), ...incoming]) {
      const value = typeof raw === "string" ? raw.trim() : "";
      if (!value) continue;
      const fingerprint = value.toLowerCase();
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      items.push(value);
    }
    // Keep the most recent when over the cap — later turns are better informed.
    merged[key] = items.slice(-MAX_ITEMS_PER_KEY);
  }

  if (patch.stage) merged.stage = patch.stage;
  return merged;
}

export interface SessionRow {
  id: number;
  platform_user_id: number;
  embed_config_id: number | null;
  title: string | null;
  message_count: number;
  credits_used: number;
  is_archived: boolean;
  counselling_context: CounsellingContext;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

const TABLE = "ai_counselor_sessions";

// The list endpoint renders titles. counselling_context is deliberately absent: it
// grows with the conversation and the sidebar has no use for it.
const LIST_COLUMNS = [
  "id", "platform_user_id", "embed_config_id", "title", "message_count",
  "credits_used", "is_archived", "created_at", "updated_at", "deleted_at",
];

export async function create(userId: number, embedConfigId?: number): Promise<SessionRow> {
  const [row] = await masterKnex(TABLE)
    .insert({ platform_user_id: userId, embed_config_id: embedConfigId ?? null })
    .returning("*");
  return row;
}

export async function findById(id: number): Promise<SessionRow | undefined> {
  return masterKnex(TABLE).where({ id }).whereNull("deleted_at").first();
}

/** Sessions this user has ever had (archived included) — drives the returning-user greeting. */
export async function countByUser(userId: number): Promise<number> {
  const row = await masterKnex(TABLE)
    .where({ platform_user_id: userId })
    .whereNull("deleted_at")
    .count("* as c")
    .first();
  return Number(row?.c ?? 0);
}

export async function findByUser(
  userId: number,
  includeArchived: boolean,
): Promise<Array<Omit<SessionRow, "counselling_context">>> {
  const q = masterKnex(TABLE)
    .select(LIST_COLUMNS)
    .where({ platform_user_id: userId })
    .whereNull("deleted_at")
    .orderBy("created_at", "desc");
  if (!includeArchived) q.andWhere({ is_archived: false });
  return q;
}

export async function update(
  id: number,
  patch: Partial<Pick<SessionRow, "title" | "is_archived">>,
): Promise<SessionRow | undefined> {
  const [row] = await masterKnex(TABLE)
    .where({ id })
    .whereNull("deleted_at")
    .update({ ...patch, updated_at: masterKnex.fn.now() })
    .returning("*");
  return row;
}

/**
 * Read-merge-write the session's counselling context.
 *
 * ponytail: not transactional. One turn runs at a time per session, so the read and
 * the write cannot interleave with another turn's. Wrap in a transaction with SELECT
 * FOR UPDATE if concurrent writers ever become real (parallel tool calls in one turn
 * are already serialised by the agent loop).
 */
export async function mergeContext(
  id: number,
  patch: CounsellingContext,
): Promise<CounsellingContext> {
  const row = await masterKnex(TABLE).where({ id }).first();
  const merged = mergeCounsellingContext(row?.counselling_context, patch);
  await masterKnex(TABLE)
    .where({ id })
    .update({ counselling_context: JSON.stringify(merged), updated_at: masterKnex.fn.now() });
  return merged;
}

export async function incrementMessageCount(id: number): Promise<void> {
  await masterKnex(TABLE)
    .where({ id })
    .update({ message_count: masterKnex.raw("message_count + 1"), updated_at: masterKnex.fn.now() });
}

/** Hard delete — messages cascade via FK, and the credit ledger keeps its rows
 * (credit_transactions.reference_id is a soft reference, no FK). Soft delete was
 * dropped deliberately: chat transcripts are bulky and nothing un-deletes them. */
export async function hardDelete(id: number): Promise<void> {
  await masterKnex(TABLE).where({ id }).del();
}
