// Knex-only data access for events, tickets, co-hosts and updates.
// Everything lives in the MASTER schema (see the migration header for why), so
// this module talks to masterKnex rather than req.db.

import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";
import type { OrgType } from "../consts.js";

export type Db = Knex | Knex.Transaction;

export const db = (): Knex => masterKnex;

export interface EventRow {
  id: number;
  v1_id: string | null;
  host_org_type: OrgType;
  host_org_id: number;
  created_by: number | null;
  title: string;
  slug: string;
  description: string | null;
  summary: string | null;
  cover_image_url: string | null;
  event_type: string;
  category: string | null;
  status: string;
  visibility: string;
  target_audiences: string[] | null;
  target_countries: string[] | null;
  venue_name: string | null;
  venue_city: string | null;
  venue_country: string | null;
  venue_address: string | null;
  online_url: string | null;
  online_platform: string | null;
  starts_at: Date;
  ends_at: Date;
  timezone: string | null;
  max_capacity: number | null;
  registration_deadline: Date | null;
  is_featured: boolean;
  tags: string[] | null;
  contact_email: string | null;
  contact_phone: string | null;
  views_count: number;
  published_at: Date | null;
  cancelled_at: Date | null;
  cancellation_reason: string | null;
  created_at: Date;
}

export interface TicketRow {
  id: number;
  event_id: number;
  name: string;
  description: string | null;
  price: string;
  currency: string;
  quantity: number | null;
  claimed_count: number;
  max_per_order: number;
  sale_starts_at: Date | null;
  sale_ends_at: Date | null;
  is_active: boolean;
  sort_order: number;
  stripe_price_id: string | null;
}

const LIVE = (q: Knex.QueryBuilder) => q.whereNull("events.deleted_at");

// ── events ──────────────────────────────────────────────────────────────────

export function baseEventQuery(conn: Db = db()) {
  return LIVE(conn("events"));
}

export async function findEventById(id: number, conn: Db = db()): Promise<EventRow | undefined> {
  return baseEventQuery(conn).where("events.id", id).first();
}

export async function findEventBySlug(slug: string, conn: Db = db()): Promise<EventRow | undefined> {
  return baseEventQuery(conn).where("events.slug", slug).first();
}

/** Locks the event row — used when a write must not race a concurrent host edit. */
export async function lockEvent(id: number, trx: Knex.Transaction): Promise<EventRow | undefined> {
  return trx("events").where({ id }).whereNull("deleted_at").forUpdate().first();
}

export async function slugExists(slug: string, conn: Db = db()): Promise<boolean> {
  const row = await conn("events").where({ slug }).select("id").first();
  return Boolean(row);
}

export async function insertEvent(values: Record<string, unknown>, conn: Db = db()): Promise<EventRow> {
  const [row] = await conn("events").insert(values).returning("*");
  return row as EventRow;
}

export async function updateEvent(
  id: number,
  values: Record<string, unknown>,
  conn: Db = db(),
): Promise<EventRow | undefined> {
  const [row] = await conn("events")
    .where({ id })
    .whereNull("deleted_at")
    .update({ ...values, updated_at: conn.fn.now() })
    .returning("*");
  return row as EventRow | undefined;
}

export async function softDeleteEvent(id: number, conn: Db = db()): Promise<number> {
  return conn("events").where({ id }).whereNull("deleted_at").update({ deleted_at: conn.fn.now() });
}

export async function bumpViews(id: number, conn: Db = db()): Promise<void> {
  await conn("events").where({ id }).increment("views_count", 1);
}

// ── tickets ─────────────────────────────────────────────────────────────────

export async function listTickets(eventId: number, conn: Db = db()): Promise<TicketRow[]> {
  return conn("event_tickets")
    .where({ event_id: eventId })
    .whereNull("deleted_at")
    .orderBy([{ column: "sort_order" }, { column: "id" }]);
}

export async function findTicket(
  ticketId: number,
  eventId: number,
  conn: Db = db(),
): Promise<TicketRow | undefined> {
  return conn("event_tickets")
    .where({ id: ticketId, event_id: eventId })
    .whereNull("deleted_at")
    .first();
}

export async function insertTicket(values: Record<string, unknown>, conn: Db = db()): Promise<TicketRow> {
  const [row] = await conn("event_tickets").insert(values).returning("*");
  return row as TicketRow;
}

export async function updateTicket(
  ticketId: number,
  eventId: number,
  values: Record<string, unknown>,
  conn: Db = db(),
): Promise<TicketRow | undefined> {
  const [row] = await conn("event_tickets")
    .where({ id: ticketId, event_id: eventId })
    .whereNull("deleted_at")
    .update({ ...values, updated_at: conn.fn.now() })
    .returning("*");
  return row as TicketRow | undefined;
}

export async function softDeleteTicket(ticketId: number, eventId: number, conn: Db = db()): Promise<number> {
  return conn("event_tickets")
    .where({ id: ticketId, event_id: eventId })
    .whereNull("deleted_at")
    .update({ deleted_at: conn.fn.now() });
}

// ── co-hosts & updates ──────────────────────────────────────────────────────

export async function listCoHosts(eventId: number, conn: Db = db()) {
  return conn("event_co_hosts")
    .where({ event_id: eventId })
    .whereNull("deleted_at")
    .select("id", "co_host_org_type", "co_host_org_id", "status", "role", "created_at")
    .orderBy("id");
}

export async function listUpdates(eventId: number, conn: Db = db()) {
  return conn("event_updates")
    .where({ event_id: eventId })
    .whereNull("deleted_at")
    .select("id", "title", "content", "author_id", "created_at")
    .orderBy("id", "desc");
}

export async function insertUpdate(values: Record<string, unknown>, conn: Db = db()) {
  const [row] = await conn("event_updates").insert(values).returning("*");
  return row;
}

// ── host lookup ─────────────────────────────────────────────────────────────

export interface HostCard {
  org_type: OrgType;
  org_id: number;
  name: string | null;
  logo_url: string | null;
}

/**
 * Display cards for a set of (org_type, org_id) pairs. Two small queries rather
 * than a polymorphic join — `businesses` and `institutions` are separate tables
 * with different column names.
 */
export async function hostCards(
  refs: Array<{ org_type: OrgType; org_id: number }>,
  conn: Db = db(),
): Promise<Map<string, HostCard>> {
  const out = new Map<string, HostCard>();
  const businessIds = refs.filter((r) => r.org_type === "business").map((r) => r.org_id);
  const institutionIds = refs.filter((r) => r.org_type === "institution").map((r) => r.org_id);

  if (businessIds.length > 0) {
    const rows = await conn("businesses")
      .whereIn("id", [...new Set(businessIds)])
      .select("id", "business_name as name", "logo_url");
    for (const r of rows) out.set(`business:${r.id}`, { org_type: "business", org_id: r.id, name: r.name, logo_url: r.logo_url });
  }
  if (institutionIds.length > 0) {
    const rows = await conn("institutions")
      .whereIn("id", [...new Set(institutionIds)])
      .select("id", "institution_name as name", "logo_url");
    for (const r of rows) out.set(`institution:${r.id}`, { org_type: "institution", org_id: r.id, name: r.name, logo_url: r.logo_url });
  }
  return out;
}
