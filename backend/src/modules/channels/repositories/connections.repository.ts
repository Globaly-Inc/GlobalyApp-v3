// channel_connections, in the TENANT schema: the organisation's connected WhatsApp numbers,
// Instagram accounts and Facebook Pages, with their AI settings. `db` is the tenant connection
// (req.db, or tenantDbFor in a worker), which is the organisation boundary.

import type { Knex } from "knex";
import type { Channel } from "../consts.js";

export type ConnectionStatus = "connected" | "error" | "disconnected";

export interface ConnectionRow {
  id: number;
  channel: Channel;
  zernio_account_id: string;
  display_name: string;
  handle: string | null;
  status: ConnectionStatus;
  ai_mode: "auto" | "suggest";
  ai_config: unknown;
  quality: string | null;
  error_message: string | null;
  connected_by_user_id: number | null;
  created_at: Date;
  updated_at: Date;
  disconnected_at: Date | null;
}

const TABLE = "channel_connections";

/** What the Channels page may see — zernio_account_id is an internal reference. */
export const PUBLIC_COLUMNS = [
  "id", "channel", "display_name", "handle", "status", "ai_mode", "ai_config", "quality", "error_message", "created_at", "updated_at",
] as const;

export async function list(db: Knex): Promise<Pick<ConnectionRow, (typeof PUBLIC_COLUMNS)[number]>[]> {
  return db(TABLE).whereNot({ status: "disconnected" }).select(...PUBLIC_COLUMNS).orderBy("created_at", "asc");
}

export async function findById(db: Knex, id: number): Promise<ConnectionRow | undefined> {
  return db(TABLE).where({ id }).first();
}

export async function findByAccount(db: Knex, zernioAccountId: string): Promise<ConnectionRow | undefined> {
  return db(TABLE).where({ zernio_account_id: zernioAccountId }).first();
}

/** Connect, or reconnect the same account: settings and conversations are kept. */
export async function upsert(db: Knex, row: { channel: Channel; zernio_account_id: string; display_name: string; handle: string | null; connected_by_user_id: number | null }): Promise<ConnectionRow> {
  const [saved] = await db(TABLE)
    .insert({ ...row, status: "connected" })
    .onConflict("zernio_account_id")
    .merge({ display_name: row.display_name, handle: row.handle, status: "connected", error_message: null, disconnected_at: null, updated_at: db.fn.now() })
    .returning("*");
  return saved;
}

export async function setStatus(db: Knex, zernioAccountId: string, status: ConnectionStatus, errorMessage: string | null = null): Promise<number> {
  return db(TABLE).where({ zernio_account_id: zernioAccountId }).update({
    status, error_message: errorMessage, updated_at: db.fn.now(),
    ...(status === "disconnected" ? { disconnected_at: db.fn.now() } : {}),
  });
}

export async function setQuality(db: Knex, zernioAccountId: string, quality: string): Promise<void> {
  await db(TABLE).where({ zernio_account_id: zernioAccountId }).update({ quality, updated_at: db.fn.now() });
}

export async function updateAi(db: Knex, id: number, patch: { ai_mode: "auto" | "suggest"; ai_config: unknown }): Promise<ConnectionRow | undefined> {
  const [row] = await db(TABLE).where({ id }).update({ ai_mode: patch.ai_mode, ai_config: JSON.stringify(patch.ai_config), updated_at: db.fn.now() }).returning("*");
  return row;
}
