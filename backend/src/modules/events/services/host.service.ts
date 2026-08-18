// Host-side event management. Every read and every write funnels through
// requireOwnEvent(), which is the module's cross-tenant boundary: business A
// asking for business B's event gets 404, not 403 — a 403 would confirm the
// event exists.

import { randomBytes } from "node:crypto";
import { BadRequestError, NotFoundError } from "../../../shared/errors.js";
import { buildPaginatedResponse, paginationToOffset } from "../../../shared/pagination.js";
import * as repo from "../repositories/events.repository.js";
import * as regRepo from "../repositories/registrations.repository.js";
import type { EventRow } from "../repositories/events.repository.js";
import { serializeEvent, serializeTicket } from "./events.service.js";
import type {
  CreateEventInput,
  CreateTicketInput,
  HostEventsQuery,
  RegistrationsQuery,
  UpdateEventInput,
  UpdateTicketInput,
} from "../schemas/events.schema.js";
import type { OrgType } from "../consts.js";

export interface HostRef {
  org_type: OrgType;
  org_id: number;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "event";
}

/** Title slug plus a short random suffix, the shape V1 used. Retries on collision. */
async function uniqueSlug(title: string): Promise<string> {
  const base = slugify(title);
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = `${base}-${randomBytes(4).toString("hex")}`;
    if (!(await repo.slugExists(candidate))) return candidate;
  }
  throw new BadRequestError("Could not allocate a unique slug for this title");
}

/** THE tenant boundary for this module. */
export async function requireOwnEvent(eventId: number, host: HostRef): Promise<EventRow> {
  const event = await repo.findEventById(eventId);
  if (!event || event.host_org_type !== host.org_type || event.host_org_id !== host.org_id) {
    throw new NotFoundError("Event not found");
  }
  return event;
}

export async function listOwn(host: HostRef, query: HostEventsQuery) {
  const { limit, offset } = paginationToOffset(query);
  const base = () => {
    const q = repo.baseEventQuery().where({ host_org_type: host.org_type, host_org_id: host.org_id });
    if (query.status) q.where("events.status", query.status);
    return q;
  };
  const [{ count }] = await base().count({ count: "*" });
  const rows: EventRow[] = await base().select("events.*").orderBy("events.starts_at", "desc").limit(limit).offset(offset);
  const cards = await repo.hostCards([{ org_type: host.org_type, org_id: host.org_id }]);
  const card = cards.get(`${host.org_type}:${host.org_id}`);
  return buildPaginatedResponse(rows.map((r) => serializeEvent(r, card, { includeContact: true })), Number(count), query);
}

export async function getOwn(eventId: number, host: HostRef) {
  const event = await requireOwnEvent(eventId, host);
  const cards = await repo.hostCards([{ org_type: host.org_type, org_id: host.org_id }]);
  return serializeEvent(event, cards.get(`${host.org_type}:${host.org_id}`), { includeContact: true });
}

export async function create(input: CreateEventInput, host: HostRef, createdBy: number) {
  const row = await repo.insertEvent({
    host_org_type: host.org_type,
    host_org_id: host.org_id,
    created_by: createdBy,
    slug: await uniqueSlug(input.title),
    published_at: input.status === "published" ? new Date() : null,
    ...toColumns(input),
  });
  return serializeEvent(row, undefined, { includeContact: true });
}

export async function update(eventId: number, input: UpdateEventInput, host: HostRef) {
  const existing = await requireOwnEvent(eventId, host);

  const patch: Record<string, unknown> = toColumns(input);
  if (input.status === "published" && existing.published_at === null) patch.published_at = new Date();
  if (input.status === "cancelled" && existing.cancelled_at === null) patch.cancelled_at = new Date();

  const row = await repo.updateEvent(eventId, patch);
  if (!row) throw new NotFoundError("Event not found");
  return serializeEvent(row, undefined, { includeContact: true });
}

export async function remove(eventId: number, host: HostRef) {
  await requireOwnEvent(eventId, host);
  await repo.softDeleteEvent(eventId);
}

/** Only the keys the caller actually sent, so a PATCH never blanks a column. */
function toColumns(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

// ── tickets ─────────────────────────────────────────────────────────────────

export async function listOwnTickets(eventId: number, host: HostRef) {
  await requireOwnEvent(eventId, host);
  return (await repo.listTickets(eventId)).map(serializeTicket);
}

export async function createTicket(eventId: number, input: CreateTicketInput, host: HostRef) {
  await requireOwnEvent(eventId, host);
  const row = await repo.insertTicket({ event_id: eventId, ...input, currency: input.currency.toUpperCase() });
  return serializeTicket(row);
}

export async function updateTicket(
  eventId: number,
  ticketId: number,
  input: UpdateTicketInput,
  host: HostRef,
) {
  await requireOwnEvent(eventId, host);
  const patch = toColumns(input);
  if (typeof patch.currency === "string") patch.currency = patch.currency.toUpperCase();

  // Shrinking capacity below what is already claimed would break the CHECK
  // constraint at the database. Reject it here with a message that explains why.
  if (patch.quantity !== null && typeof patch.quantity === "number") {
    const current = await repo.findTicket(ticketId, eventId);
    if (!current) throw new NotFoundError("Ticket not found");
    if (patch.quantity < current.claimed_count) {
      throw new BadRequestError(
        `Capacity cannot go below the ${current.claimed_count} seats already claimed`,
      );
    }
  }

  const row = await repo.updateTicket(ticketId, eventId, patch);
  if (!row) throw new NotFoundError("Ticket not found");
  return serializeTicket(row);
}

export async function removeTicket(eventId: number, ticketId: number, host: HostRef) {
  await requireOwnEvent(eventId, host);
  const ticket = await repo.findTicket(ticketId, eventId);
  if (!ticket) throw new NotFoundError("Ticket not found");
  if (ticket.claimed_count > 0) {
    throw new BadRequestError("Cannot delete a ticket that has claimed seats — deactivate it instead");
  }
  await repo.softDeleteTicket(ticketId, eventId);
}

// ── registrations & updates ─────────────────────────────────────────────────

export async function listRegistrations(eventId: number, host: HostRef, query: RegistrationsQuery) {
  await requireOwnEvent(eventId, host);
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
      "platform_users.id as attendee_id",
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

/** Check-in / cancel from the host side. Ownership is proven via the parent event. */
export async function setRegistrationStatus(
  registrationId: number,
  status: string,
  host: HostRef,
) {
  const registration = await regRepo.findRegistration(registrationId);
  if (!registration) throw new NotFoundError("Registration not found");
  await requireOwnEvent(registration.event_id, host);

  if (status === "cancelled") {
    // Goes through the ledger path so the seats come back.
    return regRepo.db().transaction((trx) => regRepo.cancelRegistration(registrationId, null, trx));
  }
  return regRepo.setRegistrationStatus(registrationId, status, regRepo.db());
}

export async function postUpdate(
  eventId: number,
  input: { title?: string | null; content: string },
  host: HostRef,
  authorId: number,
) {
  await requireOwnEvent(eventId, host);
  return repo.insertUpdate({
    event_id: eventId,
    author_id: authorId,
    title: input.title ?? null,
    content: input.content,
  });
}

export async function listOwnUpdates(eventId: number, host: HostRef) {
  await requireOwnEvent(eventId, host);
  return repo.listUpdates(eventId);
}
