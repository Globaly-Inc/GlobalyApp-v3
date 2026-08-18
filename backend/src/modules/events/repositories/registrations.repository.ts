// The seat ledger. Every function here is written so that correctness under
// concurrency comes from the database, never from a read-then-write in Node.

import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";
import type { Db } from "./events.repository.js";

export const db = (): Knex => masterKnex;

export interface RegistrationRow {
  id: number;
  event_id: number;
  ticket_id: number | null;
  platform_user_id: number;
  status: string;
  quantity: number;
  total_paid: string;
  payment_status: string;
  stripe_session_id: string | null;
  hold_expires_at: Date | null;
  check_in_at: Date | null;
  cancelled_at: Date | null;
  notes: string | null;
  created_at: Date;
}

/**
 * Claim `quantity` seats on a ticket. The WHERE clause carries the invariant, so
 * two concurrent claims serialise on the row lock Postgres takes for the UPDATE
 * and the loser simply matches zero rows.
 *
 * Returns false when the ticket is sold out, inactive or gone — never throws,
 * because "sold out" is an ordinary outcome, not an error condition.
 */
export async function claimSeats(ticketId: number, quantity: number, trx: Knex.Transaction): Promise<boolean> {
  const updated = await trx("event_tickets")
    .where({ id: ticketId })
    .whereNull("deleted_at")
    .where("is_active", true)
    .whereRaw("(quantity IS NULL OR claimed_count + ? <= quantity)", [quantity])
    .update({ claimed_count: trx.raw("claimed_count + ?", [quantity]), updated_at: trx.fn.now() });
  return updated > 0;
}

/** Give seats back. Clamped at zero so a double-release can never go negative. */
export async function releaseSeats(ticketId: number, quantity: number, trx: Db): Promise<void> {
  await trx("event_tickets")
    .where({ id: ticketId })
    .update({
      claimed_count: trx.raw("GREATEST(claimed_count - ?, 0)", [quantity]),
      updated_at: trx.fn.now(),
    });
}

/**
 * Lazy reaper: expire pending checkouts whose hold has lapsed and return their
 * seats. Runs inside the same transaction as the claim that needs the room, so
 * there is no cron container and no background sweep to forget about.
 *
 * ponytail: a scan of one event's pending rows. Fine at V1's scale (4
 * registrations total); index event_registrations on (payment_status,
 * hold_expires_at) if an event ever accumulates thousands of abandoned carts.
 */
export async function reapExpiredHolds(eventId: number, trx: Knex.Transaction): Promise<number> {
  const expired = await trx("event_registrations")
    .where({ event_id: eventId, payment_status: "pending" })
    .whereNotNull("hold_expires_at")
    .where("hold_expires_at", "<", trx.fn.now())
    .forUpdate()
    .select("id", "ticket_id", "quantity");

  for (const row of expired) {
    if (row.ticket_id) await releaseSeats(row.ticket_id, row.quantity, trx);
  }
  if (expired.length > 0) {
    await trx("event_registrations")
      .whereIn("id", expired.map((r) => r.id))
      .update({ payment_status: "expired", status: "cancelled", cancelled_at: trx.fn.now(), updated_at: trx.fn.now() });
  }
  return expired.length;
}

/**
 * Lock the event row. Only used when the event carries its own max_capacity —
 * that limit spans every ticket type plus plain RSVPs, so it cannot be expressed
 * as a single conditional update the way a ticket's quantity can.
 *
 * ponytail: serialises registration per event. Replace with an events-level
 * claimed_count ledger if one event ever needs high concurrent throughput.
 */
export async function lockEventForCapacity(eventId: number, trx: Knex.Transaction) {
  return trx("events").where({ id: eventId }).whereNull("deleted_at").forUpdate().first();
}

/** Seats already taken on an event across all tickets and RSVPs. */
export async function seatsTaken(eventId: number, trx: Db): Promise<number> {
  const row = await trx("event_registrations")
    .where({ event_id: eventId })
    .whereNot("status", "cancelled")
    .whereNull("deleted_at")
    .sum({ total: "quantity" })
    .first();
  return Number(row?.total ?? 0);
}

export async function insertRegistration(
  values: Record<string, unknown>,
  trx: Db,
): Promise<RegistrationRow> {
  const [row] = await trx("event_registrations").insert(values).returning("*");
  return row as RegistrationRow;
}

export async function findRegistration(id: number, conn: Db = db()): Promise<RegistrationRow | undefined> {
  return conn("event_registrations").where({ id }).whereNull("deleted_at").first();
}

export async function findActiveRegistration(
  eventId: number,
  ticketId: number | null,
  platformUserId: number,
  conn: Db = db(),
): Promise<RegistrationRow | undefined> {
  const q = conn("event_registrations")
    .where({ event_id: eventId, platform_user_id: platformUserId })
    .whereNot("status", "cancelled")
    .whereNull("deleted_at");
  return (ticketId === null ? q.whereNull("ticket_id") : q.where("ticket_id", ticketId)).first();
}

export async function findByStripeSession(sessionId: string, conn: Db = db()): Promise<RegistrationRow | undefined> {
  return conn("event_registrations").where({ stripe_session_id: sessionId }).first();
}

/**
 * Flip a pending registration to paid. Idempotent BY CONSTRUCTION: the seats were
 * already claimed at checkout, so settlement moves no ledger at all, and the
 * `payment_status = 'pending'` predicate means a redelivered webhook matches
 * zero rows. Returns false when the session was already settled.
 */
export async function settlePayment(sessionId: string, trx: Db): Promise<boolean> {
  const updated = await trx("event_registrations")
    .where({ stripe_session_id: sessionId, payment_status: "pending" })
    .update({
      payment_status: "paid",
      status: "registered",
      hold_expires_at: null,
      updated_at: trx.fn.now(),
    });
  return updated > 0;
}

/**
 * Cancel a registration and return its seats, in one transaction. The
 * `whereNot status cancelled` predicate is what stops a double-cancel from
 * releasing the same seats twice.
 */
export async function cancelRegistration(
  id: number,
  platformUserId: number | null,
  trx: Knex.Transaction,
): Promise<RegistrationRow | undefined> {
  const q = trx("event_registrations").where({ id }).whereNot("status", "cancelled").whereNull("deleted_at");
  if (platformUserId !== null) q.where({ platform_user_id: platformUserId });

  const [row] = await q
    .update({
      status: "cancelled",
      cancelled_at: trx.fn.now(),
      hold_expires_at: null,
      updated_at: trx.fn.now(),
    })
    .returning("*");

  if (row?.ticket_id) await releaseSeats(row.ticket_id, row.quantity, trx);
  return row as RegistrationRow | undefined;
}

export async function setRegistrationStatus(
  id: number,
  status: string,
  trx: Db,
): Promise<RegistrationRow | undefined> {
  const [row] = await trx("event_registrations")
    .where({ id })
    .whereNull("deleted_at")
    .update({
      status,
      check_in_at: status === "checked_in" ? trx.fn.now() : null,
      updated_at: trx.fn.now(),
    })
    .returning("*");
  return row as RegistrationRow | undefined;
}
