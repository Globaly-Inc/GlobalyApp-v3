// Waitlist orchestration.
//
// Two rules shape everything here, both because the table is pure PII:
//
//   * The public result NEVER carries a column from the table. `already_registered`
//     is the one bit of state a caller learns, and only about the address they just
//     submitted — the same thing V2 returned. Anything more (a 409, an echoed row)
//     would turn the endpoint into an oracle for "is this person on the list".
//   * The admin listing is a named-column read, paginated.

import { createChildLogger } from "../../../shared/logger.js";
import { buildPaginatedResponse, paginationToOffset, type PaginationInput } from "../../../shared/pagination.js";
import { queueService } from "../../../shared/queue/queueService.js";
import { emailLayout, esc } from "../../../shared/mail/templates.js";
import { REGISTRANT_TYPE_LABELS, type RegistrantType } from "../consts.js";
import * as repo from "../repositories/waitlist.repository.js";
import type { RegisterWaitlistInput } from "../schemas/waitlist.schema.js";

const logger = createChildLogger("waitlist");

/** The confirmation mail. Reuses the shared brand layout — no second mail stack. */
function confirmationEmail(name: string, type: RegistrantType) {
  // The recipient did type this name themselves, but it still lands in an inbox as
  // markup, so it is escaped like any other user text (see templates.ts's esc note).
  const firstName = esc(name.split(" ")[0] || name);
  const label = esc(REGISTRANT_TYPE_LABELS[type]);
  return {
    subject: "You're on the Globaly waitlist",
    text:
      `You're on the list, ${name.split(" ")[0] || name}.\n\n` +
      `Thanks for registering your interest in Globaly's AI Education Discovery agents. ` +
      `We'll email you the moment it's ready to explore.\n\nRegistered as: ${REGISTRANT_TYPE_LABELS[type]}`,
    html: emailLayout({
      heading: `You're on the list, ${firstName}.`,
      body:
        `<p style="margin:0 0 16px">Thanks for registering your interest in <strong>Globaly's AI Education ` +
        `Discovery agents</strong>. We're building something new to help you find the right courses, ` +
        `institutions and pathways — and we'll email you the moment it's ready to explore.</p>` +
        `<p style="margin:0">Registered as: <strong>${label}</strong></p>`,
      footnote: "You'll only hear from us about the launch.",
    }),
  };
}

export async function register(input: RegisterWaitlistInput) {
  // The schema already trimmed and lower-cased; the table's CHECK is the backstop.
  const created = await repo.insertIfNew({
    email: input.email,
    name: input.name,
    registrant_type: input.type,
  });

  // Only a genuinely new registrant gets mail: a repeat submit must not re-spam, and
  // must not confirm to the sender that the address was already known.
  if (created) {
    const { subject, html, text } = confirmationEmail(input.name, input.type);
    try {
      await queueService.publish("emails", { to: input.email, subject, html, text });
    } catch (err) {
      // The row is already committed. A broker hiccup must not fail a sign-up that
      // succeeded — it is logged for replay instead.
      logger.error("Waitlist confirmation email could not be enqueued", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { ok: true as const, already_registered: !created };
}

export async function list(query: PaginationInput) {
  const { limit, offset } = paginationToOffset(query);
  const [rows, total] = await Promise.all([repo.list({ limit, offset }), repo.count()]);
  return buildPaginatedResponse(
    rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      type: row.registrant_type,
      created_at: row.created_at,
    })),
    total,
    query,
  );
}
