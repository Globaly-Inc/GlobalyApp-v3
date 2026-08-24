// Business Events service. Tenant-scoped (db = req.db). No Stripe/payment
// integration — tickets are bookkeeping fields, registrations are free RSVPs.
// RSVP/sold-count maintenance is done here (in the same transaction as the
// registration write) instead of Postgres triggers, per project convention.

import type { Knex } from "knex";
import * as repo from "../repositories/events.repository.js";
import { findBusinessById } from "../../superadmin/platform/businesses/repositories/businesses.repository.js";
import { NotFoundError, BadRequestError, ConflictError } from "../../../shared/errors.js";
import { paginationToOffset, buildPaginatedResponse, type PaginationInput } from "../../../shared/pagination.js";
import { createChildLogger } from "../../../shared/logger.js";

const logger = createChildLogger("business-events-service");

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "event"
  );
}

async function uniqueSlug(db: Knex, title: string): Promise<string> {
  const base = slugify(title);
  let slug = base;
  let n = 1;
  while (await repo.findBySlug(db, slug)) {
    slug = `${base}-${++n}`;
  }
  return slug;
}

export async function listEvents(db: Knex, pagination: PaginationInput, filters: { status?: string; search?: string }) {
  const { limit, offset } = paginationToOffset(pagination);
  const { rows, total } = await repo.list(db, { limit, offset, ...filters });
  return buildPaginatedResponse(rows, total, pagination);
}

export async function getEvent(db: Knex, id: number) {
  const event = await repo.findById(db, id);
  if (!event) throw new NotFoundError("Event not found");
  return event;
}

export async function createEvent(db: Knex, createdBy: number, input: Record<string, unknown>) {
  const slug = await uniqueSlug(db, input.title as string);
  return repo.insert(db, { ...input, slug, created_by: createdBy });
}

export async function updateEvent(db: Knex, id: number, input: Record<string, unknown>) {
  await getEvent(db, id);
  return repo.update(db, id, input);
}

export async function cancelEvent(db: Knex, id: number, reason: string | undefined) {
  await getEvent(db, id);
  return repo.update(db, id, {
    status: "cancelled",
    cancelled_at: db.fn.now(),
    cancellation_reason: reason ?? null,
  });
}

export async function deleteEvent(db: Knex, id: number) {
  await getEvent(db, id);
  await repo.softDelete(db, id);
}

// ── Tickets ──────────────────────────────────────────────

export async function listTickets(db: Knex, eventId: number) {
  await getEvent(db, eventId);
  return repo.listTickets(db, eventId);
}

export async function createTicket(db: Knex, eventId: number, input: Record<string, unknown>) {
  await getEvent(db, eventId);
  return repo.insertTicket(db, { ...input, event_id: eventId });
}

export async function updateTicket(db: Knex, eventId: number, ticketId: number, input: Record<string, unknown>) {
  const ticket = await repo.findTicketById(db, eventId, ticketId);
  if (!ticket) throw new NotFoundError("Ticket not found");
  return repo.updateTicket(db, ticketId, input);
}

export async function deleteTicket(db: Knex, eventId: number, ticketId: number) {
  const ticket = await repo.findTicketById(db, eventId, ticketId);
  if (!ticket) throw new NotFoundError("Ticket not found");
  await repo.softDeleteTicket(db, ticketId);
}

// ── Registrations ────────────────────────────────────────

export async function listRegistrations(db: Knex, eventId: number) {
  await getEvent(db, eventId);
  return repo.listRegistrations(db, eventId);
}

/**
 * Registers an attendee (free RSVP). Inside one transaction: locks the event
 * (and ticket, if one was picked) row, checks capacity/ticket availability,
 * inserts the registration, then bumps event.rsvp_count and, if a ticket was
 * picked, ticket.sold_count — mirroring the legacy Postgres trigger logic in
 * app code (see migration comment).
 */
export async function registerAttendee(db: Knex, eventId: number, input: Record<string, unknown>) {
  return db.transaction(async (trx) => {
    const event = await repo.findByIdForUpdate(trx, eventId);
    if (!event) throw new NotFoundError("Event not found");
    if (event.status !== "published") throw new BadRequestError("Event is not open for registration");

    const quantity = Number(input.quantity ?? 1);
    if (event.max_capacity != null && event.rsvp_count + quantity > event.max_capacity) {
      throw new ConflictError("Event is at capacity");
    }

    const ticketId = input.ticket_id as number | null | undefined;
    if (ticketId != null) {
      const ticket = await repo.findTicketForUpdate(trx, ticketId);
      if (!ticket || ticket.event_id !== eventId) throw new NotFoundError("Ticket not found");
      if (!ticket.is_active) throw new BadRequestError("Ticket is not available");
      if (ticket.quantity != null && ticket.sold_count + quantity > ticket.quantity) {
        throw new ConflictError("Ticket is sold out");
      }
      await repo.incrementTicketSoldCount(trx, ticketId, quantity);
    }

    const registration = await repo.insertRegistration(trx, {
      event_id: eventId,
      ticket_id: ticketId ?? null,
      registrant_name: input.registrant_name,
      registrant_email: input.registrant_email,
      registrant_phone: input.registrant_phone ?? null,
      quantity,
      notes: input.notes ?? null,
      status: "registered",
    });

    await repo.incrementEventRsvpCount(trx, eventId, quantity);

    return registration;
  });
}

export async function cancelRegistration(db: Knex, eventId: number, registrationId: number) {
  return db.transaction(async (trx) => {
    const registration = await repo.findRegistrationForUpdate(trx, eventId, registrationId);
    if (!registration) throw new NotFoundError("Registration not found");
    if (registration.status === "cancelled") return registration;

    if (registration.ticket_id != null) {
      await repo.incrementTicketSoldCount(trx, registration.ticket_id, -registration.quantity);
    }
    await repo.incrementEventRsvpCount(trx, eventId, -registration.quantity);

    return repo.updateRegistration(trx, registrationId, {
      status: "cancelled",
      cancelled_at: trx.fn.now(),
    });
  });
}

export async function checkInRegistrant(db: Knex, eventId: number, registrationId: number, checkIn: boolean) {
  return db.transaction(async (trx) => {
    const registration = await repo.findRegistrationForUpdate(trx, eventId, registrationId);
    if (!registration) throw new NotFoundError("Registration not found");
    return repo.updateRegistration(trx, registrationId, {
      status: checkIn ? "checked_in" : "registered",
      checked_in_at: checkIn ? trx.fn.now() : null,
    });
  });
}

// ── Co-hosts ─────────────────────────────────────────────

export async function listCoHosts(db: Knex, eventId: number) {
  await getEvent(db, eventId);
  return repo.listCoHosts(db, eventId);
}

export async function inviteCoHost(db: Knex, eventId: number, invitedBy: number, hostBusinessId: number, role: string) {
  await getEvent(db, eventId);
  const host = await findBusinessById(hostBusinessId);
  if (!host) throw new BadRequestError("Invalid host_business_id");
  try {
    return await repo.insertCoHost(db, {
      event_id: eventId,
      host_business_id: hostBusinessId,
      host_business_name: host.name,
      invited_by: invitedBy,
      role,
    });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "23505") {
      throw new ConflictError("This business is already invited as a co-host");
    }
    throw err;
  }
}

export async function respondCoHostInvite(db: Knex, eventId: number, coHostId: number, accept: boolean) {
  const coHost = await repo.findCoHostById(db, eventId, coHostId);
  if (!coHost) throw new NotFoundError("Co-host invite not found");
  return repo.updateCoHostStatus(db, coHostId, accept ? "accepted" : "declined");
}

// ── Updates ──────────────────────────────────────────────

export async function listUpdates(db: Knex, eventId: number) {
  await getEvent(db, eventId);
  return repo.listUpdates(db, eventId);
}

export async function createUpdate(db: Knex, eventId: number, authorId: number, title: string | null | undefined, content: string) {
  await getEvent(db, eventId);
  return repo.insertUpdate(db, { event_id: eventId, author_id: authorId, title: title ?? null, content });
}
