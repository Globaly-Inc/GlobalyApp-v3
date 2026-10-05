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
  /** Readable list of who it went to, for the confirmation line. */
  sent_to: string;
  /** The recipient list after this send, so the card updates without a second round trip. */
  recipients: DeveloperContact[];
}

/**
 * Mail the snippet to each address and record the send.
 *
 * The record is written BEFORE the mail is queued: `queueEmail` is fire-and-forget by design (a
 * mail outage must not fail the request), so a send that is never recorded would be invisible,
 * while a recorded send whose mail bounced is at least something the owner can re-send from.
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

  for (const to of recipients) {
    await embedRepo.recordSend(db, configId, to);
    queueEmail({
      to,
      ...embedSnippetEmail({ orgName, snippet: embedSnippet(embedKey) }),
    }).catch((err) => logger.warn("Embed snippet email failed", { to, err: err.message }));
  }

  logger.info("Embed snippet sent", { configId, count: recipients.length });
  return { sent_to: recipients.join(", "), recipients: await listRecipients(db, configId) };
}
