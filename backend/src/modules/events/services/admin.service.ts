// Platform-wide event observability for admin/monitoring/events.
// Read-only: admins watch events, hosts own them.

import { NotFoundError } from "../../../shared/errors.js";
import { buildPaginatedResponse, paginationToOffset } from "../../../shared/pagination.js";
import * as repo from "../repositories/events.repository.js";
import * as regRepo from "../repositories/registrations.repository.js";
import type { EventRow } from "../repositories/events.repository.js";
import { serializeEvent, serializeTicket } from "./events.service.js";
import type { AdminEventsQuery, RegistrationsQuery } from "../schemas/events.schema.js";
import type { OrgType } from "../consts.js";

export interface AdminEventStats {
  events: { total: number; published: number; draft: number; cancelled: number; upcoming: number };
  registrations: { total: number; checked_in: number; cancelled: number };
  tickets: { total: number; seats_claimed: number; gross_paid: number };
}

export async function stats(): Promise<AdminEventStats> {
  const conn = repo.db();

  const [events] = await conn("events")
    .whereNull("deleted_at")
    .select(
      conn.raw("count(*)::int as total"),
      conn.raw("count(*) filter (where status = 'published')::int as published"),
      conn.raw("count(*) filter (where status = 'draft')::int as draft"),
      conn.raw("count(*) filter (where status = 'cancelled')::int as cancelled"),
      conn.raw("count(*) filter (where ends_at >= now() and status = 'published')::int as upcoming"),
    );

  const [registrations] = await conn("event_registrations")
    .whereNull("deleted_at")
    .select(
      conn.raw("count(*)::int as total"),
      conn.raw("count(*) filter (where status = 'checked_in')::int as checked_in"),
      conn.raw("count(*) filter (where status = 'cancelled')::int as cancelled"),
      conn.raw("coalesce(sum(total_paid) filter (where payment_status = 'paid'), 0)::float as gross_paid"),
    );

  const [tickets] = await conn("event_tickets")
    .whereNull("deleted_at")
    .select(
      conn.raw("count(*)::int as total"),
      conn.raw("coalesce(sum(claimed_count), 0)::int as seats_claimed"),
    );

  return {
    events,
    registrations: {
      total: registrations.total,
      checked_in: registrations.checked_in,
      cancelled: registrations.cancelled,
    },
    tickets: { total: tickets.total, seats_claimed: tickets.seats_claimed, gross_paid: registrations.gross_paid },
  };
}

export async function list(query: AdminEventsQuery) {
  const { limit, offset } = paginationToOffset(query);

  const base = () => {
    const q = repo.baseEventQuery();
    if (query.q) q.where((b) => b.whereILike("events.title", `%${query.q}%`).orWhereILike("events.slug", `%${query.q}%`));
    if (query.status) q.where("events.status", query.status);
    if (query.event_type) q.where("events.event_type", query.event_type);
    return q;
  };

  const [{ count }] = await base().count({ count: "*" });
  const rows: EventRow[] = await base()
    .select("events.*")
    .orderBy("events.starts_at", "desc")
    .limit(limit)
    .offset(offset);

  const counts = await registrationCounts(rows.map((r) => r.id));
  const cards = await repo.hostCards(
    rows.map((r) => ({ org_type: r.host_org_type as OrgType, org_id: r.host_org_id })),
  );

  const data = rows.map((r) => ({
    ...serializeEvent(r, cards.get(`${r.host_org_type}:${r.host_org_id}`), { includeContact: true }),
    registrations_count: counts.get(r.id) ?? 0,
  }));
  return buildPaginatedResponse(data, Number(count), query);
}

async function registrationCounts(eventIds: number[]): Promise<Map<number, number>> {
  if (eventIds.length === 0) return new Map();
  const rows = await regRepo
    .db()("event_registrations")
    .whereIn("event_id", eventIds)
    .whereNot("status", "cancelled")
    .whereNull("deleted_at")
    .groupBy("event_id")
    .select<Array<{ event_id: number; count: string }>>(
      "event_id",
      regRepo.db().raw("count(*)::int as count"),
    );
  return new Map(rows.map((r) => [Number(r.event_id), Number(r.count)]));
}

export async function detail(eventId: number) {
  const event = await repo.findEventById(eventId);
  if (!event) throw new NotFoundError("Event not found");

  const cards = await repo.hostCards([
    { org_type: event.host_org_type as OrgType, org_id: event.host_org_id },
  ]);
  const [tickets, counts, updates] = await Promise.all([
    repo.listTickets(eventId),
    registrationCounts([eventId]),
    repo.listUpdates(eventId),
  ]);

  return {
    ...serializeEvent(event, cards.get(`${event.host_org_type}:${event.host_org_id}`), { includeContact: true }),
    registrations_count: counts.get(eventId) ?? 0,
    tickets: tickets.map(serializeTicket),
    updates,
  };
}

export async function registrations(eventId: number, query: RegistrationsQuery) {
  const event = await repo.findEventById(eventId);
  if (!event) throw new NotFoundError("Event not found");

  const { limit, offset } = paginationToOffset(query);
  const base = () => {
    const q = regRepo
      .db()("event_registrations")
      .where("event_registrations.event_id", eventId)
      .whereNull("event_registrations.deleted_at");
    if (query.status) q.where("event_registrations.status", query.status);
    return q;
  };

  const [{ count }] = await base().count({ count: "*" });
  const rows = await base()
    .leftJoin("platform_users", "platform_users.id", "event_registrations.platform_user_id")
    .leftJoin("event_tickets", "event_tickets.id", "event_registrations.ticket_id")
    .select(
      "event_registrations.id",
      "event_registrations.status",
      "event_registrations.quantity",
      "event_registrations.total_paid",
      "event_registrations.payment_status",
      "event_registrations.check_in_at",
      "event_registrations.created_at",
      "platform_users.first_name",
      "platform_users.last_name",
      "platform_users.email",
      "event_tickets.name as ticket_name",
    )
    .orderBy("event_registrations.id", "desc")
    .limit(limit)
    .offset(offset);

  return buildPaginatedResponse(rows, Number(count), query);
}
