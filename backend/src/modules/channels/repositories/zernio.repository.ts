// globalyapp-side Zernio bookkeeping: which organisation owns which Zernio profile and account,
// and the raw webhook log. Shared (not tenant) tables, because the public webhook must find the
// organisation before it can open that organisation's database — see 20261008_001.

import { masterKnex } from "../../../core/db/master-pool.js";
import type { Recipient } from "../../enquiries/shared/recipient.js";
import type { Channel } from "../consts.js";

export interface ZernioAccountRow {
  id: number;
  account_id: string;
  profile_id: string;
  owner_kind: Recipient["kind"];
  owner_id: number;
  channel: Channel;
  created_at: Date;
  disconnected_at: Date | null;
}

export const ownerOf = (row: Pick<ZernioAccountRow, "owner_kind" | "owner_id">): Recipient => ({ kind: row.owner_kind, id: row.owner_id });

export async function findProfileId(owner: Recipient): Promise<string | null> {
  const row = await masterKnex("zernio_profiles").where({ owner_kind: owner.kind, owner_id: owner.id }).first("profile_id");
  return row?.profile_id ?? null;
}

export async function findProfileOwner(profileId: string): Promise<Recipient | null> {
  const row = await masterKnex("zernio_profiles").where({ profile_id: profileId }).first("owner_kind", "owner_id");
  return row ? { kind: row.owner_kind, id: row.owner_id } : null;
}

/** First writer wins: two tabs connecting at once must end with one profile per organisation. */
export async function saveProfile(owner: Recipient, profileId: string): Promise<string> {
  await masterKnex("zernio_profiles")
    .insert({ owner_kind: owner.kind, owner_id: owner.id, profile_id: profileId })
    .onConflict(["owner_kind", "owner_id"]).ignore();
  return (await findProfileId(owner)) ?? profileId;
}

export async function upsertAccount(row: { account_id: string; profile_id: string; owner: Recipient; channel: Channel }): Promise<void> {
  await masterKnex("zernio_accounts")
    .insert({ account_id: row.account_id, profile_id: row.profile_id, owner_kind: row.owner.kind, owner_id: row.owner.id, channel: row.channel })
    .onConflict("account_id")
    .merge({ disconnected_at: null });
}

export async function findAccount(accountId: string): Promise<ZernioAccountRow | undefined> {
  return masterKnex("zernio_accounts").where({ account_id: accountId }).first();
}

export async function markAccountDisconnected(accountId: string): Promise<void> {
  await masterKnex("zernio_accounts").where({ account_id: accountId }).update({ disconnected_at: masterKnex.fn.now() });
}

// ---------------------------------------------------------------- webhook log

export interface ZernioEventRow {
  id: number;
  event_id: string;
  event: string;
  account_id: string | null;
  payload: Record<string, unknown>;
  received_at: Date;
  processed_at: Date | null;
  error: string | null;
}

/** Stores an event once. Returns its row id, or null when this event id was already stored (a retry). */
export async function insertEvent(e: { event_id: string; event: string; account_id: string | null; payload: unknown }): Promise<number | null> {
  const rows = await masterKnex("zernio_events")
    .insert({ event_id: e.event_id, event: e.event, account_id: e.account_id, payload: JSON.stringify(e.payload) })
    .onConflict("event_id").ignore()
    .returning("id");
  // bigserial: pg hands int8 back as a string. A number from here on, so the queue message and
  // the worker's guard agree.
  const id = rows[0]?.id;
  return id == null ? null : Number(id);
}

export async function findEvent(id: number): Promise<ZernioEventRow | undefined> {
  return masterKnex("zernio_events").where({ id }).first();
}

/** A failure: noted, but left unprocessed so the worker's sweep tries it again. */
export async function markEventFailed(id: number, error: string): Promise<void> {
  await masterKnex("zernio_events").where({ id }).update({ error });
}

export async function markEventProcessed(id: number, error?: string): Promise<void> {
  await masterKnex("zernio_events").where({ id }).update({ processed_at: masterKnex.fn.now(), error: error ?? null });
}
