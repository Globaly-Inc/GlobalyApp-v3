// Handing the embed snippet to whoever actually pastes it.
//
// That person is an agency, a contractor or a colleague — NOT staff. An earlier version invited
// them into the org as a `developer` agent so they could sign in, which was wrong twice over: it
// put non-staff in the institution's user list, and it mailed them an invitation to join
// GlobalyApp they never asked for. Now the whole record is `ai_embed_developers` (20261005_001):
// an address, when the code last went to it, and how many times.
//
// That table lives in the TENANT schema — it is the org's own address book, not platform
// infrastructure — so every function here takes the caller's `req.db`, never masterKnex.

import type { Knex } from "knex";
import { config } from "../../../config.js";
import { createChildLogger } from "../../../shared/logger.js";
import { queueEmail } from "../../auth/auth.service.js";
import { embedSnippetEmail } from "../../../shared/mail/templates.js";
import { AppError } from "../../../shared/errors.js";
import * as embedRepo from "../repositories/embed.repository.js";

const logger = createChildLogger("embed-handoff");

/**
 * The one-line tag the customer pastes.
 *
 * Built here as well as in the portal (`frontend/src/app/business/ai-widget/components/widget-card.tsx`
 * `embedSnippet`), because an email has no browser origin to read. The two must stay identical —
 * change one, change the other.
 */
export function embedSnippet(embedKey: string): string {
  return `<script src="${config.WEB_APP_URL.replace(/\/$/, "")}/embed.js" data-key="${embedKey}" async></script>`;
}

/** One recipient as the portal card renders them. */
export interface DeveloperContact {
  id: number;
  email: string;
  last_sent_at: string | null;
  send_count: number;
}

const toContact = (row: embedRepo.EmbedDeveloperRow): DeveloperContact => ({
  id: row.id,
  email: row.email,
  last_sent_at: row.last_sent_at ? new Date(row.last_sent_at).toISOString() : null,
  send_count: row.send_count,
});

export async function listRecipients(db: Knex, configId: number): Promise<DeveloperContact[]> {
  return (await embedRepo.listDevelopers(db, configId)).map(toContact);
}

export async function forgetRecipient(db: Knex, configId: number, id: number): Promise<boolean> {
  return (await embedRepo.removeDeveloper(db, configId, id)) > 0;
}

export interface SendSnippetResult {
  /** Exactly the addresses whose mail was accepted. An array, not a joined line: the card merges
   *  these rows into the list it is already showing, and a display string cannot be merged. */
  sent: string[];
  /** Addresses whose mail was not accepted. The owner is told; nothing was recorded for them. */
  failed: string[];
  /** The recipient list after this send, so the card updates without a second round trip. */
  recipients: DeveloperContact[];
}

/**
 * Mail the snippet to each address and record the send.
 *
 * Awaited, not fire-and-forget. `queueEmail` already falls back to a direct send and only rejects
 * when BOTH the broker and the mailer refuse, so its resolution is a real "accepted" signal —
 * dropping it on the floor let the dialog say "we emailed the code" for mail that never left, and
 * stamped a `last_sent_at` on a send that never happened (Greptile). At most ten addresses behind
 * a 5/min limit, so waiting costs the owner nothing.
 *
 * The record follows the send for the same reason: a row is written only for mail we know was
 * accepted. An address that failed is reported back instead, and can simply be sent again.
 *
 * `failed` means THE MAIL DID NOT GO, and nothing else. Bookkeeping that fails after a delivered
 * mail is logged and swallowed, because the owner's only move on a failed address is to send it
 * again — and the one thing a resend must never do is re-mail somebody who already has the code
 * (Greptile). Addresses are independent: one failure never cancels or re-sends another.
 */
export async function sendSnippet(args: {
  /** The tenant's own connection — these rows live in their schema. */
  db: Knex;
  configId: number;
  embedKey: string;
  orgName: string;
  emails: string[];
}): Promise<SendSnippetResult> {
  const { db, configId, embedKey, orgName, emails } = args;
  // Deduped here too: the dialog dedupes what was typed, but this is the trust boundary and a
  // repeated address would otherwise be mailed twice.
  const recipients = [...new Set(emails)];

  const settled = await Promise.allSettled(recipients.map(async (to) => {
    await queueEmail({ to, ...embedSnippetEmail({ orgName, snippet: embedSnippet(embedKey) }) });
    // Past the point of no return: the mail is gone. The row is the org's address book, not the
    // deliverable, so losing it costs a "last sent" line — reporting the address as unsent would
    // cost the recipient a second copy.
    await embedRepo.recordSend(db, configId, to)
      .catch((err) => logger.warn("Embed snippet sent but not recorded", { to, err: String(err) }));
  }));

  const sent: string[] = [];
  const failed: string[] = [];
  for (const [i, outcome] of settled.entries()) {
    const to = recipients[i]!;
    if (outcome.status === "fulfilled") { sent.push(to); continue; }
    failed.push(to);
    logger.warn("Embed snippet email failed", { to, err: String(outcome.reason) });
  }

  // Nothing got out: the owner asked us to send mail and we sent none. A 200 here is the bug —
  // the dialog would close on a success toast naming addresses that were never written to.
  if (!sent.length) throw new AppError("We couldn't send the code. Please try again.", 502, "MAIL_FAILED");

  logger.info("Embed snippet sent", { configId, sent: sent.length, failed: failed.length });
  // Same rule one level up: a send that got out must not be reported as an error because the
  // read-back failed. A successful send always leaves at least one row, so an empty list here
  // can only mean the read failed — the card keeps what it already had.
  const after = await listRecipients(db, configId)
    .catch((err) => { logger.warn("Recipient list read failed after send", { configId, err: String(err) }); return []; });
  return { sent, failed, recipients: after };
}
