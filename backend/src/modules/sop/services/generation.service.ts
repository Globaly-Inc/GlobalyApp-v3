// Drafting. The expensive path, and the one with the money on it.
//
// THE ORDER IS THE DESIGN, and every step of it is a V1 defect turned into a rule:
//
//   1. ownership              — the session is the caller's, or it is a 404
//   2. readiness              — the questionnaire is complete
//   3. idempotency            — already drafted? return it, charge nothing, call nothing
//   4. reads from the DATABASE — answers, snapshot, sop_config, sop_country_guides
//   5. CREDIT PRE-FLIGHT      — 402 here, before the provider, with no side effects
//   6. database writes        — session → `generating`, so state is durable first
//   7. assert the provider    — 503, questionnaire intact, session `pending_provider`
//   8. call the provider      — a failure or an empty answer is a 502, never a draft
//   9. persist the document   — version 1, current
//  10. settle the charge      — through ai-counsellor's metering, one ledger, once
//
// V1's sop-generate reached `handleStage2Refine` and `handleQualityCheck` BEFORE it
// resolved a wallet at all, so two of its four paid model calls were free and
// unlimited for anyone with a session id (defect D-E5-4) — the same shape as the
// scribe-coaching hole Wave E3 found. Steps 5 and 7 are separately mutation-tested
// because each is load-bearing on its own: removing 5 lets an empty wallet reach a
// working provider; removing 7 lets an unconfigured platform reach a fabricated draft.
//
// THERE IS NO SECOND LEDGER. Spend goes through ai-counsellor's metering.service, which
// writes the `ai_usage_events` row and the wallet debit in one transaction keyed on a
// per-turn idempotency key. `sop_generation_logs` is the feature's own audit trail —
// what was attempted, by whom, and what it cost — not a parallel accounting of money.

import { randomUUID } from "node:crypto";
import { BadRequestError, ConflictError } from "../../../shared/errors.js";
import { createChildLogger } from "../../../shared/logger.js";
import * as creditService from "../../ai-counsellor/services/credit.service.js";
import * as metering from "../../ai-counsellor/services/metering.service.js";
import type { ChatScope } from "../../ai-counsellor/services/scope.js";
import { LOG_ACTION_DRAFT, REQUIRED_QUESTION_KEYS, type DocumentType } from "../consts.js";
import { analyse, type SopLimits } from "../lib/analysis.js";
import { buildSystemPrompt, draftInstruction } from "../lib/prompt.js";
import * as repo from "../repositories/sop.repository.js";
import {
  assertSopAiConfigured,
  generateDraft,
  getSopAiProvider,
  SopAiUnavailableError,
} from "./sop-ai.provider.js";
import { isReady, requireOwnSession } from "./session.service.js";

const logger = createChildLogger("sop-generation");

/**
 * An SOP is always personal. The scope is built here rather than by
 * ai-counsellor's `resolveScope`, so a caller holding a business JWT cannot spend a
 * business wallet on their own private statement of purpose.
 */
function personalScope(studentId: number): ChatScope {
  return { ownerType: "user", userId: studentId, businessId: null };
}

function limitsOf(config: repo.ConfigRow): SopLimits {
  return {
    min_words: config.min_words,
    max_words: config.max_words,
    max_chars: config.max_chars,
    banned_phrases: config.banned_phrases ?? [],
  };
}

/**
 * Which documents this destination requires, from sop_config alone.
 *
 * V1's `documentTypesForCountry` cross-checked a hard-coded `DUAL_DOC_COUNTRIES` set
 * against the config rows; the set and the seed data agreed, so the constant was dead
 * weight with a second place to drift. The seeded rows are the answer.
 */
export function documentTypesFor(configRows: repo.ConfigRow[]): DocumentType[] {
  return configRows.map((row) => row.document_type);
}

export interface DestinationContext {
  countryCode: string;
  config: repo.ConfigRow[];
  guide: repo.GuideRow | null;
}

export async function loadDestination(countryId: number | null): Promise<DestinationContext> {
  const countryCode = countryId ? ((await repo.findCountryIso2(countryId)) ?? "") : "";
  if (!countryCode) return { countryCode: "", config: [], guide: null };
  const [config, guide] = await Promise.all([
    repo.listConfig(countryCode),
    repo.findGuide(countryCode),
  ]);
  return { countryCode, config, guide: guide ?? null };
}

export async function getDestinationConfig(countryCode: string) {
  const [config, guide] = await Promise.all([
    repo.listConfig(countryCode),
    repo.findGuide(countryCode),
  ]);
  return {
    country_code: countryCode,
    document_types: documentTypesFor(config),
    config,
    guide: guide ?? null,
    required_question_keys: [...REQUIRED_QUESTION_KEYS],
  };
}

export async function generate(sessionId: number, studentId: number) {
  // 1 — ownership.
  const session = await requireOwnSession(sessionId, studentId);

  // 3 — idempotency, before anything is spent. V1's equivalent had none: a second
  // stage1_draft charged again and inserted a second version-1 row, which (with no
  // uniqueness on the current flag) left two drafts both claiming to be current.
  const existing = await repo.listCurrentDocuments(sessionId);
  if (existing.length > 0) {
    return { generated: false, documents: existing, session };
  }

  // 2 — readiness, from the stored answers.
  const answers = await repo.listAnswers(sessionId);
  if (!isReady(answers)) {
    throw new BadRequestError("Answer every required question before generating a draft");
  }

  // 4 — destination reference data.
  const destination = await loadDestination(session.country_id);
  const documentTypes = documentTypesFor(destination.config);
  if (documentTypes.length === 0) {
    throw new ConflictError(
      "No SOP template is configured for this destination — pick a supported country",
    );
  }

  const scope = personalScope(studentId);

  // 5 — the credit gate. Nothing has been written yet, so a refusal costs nothing and
  // leaves no trace: not a status change, not an audit row, not a usage event.
  await creditService.assertSpendable(scope);

  // 6 — durable state BEFORE the provider is touched.
  await repo.updateSessionState(sessionId, { status: "generating", stage: "stage1_draft" });

  // 7 — the provider assertion. An unconfigured platform stops here, honestly.
  try {
    assertSopAiConfigured();
  } catch (err) {
    if (err instanceof SopAiUnavailableError) {
      await repo.updateSessionState(sessionId, { status: "pending_provider" });
      await repo.insertLog({
        session_id: sessionId,
        student_id: studentId,
        initiated_by: studentId,
        action: LOG_ACTION_DRAFT,
        status: "failed",
        // The client is told 503 and nothing more; the reason lives here.
        metadata: { reason: "provider_unconfigured" },
      });
    }
    throw err;
  }

  const provider = getSopAiProvider();
  const turnId = randomUUID();

  let promptTokens = 0;
  let completionTokens = 0;
  const drafts: Array<{ documentType: DocumentType; text: string; config: repo.ConfigRow }> = [];

  // 8 — the model. Anything other than usable prose ends the request; nothing is
  // persisted and nothing is charged.
  try {
    for (const config of destination.config) {
      const limits = limitsOf(config);
      const system = buildSystemPrompt({
        countryCode: destination.countryCode,
        documentType: config.document_type,
        limits,
        complianceRules: config.compliance_rules ?? {},
        guide: destination.guide,
        profileSnapshot: session.profile_snapshot ?? {},
        answers: answers.map((a) => ({ question_key: a.question_key, answer: a.answer })),
      });

      const result = await generateDraft(provider, {
        system,
        prompt: draftInstruction(config.document_type),
        maxTokens: 2_000,
        temperature: 0.7,
      });
      promptTokens += result.usage.promptTokens;
      completionTokens += result.usage.completionTokens;
      drafts.push({ documentType: config.document_type, text: result.text, config });
    }
  } catch (err) {
    await repo.updateSessionState(sessionId, { status: "failed" });
    await repo.insertLog({
      session_id: sessionId,
      student_id: studentId,
      initiated_by: studentId,
      action: LOG_ACTION_DRAFT,
      status: "failed",
      metadata: { reason: err instanceof Error ? err.message : "provider_error" },
    });
    logger.warn("SOP generation failed", {
      sessionId,
      err: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  // 9 — persist. Version 1 of each document, current, with its analysis.
  const documents: repo.DocumentRow[] = [];
  for (const draft of drafts) {
    const analysis = analyse(draft.text, limitsOf(draft.config));
    documents.push(
      await repo.insertDocument({
        session_id: sessionId,
        created_by: studentId,
        document_type: draft.documentType,
        version: 1,
        content: draft.text,
        word_count: analysis.word_count,
        char_count: analysis.char_count,
        quality_score: analysis.quality_score,
        quality_breakdown: analysis.quality_breakdown,
        edit_depth_pct: 0,
        analysis: analysis as unknown as Record<string, unknown>,
      }),
    );
  }
  await repo.updateSessionState(sessionId, { status: "generated", stage: "stage1_draft" });

  // 10 — settle. One usage row, one debit, in one transaction, keyed on turnId.
  const settlement = await metering.settleTurn({
    turnId,
    scope,
    sessionId: null,
    messageId: null,
    model: provider.model,
    promptTokens,
    completionTokens,
    outcome: "complete",
  });

  await repo.insertLog({
    session_id: sessionId,
    student_id: studentId,
    initiated_by: studentId,
    action: LOG_ACTION_DRAFT,
    credits_charged: settlement.charged,
    status: "success",
    metadata: {
      model: provider.model,
      document_types: documentTypes,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
    },
  });

  return { generated: true, documents, charged: settlement.charged };
}
