// Business Events repository — all tables live in the tenant (business) schema,
// so every function takes `db` (req.db, tenant-scoped Knex) rather than masterKnex.

import type { Knex } from "knex";

const EVENTS = "business_events";
const TICKETS = "business_event_tickets";
const REGISTRATIONS = "business_event_registrations";
const COHOSTS = "business_event_co_hosts";
const UPDATES = "business_event_updates";

export interface EventRow {
  id: number;
  created_by: number | null;
  title: string;
  slug: string;
  description: string | null;
  event_type: string;
  status: string;
  visibility: string;
  target_audiences: string[];
  venue_name: string | null;
  venue_address: string | null;
  venue_city: string | null;
  venue_country: string | null;
  online_url: string | null;
  online_platform: string | null;
  starts_at: Date;
  ends_at: Date;
  timezone: string | null;
  max_capacity: number | null;
  registration_deadline: Date | null;
  contact_email: string | null;
  contact_phone: string | null;
  rsvp_count: number;
  published_at: Date | null;
  cancelled_at: Date | null;
  cancellation_reason: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export async function list(
  db: Knex,
  opts: { limit: number; offset: number; status?: string; search?: string },
): Promise<{ rows: EventRow[]; total: number }> {
  const base = () => {
    let q = db(EVENTS).whereNull("deleted_at");
    if (opts.status) q = q.andWhere("status", opts.status);
    if (opts.search) q = q.andWhereILike("title", `%${opts.search}%`);
    return q;
  };
  const [rows, [{ count }]] = await Promise.all([
    base().orderBy("starts_at", "desc").limit(opts.limit).offset(opts.offset),
    base().count("id as count"),
  ]);
  return { rows, total: Number(count) };
}

export async function findById(db: Knex, id: number): Promise<EventRow | undefined> {
  return db(EVENTS).where({ id }).whereNull("deleted_at").first();
}

export async function findByIdForUpdate(trx: Knex.Transaction, id: number): Promise<EventRow | undefined> {
  return trx(EVENTS).where({ id }).whereNull("deleted_at").forUpdate().first();
}

export async function findBySlug(db: Knex, slug: string): Promise<EventRow | undefined> {
  return db(EVENTS).where({ slug }).whereNull("deleted_at").first();
}

export async function insert(db: Knex, data: Record<string, unknown>): Promise<EventRow> {
  const [row] = await db(EVENTS).insert(data).returning("*");
  return row;
}

export async function update(db: Knex, id: number, data: Record<string, unknown>): Promise<EventRow> {
  const [row] = await db(EVENTS)
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning("*");
  return row;
}

export async function softDelete(db: Knex, id: number): Promise<void> {
  await db(EVENTS).where({ id }).update({ deleted_at: db.fn.now() });
}

// ── Tickets ──────────────────────────────────────────────

export interface TicketRow {
  id: number;
  event_id: number;
  name: string;
  description: string | null;
  price: string;
  currency: string;
  quantity: number | null;
  sold_count: number;
  max_per_order: number;
  is_active: boolean;
  sort_order: number;
}

export async function listTickets(db: Knex, eventId: number): Promise<TicketRow[]> {
  return db(TICKETS).where({ event_id: eventId }).whereNull("deleted_at").orderBy("sort_order");
}

export async function findTicketById(db: Knex, eventId: number, ticketId: number): Promise<TicketRow | undefined> {
  return db(TICKETS).where({ id: ticketId, event_id: eventId }).whereNull("deleted_at").first();
}

export async function findTicketForUpdate(
  trx: Knex.Transaction,
  ticketId: number,
): Promise<TicketRow | undefined> {
  return trx(TICKETS).where({ id: ticketId }).whereNull("deleted_at").forUpdate().first();
}

export async function insertTicket(db: Knex, data: Record<string, unknown>): Promise<TicketRow> {
  const [row] = await db(TICKETS).insert(data).returning("*");
  return row;
}

export async function updateTicket(db: Knex, id: number, data: Record<string, unknown>): Promise<TicketRow> {
  const [row] = await db(TICKETS)
    .where({ id })
    .update({ ...data, updated_at: db.fn.now() })
    .returning("*");
  return row;
}

export async function softDeleteTicket(db: Knex, id: number): Promise<void> {
  await db(TICKETS).where({ id }).update({ deleted_at: db.fn.now() });
}

export async function incrementTicketSoldCount(trx: Knex.Transaction, ticketId: number, delta: number): Promise<void> {
  await trx(TICKETS).where({ id: ticketId }).increment("sold_count", delta);
}

// ── Registrations ────────────────────────────────────────

export interface RegistrationRow {
  id: number;
  event_id: number;
  ticket_id: number | null;
  registrant_name: string;
  registrant_email: string;
  registrant_phone: string | null;
  status: string;
  quantity: number;
  notes: string | null;
  checked_in_at: Date | null;
  cancelled_at: Date | null;
  created_at: Date;
}

export async function listRegistrations(db: Knex, eventId: number): Promise<(RegistrationRow & { ticket_name: string | null })[]> {
  return db(`${REGISTRATIONS} as r`)
    .leftJoin(`${TICKETS} as t`, "t.id", "r.ticket_id")
    .where("r.event_id", eventId)
    .whereNull("r.deleted_at")
    .orderBy("r.created_at", "desc")
    .select("r.*", "t.name as ticket_name");
}

export async function insertRegistration(trx: Knex.Transaction, data: Record<string, unknown>): Promise<RegistrationRow> {
  const [row] = await trx(REGISTRATIONS).insert(data).returning("*");
  return row;
}

export async function findRegistrationForUpdate(
  trx: Knex.Transaction,
  eventId: number,
  registrationId: number,
): Promise<RegistrationRow | undefined> {
  return trx(REGISTRATIONS).where({ id: registrationId, event_id: eventId }).whereNull("deleted_at").forUpdate().first();
}

export async function updateRegistration(trx: Knex.Transaction, id: number, data: Record<string, unknown>): Promise<RegistrationRow> {
  const [row] = await trx(REGISTRATIONS)
    .where({ id })
    .update({ ...data, updated_at: trx.fn.now() })
    .returning("*");
  return row;
}

export async function incrementEventRsvpCount(trx: Knex.Transaction, eventId: number, delta: number): Promise<void> {
  await trx(EVENTS).where({ id: eventId }).increment("rsvp_count", delta);
}

// ── Co-hosts ─────────────────────────────────────────────

export interface CoHostRow {
  id: number;
  event_id: number;
  host_business_id: number;
  host_business_name: string;
  invited_by: number | null;
  status: string;
  role: string;
  created_at: Date;
}

export async function listCoHosts(db: Knex, eventId: number): Promise<CoHostRow[]> {
  return db(COHOSTS).where({ event_id: eventId }).whereNull("deleted_at").orderBy("created_at");
}

export async function insertCoHost(db: Knex, data: Record<string, unknown>): Promise<CoHostRow> {
  const [row] = await db(COHOSTS).insert(data).returning("*");
  return row;
}

export async function findCoHostById(db: Knex, eventId: number, coHostId: number): Promise<CoHostRow | undefined> {
  return db(COHOSTS).where({ id: coHostId, event_id: eventId }).whereNull("deleted_at").first();
}

export async function updateCoHostStatus(db: Knex, id: number, status: string): Promise<CoHostRow> {
  const [row] = await db(COHOSTS)
    .where({ id })
    .update({ status, updated_at: db.fn.now() })
    .returning("*");
  return row;
}

// ── Updates ──────────────────────────────────────────────

export interface UpdateRow {
  id: number;
  event_id: number;
  author_id: number | null;
  title: string | null;
  content: string;
  created_at: Date;
}

export async function listUpdates(db: Knex, eventId: number): Promise<UpdateRow[]> {
  return db(UPDATES).where({ event_id: eventId }).orderBy("created_at", "desc");
}

export async function insertUpdate(db: Knex, data: Record<string, unknown>): Promise<UpdateRow> {
  const [row] = await db(UPDATES).insert(data).returning("*");
  return row;
}
