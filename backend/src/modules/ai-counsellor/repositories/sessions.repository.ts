import { masterKnex } from "../../../core/db/master-pool.js";

export interface SessionRow {
  id: number;
  platform_user_id: number;
  embed_config_id: number | null;
  title: string | null;
  message_count: number;
  credits_used: number;
  is_archived: boolean;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

const TABLE = "ai_counselor_sessions";

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

export async function findByUser(userId: number, includeArchived: boolean): Promise<SessionRow[]> {
  const q = masterKnex(TABLE)
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

export async function incrementMessageCount(id: number): Promise<void> {
  await masterKnex(TABLE)
    .where({ id })
    .update({ message_count: masterKnex.raw("message_count + 1"), updated_at: masterKnex.fn.now() });
}

export async function softDelete(id: number): Promise<void> {
  await masterKnex(TABLE)
    .where({ id })
    .whereNull("deleted_at")
    .update({ deleted_at: masterKnex.fn.now(), updated_at: masterKnex.fn.now() });
}
