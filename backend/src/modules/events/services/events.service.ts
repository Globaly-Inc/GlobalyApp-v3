// Public event reads — browse, detail, tickets, co-hosts, updates.
// Only published + public events are visible here; targeted and draft events are
// reachable through the host and admin surfaces.

import { NotFoundError } from "../../../shared/errors.js";
import { buildPaginatedResponse, paginationToOffset } from "../../../shared/pagination.js";
import * as repo from "../repositories/events.repository.js";
import type { EventRow, TicketRow } from "../repositories/events.repository.js";
import type { BrowseEventsQuery } from "../schemas/events.schema.js";
import type { OrgType } from "../consts.js";

export function serializeTicket(t: TicketRow) {
  const price = Number(t.price);
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    price,
    currency: t.currency,
    is_free: price <= 0,
    quantity: t.quantity,
    claimed_count: t.claimed_count,
    /** null = unlimited. Never negative: the CHECK constraint guarantees it. */
    remaining: t.quantity === null ? null : Math.max(t.quantity - t.claimed_count, 0),
    max_per_order: t.max_per_order,
    sale_starts_at: t.sale_starts_at,
    sale_ends_at: t.sale_ends_at,
    is_active: t.is_active,
    sort_order: t.sort_order,
  };
}

/**
 * `contact_email` / `contact_phone` are the organiser's own details. They are
 * returned only to the host and to admins — passing `includeContact` — never on
 * the unauthenticated browse and detail routes, which share this serializer.
 */
export function serializeEvent(
  e: EventRow,
  host: repo.HostCard | undefined,
  opts: { includeContact?: boolean } = {},
) {
  return {
    id: e.id,
    title: e.title,
    slug: e.slug,
    summary: e.summary,
    description: e.description,
    cover_image_url: e.cover_image_url,
    event_type: e.event_type,
    category: e.category,
    status: e.status,
    visibility: e.visibility,
    target_audiences: e.target_audiences,
    target_countries: e.target_countries,
    venue_name: e.venue_name,
    venue_city: e.venue_city,
    venue_country: e.venue_country,
    venue_address: e.venue_address,
    online_url: e.online_url,
    online_platform: e.online_platform,
    starts_at: e.starts_at,
    ends_at: e.ends_at,
    timezone: e.timezone,
    max_capacity: e.max_capacity,
    registration_deadline: e.registration_deadline,
    is_featured: e.is_featured,
    tags: e.tags,
    ...(opts.includeContact
      ? { contact_email: e.contact_email, contact_phone: e.contact_phone }
      : {}),
    views_count: e.views_count,
    published_at: e.published_at,
    cancelled_at: e.cancelled_at,
    cancellation_reason: e.cancellation_reason,
    created_at: e.created_at,
    host: host
      ? { org_type: host.org_type, org_id: host.org_id, name: host.name, logo_url: host.logo_url }
      : { org_type: e.host_org_type, org_id: e.host_org_id, name: null, logo_url: null },
  };
}

/** Attach host cards to a page of events with two queries, not N. */
export async function withHosts(rows: EventRow[]) {
  const cards = await repo.hostCards(
    rows.map((r) => ({ org_type: r.host_org_type as OrgType, org_id: r.host_org_id })),
  );
  return rows.map((r) => serializeEvent(r, cards.get(`${r.host_org_type}:${r.host_org_id}`)));
}

export async function browse(query: BrowseEventsQuery) {
  const { limit, offset } = paginationToOffset(query);

  const base = () => {
    const q = repo.baseEventQuery().where({ status: "published", visibility: "public" });
    if (query.q) q.whereILike("events.title", `%${query.q}%`);
    if (query.category) q.where("events.category", query.category);
    if (query.event_type) q.where("events.event_type", query.event_type);
    if (query.country) q.whereILike("events.venue_country", query.country);
    if (query.upcoming) q.where("events.ends_at", ">=", repo.db().fn.now());
    return q;
  };

  const [{ count }] = await base().count({ count: "*" });
  const rows: EventRow[] = await base().select("events.*").orderBy("events.starts_at", "asc").limit(limit).offset(offset);

  return buildPaginatedResponse(await withHosts(rows), Number(count), query);
}

/** Public detail by numeric id or slug. Bumps views_count as a side effect. */
export async function getPublic(idOrSlug: string) {
  const numeric = Number(idOrSlug);
  const row = Number.isInteger(numeric) && numeric > 0
    ? await repo.findEventById(numeric)
    : await repo.findEventBySlug(idOrSlug);

  if (!row || row.status !== "published" || row.visibility !== "public") {
    throw new NotFoundError("Event not found");
  }
  await repo.bumpViews(row.id);
  const [serialized] = await withHosts([row]);
  return serialized;
}

/** Assert an event is publicly readable, returning it. Used by the sub-resource routes. */
async function requirePublicEvent(eventId: number): Promise<EventRow> {
  const event = await repo.findEventById(eventId);
  if (!event || event.status !== "published" || event.visibility !== "public") {
    throw new NotFoundError("Event not found");
  }
  return event;
}

export async function listPublicTickets(eventId: number) {
  await requirePublicEvent(eventId);
  const tickets = await repo.listTickets(eventId);
  return tickets.filter((t) => t.is_active).map(serializeTicket);
}

export async function listPublicCoHosts(eventId: number) {
  await requirePublicEvent(eventId);
  const rows = await repo.listCoHosts(eventId);
  const cards = await repo.hostCards(
    rows.map((r) => ({ org_type: r.co_host_org_type as OrgType, org_id: r.co_host_org_id })),
  );
  return rows
    .filter((r) => r.status === "accepted")
    .map((r) => ({
      id: r.id,
      role: r.role,
      status: r.status,
      org: cards.get(`${r.co_host_org_type}:${r.co_host_org_id}`) ?? {
        org_type: r.co_host_org_type,
        org_id: r.co_host_org_id,
        name: null,
        logo_url: null,
      },
    }));
}

export async function listPublicUpdates(eventId: number) {
  await requirePublicEvent(eventId);
  return repo.listUpdates(eventId);
}
