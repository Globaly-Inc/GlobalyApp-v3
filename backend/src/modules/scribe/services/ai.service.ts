// The AI half of scribe: live coaching, the post-session review, translation and
// the transcription token.
//
// EVERY function here obeys the same order, and the order is the design:
//
//   1. ownership + consent          (session.service.requireConsentedSession)
//   2. session state               (a reviewed session is closed)
//   3. reads from the DATABASE     (the transcript, never the request body)
//   4. idempotency                 (already generated? return it, charge nothing)
//   5. credit pre-flight           (402 before the provider, not after)
//   6. assert the provider         (503 — nothing charged, nothing lost)
//   7. call the provider
//   8. persist                     (checked)
//   9. settle the charge           (idempotency-keyed, through billing's ledger)
//
// V1 got several of these wrong and each one is a defect, not a spec:
//  * scribe-coaching took `transcript_lines` from the REQUEST BODY and never read
//    scribe_transcripts, so the counsellor could be coached on a transcript that
//    was never recorded (D-E3-11);
//  * it deducted a credit only `if (remaining > 0)`, so once the pool hit zero it
//    kept calling the paid gateway free of charge on a 60-second timer, for ever,
//    and returned 200 with `remaining: 0` (D-E3-12);
//  * it wrote `increment_business_ai_member_usage` but never read the per-member
//    monthly cap that the sibling business-ai-counselor DOES enforce — scribe was
//    a bypass for the whole credit-cap system (D-E3-13);
//  * scribe-review charged NOTHING at all while being the most expensive call in
//    the feature (D-E3-2), and 500'd on the unique constraint when retried,
//    having paid for a second full generation it then threw away (D-E3-14);
//  * scribe-save returned `{success:true}` unconditionally, so a wrong review id
//    saved nothing, marked the session complete and reported success (D-E3-15).
//
// THERE IS NO SECOND LEDGER. Spend goes through billing/services/credits.service
// with the `ai_deduct` type that already exists, keyed on the session and action
// so a retry cannot double-charge.

import type { Knex } from "knex";
import { BadRequestError, ConflictError, NotFoundError } from "../../../shared/errors.js";
import { createChildLogger } from "../../../shared/logger.js";
import * as billing from "../../billing/services/credits.service.js";
import { InsufficientCreditsError } from "../../billing/errors.js";
import {
  AI_TRANSACTION_TYPE,
  COACHING_CREDITS,
  LEDGER_REFERENCE_TYPE,
  MAX_SUGGESTED_QUESTIONS,
  REVIEW_CREDITS,
  TRANSLATE_CREDITS,
} from "../consts.js";
import * as prompts from "../lib/prompts.js";
import * as repo from "../repositories/scribe.repository.js";
import {
  GeneratedCoachingSchema,
  GeneratedReviewSchema,
} from "../schemas/scribe.schema.js";
import {
  assertScribeAiConfigured,
  generateJson,
  getScribeAiProvider,
} from "./coaching.provider.js";
import {
  assertTranscriptionConfigured,
  getTranscriptionProvider,
} from "./transcription.provider.js";
import { requireConsentedSession } from "./session.service.js";

const logger = createChildLogger("scribe-ai");

export interface AiContext {
  /** Tenant Knex — the transcript lives in the business's own schema. */
  db: Knex;
  /** Master id of the owning business. The wallet is the business's. */
  businessId: number;
  businessType: string | null;
  counselorId: number;
}

/**
 * Refuse an empty wallet BEFORE the provider is reached. This is the gate V1
 * never had: it read the balance, called the model regardless, and then skipped
 * the debit when the pool was empty.
 */
async function assertCredits(businessId: number, amount: number): Promise<void> {
  const { balance } = await billing.getBalance(businessId);
  if (balance < amount) throw new InsufficientCreditsError(amount, balance);
}

/** One key per (session, action, sequence) so a retry settles once. */
function spendKey(sessionId: number, action: string, seq: string): string {
  return `scribe:${sessionId}:${action}:${seq}`;
}

async function settle(
  ctx: AiContext,
  sessionId: number,
  action: string,
  seq: string,
  amount: number,
  model: string,
) {
  try {
    const { balance } = await billing.spendCredits(
      ctx.businessId,
      {
        amount,
        transaction_type: AI_TRANSACTION_TYPE,
        description: `Scribe ${action} (${model})`,
        reference_type: LEDGER_REFERENCE_TYPE,
        reference_id: String(sessionId),
        idempotency_key: spendKey(sessionId, action, seq),
      },
      ctx.counselorId,
    );
    return balance;
  } catch (err) {
    // The work is already done and persisted; a settlement failure must not
    // delete it. Logged loudly instead of being swallowed into a success reply.
    logger.error("scribe credit settlement failed", {
      sessionId,
      action,
      err: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

// ── Transcription token (V1 scribe-token) ───────────────────────────────────

/**
 * Every guard runs; then the provider is asked for, and in this environment that
 * is an honest 503. V1 additionally minted tokens for sessions in ANY state, with
 * no rate limit and no consent check — one session id bought unlimited OpenAI
 * ephemeral keys (D-E3-16).
 */
export async function mintTranscriptionToken(ctx: AiContext, sessionId: number) {
  const session = await requireConsentedSession(ctx.db, sessionId, ctx.counselorId);
  if (session.status !== "active") {
    throw new ConflictError("Only an active session can be transcribed");
  }
  assertTranscriptionConfigured();
  return getTranscriptionProvider().mintEphemeralToken();
}

// ── Live coaching (V1 scribe-coaching) ──────────────────────────────────────

export async function generateCoaching(ctx: AiContext, sessionId: number) {
  const session = await requireConsentedSession(ctx.db, sessionId, ctx.counselorId);
  if (session.status === "reviewed") {
    throw new ConflictError("This session has been reviewed");
  }

  // The transcript comes from the database, not from the caller.
  const lines = (await repo.listTranscripts(ctx.db, sessionId)) as prompts.TranscriptLine[];
  if (lines.length === 0) throw new BadRequestError("No transcript recorded for this session yet");

  await assertCredits(ctx.businessId, COACHING_CREDITS);
  assertScribeAiConfigured();
  const provider = getScribeAiProvider();

  const raw = await generateJson<unknown>(provider, {
    system: prompts.coachingSystemPrompt(ctx.businessType),
    prompt: prompts.coachingPrompt(lines),
    maxTokens: 800,
    temperature: 0.3,
  });
  const parsed = GeneratedCoachingSchema.parse(raw);

  const snapshot = await repo.insertCoachingSnapshot(ctx.db, {
    session_id: sessionId,
    running_summary: parsed.running_summary ?? null,
    suggested_questions: parsed.suggested_questions.slice(0, MAX_SUGGESTED_QUESTIONS),
    flagged_concerns: parsed.flagged_concerns,
    // V1 declared this column and never wrote it, while its own client type
    // required it — so `topics_covered` was `undefined` at runtime under a
    // non-optional type (D-E3-17).
    topics_covered: parsed.topics_covered,
    topics_remaining: parsed.topics_remaining,
  });

  // Sequenced by the snapshot's own id: each 60-second tick is a distinct spend,
  // and a retry of the same tick reuses the same key only if it reaches the same
  // snapshot — which it cannot, so every persisted snapshot is charged exactly
  // once and an unpersisted one is charged not at all.
  const balance = await settle(
    ctx,
    sessionId,
    "coaching",
    String(snapshot.id),
    COACHING_CREDITS,
    provider.model,
  );

  return { snapshot, balance: { remaining: balance } };
}

export async function listCoaching(ctx: AiContext, sessionId: number, limit: number) {
  await requireConsentedSession(ctx.db, sessionId, ctx.counselorId);
  return { data: await repo.listCoachingSnapshots(ctx.db, sessionId, limit) };
}

// ── Post-session review (V1 scribe-review) ──────────────────────────────────

/**
 * IDEMPOTENT. A review already generated is returned as-is and charged nothing.
 * V1 hit the `UNIQUE (session_id)` constraint on the second call and answered
 * 500 "Failed to generate review" — for a session that in fact had a perfectly
 * good review — after paying for the whole generation again.
 */
export async function generateReview(ctx: AiContext, sessionId: number) {
  const session = await requireConsentedSession(ctx.db, sessionId, ctx.counselorId);
  if (session.status === "active") {
    throw new ConflictError("End the session before generating its review");
  }

  const existing = await repo.findReview(ctx.db, sessionId);
  if (existing) return { review: existing, generated: false };

  const lines = (await repo.listTranscripts(ctx.db, sessionId)) as prompts.TranscriptLine[];
  if (lines.length === 0) throw new BadRequestError("No transcript recorded for this session");

  await assertCredits(ctx.businessId, REVIEW_CREDITS);
  assertScribeAiConfigured();
  const provider = getScribeAiProvider();

  const raw = await generateJson<unknown>(provider, {
    system: prompts.reviewSystemPrompt(),
    prompt: prompts.reviewPrompt(lines),
    maxTokens: 2000,
    temperature: 0.2,
  });
  const parsed = GeneratedReviewSchema.parse(raw);

  const review = await repo.insertReview(ctx.db, {
    session_id: sessionId,
    full_summary: parsed.full_summary ?? null,
    action_items: parsed.action_items,
    course_recommendations: parsed.course_recommendations,
    concerns: parsed.concerns,
  });

  const balance = await settle(
    ctx,
    sessionId,
    "review",
    String(review.id),
    REVIEW_CREDITS,
    provider.model,
  );

  return { review, generated: true, balance: { remaining: balance } };
}

/**
 * V1 scribe-save. The counsellor's edit of the draft, which is what makes it
 * their record of the meeting: `saved_at` goes non-NULL and the session becomes
 * `reviewed`.
 *
 * The UPDATE's affected row is CHECKED. V1 filtered on a body-supplied
 * `review_id`, and a PostgREST update matching zero rows is not an error — so a
 * wrong id saved nothing, still marked the session complete, and returned
 * `{success:true}`. Here the review is addressed by session, which the caller has
 * already been proven to own, and a missing row is a 404.
 */
export async function saveReview(
  ctx: AiContext,
  sessionId: number,
  input: {
    counselor_notes?: string | null;
    full_summary?: string | null;
    action_items?: unknown[];
    course_recommendations?: unknown[];
    concerns?: unknown[];
  },
) {
  const session = await requireConsentedSession(ctx.db, sessionId, ctx.counselorId);
  if (session.status === "active") {
    throw new ConflictError("End the session before saving its review");
  }

  return ctx.db.transaction(async (trx) => {
    const existing = await repo.findReview(trx, sessionId);
    if (!existing) throw new NotFoundError("Review not found — generate it first");

    const values: Record<string, unknown> = { saved_at: trx.fn.now() };
    if (input.counselor_notes !== undefined) values.counselor_notes = input.counselor_notes;
    if (input.full_summary !== undefined) values.full_summary = input.full_summary;
    if (input.action_items !== undefined) values.action_items = JSON.stringify(input.action_items);
    if (input.course_recommendations !== undefined) {
      values.course_recommendations = JSON.stringify(input.course_recommendations);
    }
    if (input.concerns !== undefined) values.concerns = JSON.stringify(input.concerns);

    const review = await repo.updateReview(trx, sessionId, values);
    if (!review) throw new NotFoundError("Review not found");

    const updated = await repo.updateSession(trx, sessionId, ctx.counselorId, {
      status: "reviewed",
    });
    if (!updated) throw new NotFoundError("Session not found");

    return { review, session: updated };
  });
}

// ── Translation (V1 scribe-translate) ───────────────────────────────────────

/**
 * Session- and chunk-scoped, consent-gated, metered, and it writes the result
 * SERVER-SIDE.
 *
 * V1's scribe-translate took `{ text }` and nothing else: no session, no
 * business, no ownership, no credit, no rate limit — an open Gemini proxy on the
 * business's key for any authenticated account on the platform (D-E3-18) — and
 * the persistence half was done by the browser under RLS, so it silently no-oped
 * whenever the row was not visible (D-E3-19).
 */
export async function translateChunk(ctx: AiContext, sessionId: number, chunkIndex: number) {
  await requireConsentedSession(ctx.db, sessionId, ctx.counselorId);

  const chunk = await repo.findTranscriptChunk(ctx.db, sessionId, chunkIndex);
  if (!chunk) throw new NotFoundError("Transcript chunk not found");
  if (chunk.translation) return { chunk, translated: false };
  // V1's own short-circuit: ASCII-only text is already English.
  if (!prompts.needsTranslation(chunk.text)) return { chunk, translated: false };

  await assertCredits(ctx.businessId, TRANSLATE_CREDITS);
  assertScribeAiConfigured();
  const provider = getScribeAiProvider();

  const translation = (
    await provider.generate({
      system: prompts.translateSystemPrompt(),
      prompt: prompts.translatePrompt(chunk.text),
      maxTokens: 400,
      temperature: 0.1,
    })
  ).trim();
  // A gateway that returns nothing is a failure, not "no translation needed".
  // V1 collapsed both into 200 {"translation": null}.
  if (!translation) throw new BadRequestError("Translation provider returned nothing");

  const updated = await repo.updateTranslation(ctx.db, sessionId, chunkIndex, translation);
  if (!updated) throw new NotFoundError("Transcript chunk not found");

  const balance = await settle(
    ctx,
    sessionId,
    "translate",
    String(chunkIndex),
    TRANSLATE_CREDITS,
    provider.model,
  );

  return { chunk: updated, translated: true, balance: { remaining: balance } };
}
