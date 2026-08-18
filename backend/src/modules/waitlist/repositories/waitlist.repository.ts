// Knex-only data access for the waitlist. MASTER schema.
//
// EVERY read here NAMES ITS COLUMNS. There is no `select *` and no bare `.first()`
// in this file, and there must never be: the table holds nothing but PII, so a
// wildcard would hand whatever a later wave adds to the admin JSON response — the
// exact leak shape already caught twice in this program.

import type { Knex } from "knex";

import { masterKnex } from "../../../core/db/master-pool.js";
import type { RegistrantType } from "../consts.js";

export type Db = Knex | Knex.Transaction;

export const db = (): Knex => masterKnex;

export interface WaitlistRow {
  id: number;
  email: string;
  name: string;
  registrant_type: RegistrantType;
  created_at: Date;
}

/** The admin listing's column set. Enumerated on purpose — see the note above. */
const LIST_COLUMNS = ["id", "email", "name", "registrant_type", "created_at"] as const;

/**
 * Insert unless the address is already on the list. Returns whether THIS call
 * created the row, which is the only thing that decides if a confirmation email is
 * sent — no read-then-write, so two simultaneous submissions cannot both send.
 */
export async function insertIfNew(
  values: { email: string; name: string; registrant_type: RegistrantType },
  conn: Db = db(),
): Promise<boolean> {
  const rows = await conn("waitlist_registrations")
    .insert(values)
    .onConflict("email")
    .ignore()
    .returning("id");
  return rows.length > 0;
}

export async function list(
  opts: { limit: number; offset: number },
  conn: Db = db(),
): Promise<WaitlistRow[]> {
  return conn("waitlist_registrations")
    .select(...LIST_COLUMNS)
    .orderBy("id", "desc")
    .limit(opts.limit)
    .offset(opts.offset);
}

export async function count(conn: Db = db()): Promise<number> {
  const row = await conn("waitlist_registrations").count({ count: "*" }).first();
  return Number(row?.count ?? 0);
}
