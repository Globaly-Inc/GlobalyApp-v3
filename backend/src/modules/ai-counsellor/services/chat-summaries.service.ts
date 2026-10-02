// Each widget chat's staff-facing summary, refreshed after every message.
//
// Fire-and-forget from the guest route and the staff-reply route: it runs after the reply has
// been sent, so nobody waits on it. One extra model call per message, reading only that chat.

import type { Knex } from "knex";
import { generateText, isConfigured as isGeminiConfigured } from "../../../shared/ai/gemini.js";
import { createChildLogger } from "../../../shared/logger.js";
import * as messagesRepo from "../repositories/messages.repository.js";
import * as sessionsRepo from "../repositories/sessions.repository.js";
import {
  buildContactPrompt, buildSummaryPrompt, CONTACT_SUMMARY_SYSTEM, parseStaffSummary, STAFF_SUMMARY_SYSTEM,
  summariseConversation, worthSummarising,
} from "../lib/conversation-summary.js";

const logger = createChildLogger("chat-summaries");

/**
 * Rewrite one chat's summary from its transcript.
 *
 * Two messages close together each start a refresh. Whichever finishes saves only if the chat's
 * message count is still what it read — so an older summary never lands on top of a newer chat,
 * and the newest message's refresh is the one that sticks. Never throws.
 */
export async function refreshChatSummary(
  sessionId: number,
  orgName: string | null,
  /** The visitor whose contact summary follows this chat's, when known. */
  contact?: { db: Knex; visitorId: number },
): Promise<void> {
  if (!isGeminiConfigured()) return;
  try {
    const session = await sessionsRepo.findById(sessionId);
    if (!session) return;
    const conversation = summariseConversation(await messagesRepo.findBySession(sessionId));
    if (!worthSummarising(conversation)) return;

    const { prompt } = buildSummaryPrompt(conversation, orgName);
    const parsed = parseStaffSummary(
      await generateText({ system: STAFF_SUMMARY_SYSTEM, prompt, maxTokens: 8000, temperature: 0.2 }),
    );
    if (!parsed) return;

    const program = conversation.program;
    const saved = await sessionsRepo.saveSummaryIfUnchanged(sessionId, session.message_count, {
      title: parsed.title,
      text: parsed.brief,
      open: parsed.open,
      next_step: parsed.next_step,
      program: program ? { name: program.name, city: program.city ?? null } : null,
      topics: conversation.courses,
      generated_at: new Date().toISOString(),
    });
    // The contact summary is built from the chat summaries, so it follows the one just written.
    if (saved && contact) await refreshContactSummary(contact.db, contact.visitorId);
  } catch (err) {
    logger.warn("Chat summary refresh failed", { sessionId, err: err instanceof Error ? err.message : String(err) });
  }
}

const TABLE = "ai_widget_visitors";

/** What the contact summary may read about the person: their own stated details, nothing internal. */
const PROFILE_COLUMNS = [
  "name", "age", "gender", "nationality", "study_preference",
  "qualifications", "language_tests", "academic_tests", "work_experiences",
] as const;

/**
 * Rewrite a visitor's CONTACT summary: the whole person, from their profile and every chat's own
 * summary — never the raw transcripts, so it is one short call however many chats there are.
 * Runs after each chat summary and each profile edit, and from the worker's backfill.
 *
 * Returns whether a new summary was written. Never throws. A visitor with no summarised chat yet
 * is stamped with an empty contact summary, which keeps the backfill from picking them up again.
 */
export async function refreshContactSummary(db: Knex, visitorId: number): Promise<boolean> {
  try {
    const row = await db(TABLE).where({ id: visitorId }).first("visitor_key", "embed_config_id", "summary", ...PROFILE_COLUMNS);
    if (!row) return false;
    const { visitor_key, embed_config_id, summary: previous, ...profile } = row as Record<string, unknown> & {
      visitor_key: string; embed_config_id: number; summary: sessionsRepo.ChatSummaryJson | null;
    };
    const chats = (await sessionsRepo.findChatsByVisitor(visitor_key, embed_config_id)).filter((c) => c.summary?.text);

    let contact: ReturnType<typeof parseStaffSummary> = null;
    if (chats.length && isGeminiConfigured()) {
      const prompt = buildContactPrompt({
        profile,
        chats: chats.map((c) => ({
          title: c.summary?.title ?? null,
          started: new Date(c.created_at).toISOString().slice(0, 10),
          ended: c.ended_at != null,
          text: c.summary!.text!,
        })),
      });
      contact = parseStaffSummary(await generateText({ system: CONTACT_SUMMARY_SYSTEM, prompt, maxTokens: 8000, temperature: 0.2 }));
    }
    // A failed or skipped call keeps the previous contact text; nothing is lost, the next message retries.
    const kept = previous?.kind === "contact" ? previous : null;
    const latest = [...chats].reverse().find((c) => c.summary?.program)?.summary?.program ?? null;
    await db(TABLE).where({ id: visitorId }).update({
      summary: JSON.stringify({
        kind: "contact",
        text: contact?.brief ?? kept?.text ?? null,
        open: contact?.open ?? kept?.open ?? [],
        next_step: contact?.next_step ?? kept?.next_step ?? null,
        program: latest,
        topics: [...new Set(chats.flatMap((c) => c.summary?.topics ?? []))],
        // What it was built from, for the card's footer ("Built from 2 chats and 6 profile details").
        chat_count: chats.length,
        detail_count: Object.values(profile).filter((v) => v != null && v !== "" && !(Array.isArray(v) && !v.length)).length,
        generated_at: contact ? new Date().toISOString() : kept?.generated_at ?? new Date().toISOString(),
      }),
    });
    return !!contact;
  } catch (err) {
    logger.warn("Contact summary refresh failed", { visitorId, err: err instanceof Error ? err.message : String(err) });
    return false;
  }
}
