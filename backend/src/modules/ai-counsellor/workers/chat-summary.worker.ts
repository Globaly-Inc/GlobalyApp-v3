// Mails widget visitors a copy of their conversation, once they have asked for one.
//
// Run with: npm run job:chat-summary  (add --once for a single pass, e.g. from cron)
//
// Two triggers: the visitor confirming the end of the chat (due immediately), or thirty minutes
// of quiet after they went away (the fallback, because most people close a tab rather than press
// a button). Both require that they gave an address, which is what put the row in `pending`.
//
// An earlier 30-minute version WAS the only trigger, and that is what made it wrong — it inferred
// "we are finished" from "they stopped typing" and mailed people mid-conversation as though they
// had finished. Two things fixed that, and neither is the length of the window: the explicit
// confirmation that now exists alongside it, and copy that no longer claims a conversation was
// resolved when nobody said it was. With both in place the window is a delivery-speed dial, not a
// correctness one — CHAT_SUMMARY_FALLBACK_MINUTES moves it.
//
// Still a sweep rather than a queue job: the row IS the durable record, a publish would need
// the same retry ladder underneath it, and the enqueue path already carries a dedup key.
// Nothing is gained by adding a broker hop.
//
// The visitor rows live in each tenant's own schema, so this walks the schemas rather than
// reading one table. The walk is bounded to tenants that own at least one embed config.

import { masterKnex } from "../../../core/db/master-pool.js";
import { createSchemaKnex, schemaName } from "../../../core/db/knex.js";
import * as messagesRepo from "../repositories/messages.repository.js";
import { enqueue } from "../../enquiries/services/email-queue.service.js";
import {
  buildSummaryPrompt, summariseConversation, trimToCompleteSentence, worthSummarising,
} from "../lib/conversation-summary.js";
import { generateText, isConfigured as isGeminiConfigured } from "../../../shared/ai/gemini.js";
import type { VisitorRow } from "../services/visitor.service.js";
import { config } from "../../../config.js";
import { createChildLogger } from "../../../shared/logger.js";

const logger = createChildLogger("chat-summary-worker");

const TABLE = "ai_widget_visitors";

// Shorter than the old 5 minutes: on the confirmation path the visitor pressed "email me a
// summary" and is waiting for something they just asked for.
const pollMs = () => Number(process.env.CHAT_SUMMARY_POLL_MS) || 60_000;
/** How long an unconfirmed conversation stays quiet before the fallback sends anyway. */
const fallbackMinutes = () => Number(process.env.CHAT_SUMMARY_FALLBACK_MINUTES ?? 30);
/** Rows claimed per tenant per pass — bounds one sweep, not the backlog. */
const batchCap = () => Number(process.env.CHAT_SUMMARY_BATCH_CAP) || 100;
/** Matches the outbox's own ladder. Past this the row stays `failed` for a human to look at. */
const maxAttempts = () => Number(process.env.CHAT_SUMMARY_MAX_ATTEMPTS) || 5;

interface TenantSchema {
  schema: string;
  label: string;
}

/**
 * Every tenant schema that owns at least one embed widget.
 *
 * Deliberately NOT filtered on `is_active`: a visitor who handed over their email before the
 * institution switched its widget off is still owed the copy they were promised. Deactivating
 * a widget stops new conversations, not obligations from finished ones.
 */
async function widgetTenants(): Promise<TenantSchema[]> {
  const businesses = await masterKnex("ai_embed_configs as c")
    .join("businesses as b", "b.id", "c.business_id")
    .whereNotNull("b.schema_provisioned_at")
    .whereNull("b.deleted_at")
    .distinct("b.schema_name as schema", "b.subdomain as label");

  const institutions = await masterKnex("ai_embed_configs as c")
    .join("institutions as i", "i.id", "c.institution_id")
    .whereNotNull("i.schema_provisioned_at")
    .whereNull("i.deleted_at")
    .distinct("i.schema_name as schema", "i.subdomain as label");

  return [...businesses, ...institutions] as TenantSchema[];
}

/**
 * The written recap, or null to fall back to the raw transcript.
 *
 * Never throws. A summary email that fails because the model was rate-limited is a worse
 * outcome than a plainer one that arrives — the visitor asked for their conversation, not for
 * prose. Skipped entirely for very short chats and when no key is configured, so a deployment
 * without Gemini still mails transcripts rather than failing every row five times.
 */
async function writeSummary(
  conversation: ReturnType<typeof summariseConversation>,
  orgName: string | null,
): Promise<string | null> {
  if (!worthSummarising(conversation) || !isGeminiConfigured()) return null;

  try {
    const { system, prompt } = buildSummaryPrompt(conversation, orgName);
    // Sized for thinking PLUS answer, not for the answer alone. GEMINI_MODEL defaults to
    // gemini-3.5-flash, whose reasoning is drawn from this same budget — at 600 the recap was
    // mailed stopping mid-sentence, and at 2000 it was still being clipped. A ceiling costs
    // nothing on its own: billing follows the tokens actually generated, not the cap. The
    // prompt is what bounds the length; this only stops the cap doing it mid-word.
    const raw = await generateText({ system, prompt, maxTokens: 8000, temperature: 0.4 });

    // A clipped recap is cut back to its last finished sentence rather than thrown away —
    // three whole paragraphs beat the raw Q&A the transcript fallback would send instead.
    const summary = trimToCompleteSentence(raw);
    if (!summary) {
      logger.warn("Chat summary unusable — falling back to the transcript", {
        tail: raw.trim().slice(-80),
      });
      return null;
    }
    if (summary.length < raw.trim().length) {
      logger.info("Chat summary was clipped — trimmed to the last complete sentence", {
        dropped: raw.trim().length - summary.length,
      });
    }
    return summary;
  } catch (err) {
    logger.warn("Chat summary generation failed — falling back to the transcript", {
      err: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function processTenant(tenant: TenantSchema): Promise<number> {
  const db = createSchemaKnex(schemaName(tenant.schema), { min: 0, max: 1 });
  let sent = 0;

  try {
    // Two ways a summary becomes due, and the order matters for how this reads:
    //
    //   1. The visitor confirmed the end of the chat. Due immediately — they are waiting for it.
    //   2. They went quiet for the fallback window. Most people close a tab rather than press a
    //      button, and they were promised a summary when they handed over their address, so an
    //      unconfirmed conversation still gets one eventually.
    //
    // Thirty minutes — and it is the honest-copy change that makes that safe. While every
    // summary announced itself as "a recap of your chat", a short window mailed people who had
    // only stepped away as though they had finished, which is why it was widened to an hour. An
    // unconfirmed summary now claims nothing and simply offers to pick up where they left off,
    // so arriving early is no longer a false statement — only an earlier one.
    const cutoff = new Date(Date.now() - fallbackMinutes() * 60_000);

    const candidates: number[] = await db(TABLE)
      .where({ summary_status: "pending" })
      .whereNotNull("email")
      .where((q) =>
        q
          .where({ conversation_state: "end_confirmed" })
          // Measured from the visitor's last message, full stop.
          //
          // This used to be COALESCE(closed_at, last_activity_at), fed by a leave beacon on
          // pagehide/visibilitychange. It was removed because it could only ever DELAY the
          // email: closed_at is by definition later than the last message, so coalescing to it
          // pushed the deadline out — and visibilitychange fires on every tab switch, so a
          // visitor flicking between tabs reset the clock repeatedly. Knowing someone left is
          // a reason to stop waiting, not to wait longer from a later timestamp.
          .orWhere("last_activity_at", "<", cutoff),
      )
      .limit(batchCap())
      .pluck("id");

    if (!candidates.length) return 0;

    // Claim. The `summary_status = 'pending'` predicate is re-evaluated under the row lock,
    // so a second worker that selected the same ids a millisecond earlier gets nothing back
    // and cannot send the same summary twice.
    const claimed: VisitorRow[] = await db(TABLE)
      .whereIn("id", candidates)
      .where({ summary_status: "pending" })
      .update({
        summary_status: "processing",
        summary_attempts: db.raw("summary_attempts + 1"),
        updated_at: db.fn.now(),
      })
      .returning("*");

    for (const row of claimed) {
      try {
        if (!row.session_id || !row.email) {
          // Nothing to summarise and nowhere to send it. Terminal, not retriable.
          await db(TABLE).where({ id: row.id }).update({
            summary_status: "failed",
            summary_error: "No conversation or email on the visitor row",
            updated_at: db.fn.now(),
          });
          continue;
        }

        const widget = await masterKnex("ai_embed_configs")
          .where({ id: row.embed_config_id })
          .first("display_name", "embed_key");

        // Oldest-first, the whole thread — the summary covers the ENTIRE conversation, not
        // just what was said after the visitor handed over their email.
        const conversation = summariseConversation(await messagesRepo.findBySession(row.session_id));
        const { turns, courses } = conversation;

        const widgetName = widget?.display_name ?? null;
        const summary = await writeSummary(conversation, widgetName);

        await enqueue({
          dedupKey: `chat_summary:${tenant.schema}:${row.id}`,
          template: "chat_summary",
          recipientEmail: row.email,
          payload: {
            name: row.name ?? "there",
            org_name: widgetName,
            courses,
            // Both travel in the payload: the recap is the email, the transcript is what
            // renders if the recap came back null.
            summary,
            turns,
            // Which of the two triggers claimed this row — the visitor saying so, or us
            // inferring it from their silence. The claim predicate above already knows the
            // difference and until now discarded it, so every abandoned tab was mailed as
            // though the visitor had finished. Snapshotted here with everything else: the
            // payload is write-once, so a retry cannot revise it.
            confirmed_end: row.conversation_state === "end_confirmed",
            // Only restores the thread in the browser that started it — the widget keys its
            // thread on a localStorage fingerprint. On another device this opens a fresh chat
            // with the same counsellor, which is still the most useful place to land.
            conversation_url: `${config.WEB_APP_URL.replace(/\/$/, "")}/embed/${widget?.embed_key ?? ""}`,
          },
        });

        await db(TABLE).where({ id: row.id }).update({
          summary_status: "sent",
          summary_sent_at: db.fn.now(),
          summary_error: null,
          updated_at: db.fn.now(),
        });
        sent += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Back to pending while attempts remain, so the next pass retries it. attempts was
        // already incremented at claim time, which is what makes the ladder terminate.
        const exhausted = row.summary_attempts + 1 >= maxAttempts();
        await db(TABLE).where({ id: row.id }).update({
          summary_status: exhausted ? "failed" : "pending",
          summary_error: message.slice(0, 500),
          updated_at: db.fn.now(),
        });
        logger.error("Chat summary failed", { tenant: tenant.label, visitorId: row.id, exhausted, err: message });
      }
    }
  } finally {
    await db.destroy();
  }

  return sent;
}

let running = false;

async function tick() {
  if (running) {
    logger.warn("Previous chat summary sweep still running — skipping this tick");
    return;
  }
  running = true;
  try {
    const tenants = await widgetTenants();
    let total = 0;
    for (const t of tenants) {
      try {
        total += await processTenant(t);
      } catch (err) {
        // One tenant's un-migrated schema must not end the sweep for everyone else.
        logger.error("Chat summary sweep failed for tenant", {
          tenant: t.label,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
    logger.info(`Chat summary sweep: ${tenants.length} tenant(s), ${total} summary email(s)`);
  } catch (err) {
    logger.error("Chat summary sweep failed", { err: err instanceof Error ? err.message : String(err) });
  } finally {
    running = false;
  }
}

await tick();

if (process.argv.includes("--once")) {
  logger.info("Chat summary sweep complete (--once)");
  process.exit(0);
}

setInterval(tick, pollMs());
