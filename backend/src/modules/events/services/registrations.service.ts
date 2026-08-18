// Free registration / RSVP, the attendee's own list, and cancellation.
// Paid tickets go through payments.service.ts instead.

import { BadRequestError, ConflictError, NotFoundError } from "../../../shared/errors.js";
import { buildPaginatedResponse, paginationToOffset } from "../../../shared/pagination.js";
import * as repo from "../repositories/events.repository.js";
import * as regRepo from "../repositories/registrations.repository.js";
import type { EventRow, TicketRow } from "../repositories/events.repository.js";
import { publish } from "../../notifications/services/notifications.service.js";
import { EVENT_NOTIFICATION_TYPES } from "../consts.js";
import type { PaginationInput } from "../../../shared/pagination.js";
import type { RegisterInput } from "../schemas/events.schema.js";

/** Common gate for anything that creates a registration, free or paid. */
export async function requireRegistrableEvent(eventId: number): Promise<EventRow> {
  const event = await repo.findEventById(eventId);
  if (!event || event.status === "draft") throw new NotFoundError("Event not found");
  if (event.status === "cancelled") throw new BadRequestError("This event has been cancelled");
  if (event.registration_deadline && new Date(event.registration_deadline) < new Date()) {
    throw new BadRequestError("Registration for this event has closed");
  }
  return event;
}

export async function requireSellableTicket(eventId: number, ticketId: number): Promise<TicketRow> {
  const ticket = await repo.findTicket(ticketId, eventId);
  if (!ticket) throw new NotFoundError("Ticket not found");
  if (!ticket.is_active) throw new BadRequestError("This ticket is not on sale");

  const now = Date.now();
  if (ticket.sale_starts_at && new Date(ticket.sale_starts_at).getTime() > now) {
    throw new BadRequestError("Sales for this ticket have not opened yet");
  }
  if (ticket.sale_ends_at && new Date(ticket.sale_ends_at).getTime() < now) {
    throw new BadRequestError("Sales for this ticket have closed");
  }
  return ticket;
}

/**
 * Enforce the event-wide max_capacity, which spans every ticket type plus plain
 * RSVPs. Only reached when the event actually sets one, so the common path takes
 * no lock at all and the ticket ledger does the work on its own.
 */
async function assertEventCapacity(event: EventRow, quantity: number, trx: Parameters<typeof regRepo.seatsTaken>[1]) {
  if (event.max_capacity === null) return;
  const taken = await regRepo.seatsTaken(event.id, trx);
  if (taken + quantity > event.max_capacity) throw new ConflictError("This event is full");
}

export async function register(eventId: number, userId: number, input: RegisterInput) {
  const event = await requireRegistrableEvent(eventId);
  const ticketId = input.ticket_id ?? null;

  if (ticketId !== null) {
    const ticket = await requireSellableTicket(eventId, ticketId);
    if (Number(ticket.price) > 0) {
      throw new BadRequestError("This ticket is paid — start a checkout instead");
    }
    if (input.quantity > ticket.max_per_order) {
      throw new BadRequestError(`At most ${ticket.max_per_order} of this ticket per order`);
    }
  }

  const existing = await regRepo.findActiveRegistration(eventId, ticketId, userId);
  if (existing) throw new ConflictError("You are already registered for this event");

  const registration = await regRepo.db().transaction(async (trx) => {
    await regRepo.reapExpiredHolds(eventId, trx);

    if (event.max_capacity !== null) {
      await regRepo.lockEventForCapacity(eventId, trx);
      await assertEventCapacity(event, input.quantity, trx);
    }

    if (ticketId !== null && !(await regRepo.claimSeats(ticketId, input.quantity, trx))) {
      throw new ConflictError("This ticket is sold out");
    }

    // A duplicate here violates event_registrations_unique_per_user and rolls the
    // claim above back with it — that is exactly the behaviour we want.
    return regRepo.insertRegistration(
      {
        event_id: eventId,
        ticket_id: ticketId,
        platform_user_id: userId,
        status: "registered",
        quantity: input.quantity,
        total_paid: 0,
        payment_status: "free",
        notes: input.notes ?? null,
      },
      trx,
    );
  });

  await publish({
    platform_user_ids: [userId],
    type: EVENT_NOTIFICATION_TYPES.registered,
    title: `You are registered for ${event.title}`,
    body: event.summary ?? null,
    reference_type: "event",
    reference_id: String(event.id),
    dedupe_key: `event-registration:${registration.id}`,
  });

  return registration;
}

export async function cancel(registrationId: number, userId: number) {
  const row = await regRepo
    .db()
    .transaction((trx) => regRepo.cancelRegistration(registrationId, userId, trx));
  if (!row) throw new NotFoundError("Registration not found");
  return row;
}

export async function listMine(userId: number, query: PaginationInput) {
  const { limit, offset } = paginationToOffset(query);
  const base = () =>
    regRepo
      .db()("event_registrations")
      .where("event_registrations.platform_user_id", userId)
      .whereNull("event_registrations.deleted_at");

  const [{ count }] = await base().count({ count: "*" });
  const rows = await base()
    .join("events", "events.id", "event_registrations.event_id")
    .leftJoin("event_tickets", "event_tickets.id", "event_registrations.ticket_id")
    .select(
      "event_registrations.id",
      "event_registrations.status",
      "event_registrations.quantity",
      "event_registrations.total_paid",
      "event_registrations.payment_status",
      "event_registrations.check_in_at",
      "event_registrations.created_at",
      "event_tickets.name as ticket_name",
      "events.id as event_id",
      "events.title as event_title",
      "events.slug as event_slug",
      "events.starts_at",
      "events.ends_at",
      "events.cover_image_url",
      "events.event_type",
    )
    .orderBy("event_registrations.id", "desc")
    .limit(limit)
    .offset(offset);

  return buildPaginatedResponse(rows, Number(count), query);
}
