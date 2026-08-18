// Paid event tickets. Ports V1's create-event-payment / verify-event-payment
// with two behavioural changes, both deliberate:
//
//  1. SEATS ARE CLAIMED AT CHECKOUT, not at settlement. V1 checked availability,
//     opened a Checkout Session and only bumped sold_count in verify — so two
//     buyers could both pass the check, both pay, and oversell the ticket. Here
//     the claim happens first, inside the transaction that also creates the
//     pending registration, and the Stripe call sits inside that transaction so
//     a failure rolls the seats straight back.
//
//  2. SETTLEMENT MOVES NO LEDGER. Because the seats are already claimed, verify
//     and the webhook only flip payment_status pending → paid. That makes a
//     redelivered webhook idempotent by construction rather than by a
//     read-then-decide check: the UPDATE's `payment_status = 'pending'`
//     predicate matches zero rows the second time.
//
// FAIL CLOSED: this deployment has no Stripe keys. Auth, validation, capacity
// and every database write run first; only then does getStripeClient() throw a
// 503. There is no dev driver and no simulated success on a money path — the
// other-services module chooses differently, and money is why.

import { config } from "../../../config.js";
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from "../../../shared/errors.js";
import { createChildLogger } from "../../../shared/logger.js";
import { getStripeClient, StripeUnavailableError } from "../../billing/services/stripe.client.js";
import { SignatureVerificationError, verifySignature } from "../../billing/services/stripe.signature.js";
import * as repo from "../repositories/events.repository.js";
import * as regRepo from "../repositories/registrations.repository.js";
import { CHECKOUT_HOLD_MINUTES, EVENT_NOTIFICATION_TYPES } from "../consts.js";
import { requireRegistrableEvent, requireSellableTicket } from "./registrations.service.js";
import { publish } from "../../notifications/services/notifications.service.js";
import type { CheckoutInput } from "../schemas/events.schema.js";

const logger = createChildLogger("event-payments");

export interface CheckoutResult {
  url: string;
  registration_id: number;
  session_id: string;
}

export async function startCheckout(
  eventId: number,
  userId: number,
  input: CheckoutInput,
  origin: string | undefined,
): Promise<CheckoutResult> {
  const event = await requireRegistrableEvent(eventId);
  const ticket = await requireSellableTicket(eventId, input.ticket_id);

  const price = Number(ticket.price);
  if (!(price > 0)) throw new BadRequestError("This ticket is free, no payment needed");
  if (input.quantity > ticket.max_per_order) {
    throw new BadRequestError(`At most ${ticket.max_per_order} of this ticket per order`);
  }

  const buyer = await repo
    .db()("platform_users")
    .where({ id: userId })
    .select("id", "email")
    .first();
  if (!buyer?.email) throw new BadRequestError("No email on account");

  const existing = await regRepo.findActiveRegistration(eventId, ticket.id, userId);
  if (existing) throw new ConflictError("You are already registered for this event");

  const base = origin ?? config.WEB_APP_URL;
  const holdExpiresAt = new Date(Date.now() + CHECKOUT_HOLD_MINUTES * 60_000);
  const total = price * input.quantity;

  // One transaction: reap, claim, reserve, then call Stripe. A 503 (or any
  // other Stripe failure) throws out of the callback and Knex rolls the claim
  // and the pending registration back together.
  //
  // ponytail: the outbound call holds a pg connection for its duration. At this
  // scale that is free; swap to a compensating release if event checkout volume
  // ever rivals the pool size.
  return regRepo.db().transaction(async (trx) => {
    await regRepo.reapExpiredHolds(eventId, trx);

    if (event.max_capacity !== null) {
      await regRepo.lockEventForCapacity(eventId, trx);
      const taken = await regRepo.seatsTaken(eventId, trx);
      if (taken + input.quantity > event.max_capacity) throw new ConflictError("This event is full");
    }

    if (!(await regRepo.claimSeats(ticket.id, input.quantity, trx))) {
      throw new ConflictError("This ticket is sold out");
    }

    const registration = await regRepo.insertRegistration(
      {
        event_id: eventId,
        ticket_id: ticket.id,
        platform_user_id: userId,
        status: "registered",
        quantity: input.quantity,
        total_paid: total,
        payment_status: "pending",
        hold_expires_at: holdExpiresAt,
      },
      trx,
    );

    // Everything above is durable-in-transaction. Only now do we need the network.
    const session = await getStripeClient().createCheckoutSession({
      mode: "payment",
      priceId: ticket.stripe_price_id,
      unitAmount: Math.round(price * 100),
      currency: ticket.currency.toLowerCase(),
      productName: `${event.title} — ${ticket.name}`,
      quantity: input.quantity,
      customerId: null,
      customerEmail: buyer.email,
      successUrl: `${base}/events/${event.slug}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${base}/events/${event.slug}?payment=cancelled`,
      clientReferenceId: `event-registration:${registration.id}`,
      metadata: {
        event_id: String(eventId),
        ticket_id: String(ticket.id),
        registration_id: String(registration.id),
        platform_user_id: String(userId),
        quantity: String(input.quantity),
      },
    });

    if (!session.url) throw new BadRequestError("Stripe did not return a checkout url");

    await trx("event_registrations").where({ id: registration.id }).update({ stripe_session_id: session.id });
    return { url: session.url, registration_id: registration.id, session_id: session.id };
  });
}

export interface SettlementResult {
  success: true;
  already_verified: boolean;
}

/**
 * Buyer-initiated verification on return from Checkout. Proves ownership from
 * our own row (never from caller-supplied metadata) before settling.
 */
export async function verifyCheckout(sessionId: string, userId: number): Promise<SettlementResult> {
  const registration = await regRepo.findByStripeSession(sessionId);
  if (!registration) throw new NotFoundError("No registration for this checkout session");
  if (registration.platform_user_id !== userId) {
    throw new ForbiddenError("This purchase does not belong to you");
  }
  if (registration.payment_status === "paid") return { success: true, already_verified: true };

  const session = await getStripeClient().retrieveCheckoutSession(sessionId);
  if (session.payment_status !== "paid") throw new BadRequestError("Payment not completed");

  return settle(sessionId, registration.event_id, userId);
}

/** The one place a pending registration becomes paid. Safe to call any number of times. */
async function settle(sessionId: string, eventId: number, userId: number): Promise<SettlementResult> {
  const settled = await regRepo.db().transaction((trx) => regRepo.settlePayment(sessionId, trx));
  if (!settled) return { success: true, already_verified: true };

  const event = await repo.findEventById(eventId);
  await publish({
    platform_user_ids: [userId],
    type: EVENT_NOTIFICATION_TYPES.registered,
    title: `Your ticket for ${event?.title ?? "the event"} is confirmed`,
    body: null,
    reference_type: "event",
    reference_id: String(eventId),
    dedupe_key: `event-payment:${sessionId}`,
  });
  return { success: true, already_verified: false };
}

export interface WebhookResult {
  received: true;
  duplicate: boolean;
  handled: boolean;
  event_type: string;
}

// Stripe's payload shape is Stripe's, not ours; every read below narrows explicitly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StripeObject = Record<string, any>;

/**
 * Stripe webhook for event ticket checkouts.
 *
 * Authenticity comes from the HMAC over the raw body — no secret configured is a
 * 503, never "assume it's genuine". Exactly-once comes from settlePayment()'s
 * conditional UPDATE, so a redelivery reports duplicate:true and moves nothing.
 */
export async function handleWebhook(rawBody: Buffer, signature: string | undefined): Promise<WebhookResult> {
  if (!config.STRIPE_WEBHOOK_SECRET) {
    throw new StripeUnavailableError("Webhook secret is not configured");
  }
  try {
    verifySignature(rawBody, signature, config.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    if (err instanceof SignatureVerificationError) throw new BadRequestError(err.message);
    throw err;
  }

  const event = JSON.parse(rawBody.toString("utf8")) as { id: string; type: string; data: { object: StripeObject } };
  const object = event.data?.object ?? {};

  // Only checkout completions concern this module; billing owns the rest.
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    return { received: true, duplicate: false, handled: false, event_type: event.type };
  }
  if (object.payment_status !== "paid") {
    return { received: true, duplicate: false, handled: false, event_type: event.type };
  }

  const sessionId = typeof object.id === "string" ? object.id : null;
  const registration = sessionId ? await regRepo.findByStripeSession(sessionId) : undefined;
  if (!sessionId || !registration) {
    // Not one of ours (a billing checkout, most likely). Acknowledge, do nothing.
    return { received: true, duplicate: false, handled: false, event_type: event.type };
  }

  const result = await settle(sessionId, registration.event_id, registration.platform_user_id);
  logger.info("Event ticket settled", { session_id: sessionId, duplicate: result.already_verified });
  return { received: true, duplicate: result.already_verified, handled: true, event_type: event.type };
}
