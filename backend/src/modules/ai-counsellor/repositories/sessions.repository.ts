import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";
import type { ChatScope } from "../services/scope.js";

export interface SessionRow {
  id: number;
  owner_type: "user" | "business";
  platform_user_id: number;
  business_id: number | null;
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

export async function create(
  scope: ChatScope,
  embedConfigId?: number,
  trx?: Knex.Transaction,
): Promise<SessionRow> {
  const [row] = await (trx ?? masterKnex)(TABLE)
    .insert({
      owner_type: scope.ownerType,
      platform_user_id: scope.userId,
      business_id: scope.businessId,
      embed_config_id: embedConfigId ?? null,
    })
    .returning("*");
  return row;
}

export async function findById(id: number): Promise<SessionRow | undefined> {
  return masterKnex(TABLE).where({ id }).whereNull("deleted_at").first();
}

/**
 * Personal sessions belong to the one user who created them; business sessions
 * belong to the business, so any seat in that business sees the same list. The
 * two sets can never overlap — owner_type and business_id are both matched.
 */
export async function findByScope(scope: ChatScope, includeArchived: boolean): Promise<SessionRow[]> {
  const q = masterKnex(TABLE)
    .where({ owner_type: scope.ownerType })
    .whereNull("deleted_at")
    .orderBy("created_at", "desc");

  if (scope.ownerType === "business") q.andWhere({ business_id: scope.businessId });
  else q.andWhere({ platform_user_id: scope.userId }).whereNull("business_id");

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

export async function incrementMessageCount(id: number, trx?: Knex.Transaction): Promise<void> {
  const db = trx ?? masterKnex;
  await db(TABLE)
    .where({ id })
    .update({ message_count: db.raw("message_count + 1"), updated_at: db.fn.now() });
}

/** Runs inside the settlement transaction so the tally cannot drift from the ledger. */
export async function addCreditsUsed(id: number, delta: number, trx: Knex.Transaction): Promise<void> {
  await trx(TABLE)
    .where({ id })
    .update({ credits_used: trx.raw("credits_used + ?", [delta]), updated_at: trx.fn.now() });
}

export async function softDelete(id: number): Promise<void> {
  await masterKnex(TABLE)
    .where({ id })
    .whereNull("deleted_at")
    .update({ deleted_at: masterKnex.fn.now(), updated_at: masterKnex.fn.now() });
}
