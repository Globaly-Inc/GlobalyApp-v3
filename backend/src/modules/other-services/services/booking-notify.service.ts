// Emails for the booking handshake: a seller asked to answer, a buyer asked to pay, a buyer told no.
//
// Every function here swallows its own failures. The state change has already been written and the order is
// visible in both parties' lists, so SMTP being down must not fail the request that caused it — a buyer whose
// booking silently failed to submit is a worse outcome than one who has to open the app to see the answer.
//
// With no MAIL_HOST configured, mailerService logs `[DEV]` and returns, so this is a no-op locally.

import { queueEmail } from "../../auth/auth.service.js";
import { createChildLogger } from "../../../shared/logger.js";
import { config } from "../../../config.js";

const logger = createChildLogger("services-booking-notify");

const APP = () => config.APP_URL?.replace(/\/$/, "") ?? "";

/** Shared chrome so the three mails look like one family without a template engine. */
function wrap(heading: string, lines: string[], cta?: { label: string; href: string }) {
  const body = lines.map((l) => `<p style="margin:0 0 12px">${l}</p>`).join("");
  const button = cta
    ? `<p style="margin:20px 0"><a href="${cta.href}" style="background:#7f1d1d;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">${cta.label}</a></p>`
    : "";
  return `<div style="font-family:system-ui,sans-serif;max-width:520px"><h2 style="margin:0 0 16px">${heading}</h2>${body}${button}</div>`;
}

const money = (minor: number, currency: string) => `${currency} ${(minor / 100).toFixed(2)}`;

async function send(to: string | null | undefined, subject: string, html: string, context: string) {
  if (!to) return;
  try {
    await queueEmail({ to, subject, html });
  } catch (err) {
    logger.warn("Booking email failed", { context, err: err instanceof Error ? err.message : String(err) });
  }
}

/** The seller has a request waiting. Sent on submit — nothing is payable until they answer. */
export async function notifySellerOfRequest(input: {
  to: string | null;
  orderId: number;
  listingTitle: string;
  buyerName: string;
  amountMinor: number;
  currency: string;
  answers: { label: string; value: string }[];
}) {
  const details = input.answers.length
    ? `<ul style="margin:0 0 12px;padding-left:18px">${input.answers
        .map((a) => `<li><strong>${a.label}:</strong> ${a.value}</li>`)
        .join("")}</ul>`
    : "";
  await send(
    input.to,
    `New booking request: ${input.listingTitle}`,
    wrap(
      "You have a booking request",
      [
        `<strong>${input.buyerName}</strong> would like to book <strong>${input.listingTitle}</strong> for ${money(input.amountMinor, input.currency)}.`,
        details,
        "They cannot pay until you accept, so nothing is confirmed yet. If the timing does not work, decline and tell them why.",
      ],
      { label: "Review the request", href: `${APP()}/personal/earn/services/orders/${input.orderId}` },
    ),
    `request:${input.orderId}`,
  );
}

/** Accepted — this is the mail that asks for money, so it says exactly what happens next. */
export async function notifyBuyerAccepted(input: {
  to: string | null;
  orderId: number;
  listingTitle: string;
  providerName: string;
  amountMinor: number;
  currency: string;
}) {
  await send(
    input.to,
    `${input.providerName} accepted your booking — pay to confirm`,
    wrap(
      "Your booking was accepted",
      [
        `<strong>${input.providerName}</strong> accepted your request for <strong>${input.listingTitle}</strong>.`,
        `To confirm it, pay ${money(input.amountMinor, input.currency)}. Your booking is not held until then.`,
        "The payment is held by Globaly rather than passed straight to the provider.",
      ],
      { label: "Pay and confirm", href: `${APP()}/personal/earn/services/orders/${input.orderId}` },
    ),
    `accepted:${input.orderId}`,
  );
}

/** Declined — the reason is the whole point of the mail, so it leads. */
export async function notifyBuyerDeclined(input: {
  to: string | null;
  orderId: number;
  listingTitle: string;
  providerName: string;
  reason: string;
}) {
  await send(
    input.to,
    `${input.providerName} couldn't take your booking`,
    wrap(
      "Your booking wasn't accepted",
      [
        `<strong>${input.providerName}</strong> couldn't take your request for <strong>${input.listingTitle}</strong>.`,
        `<em>"${input.reason}"</em>`,
        "You have not been charged. Other providers may be able to help.",
      ],
      { label: "Browse services", href: `${APP()}/services` },
    ),
    `declined:${input.orderId}`,
  );
}
