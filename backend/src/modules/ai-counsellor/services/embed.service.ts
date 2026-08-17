// Embed-mode helpers shared by the authenticated (/messages + x-embed-key) and
// guest (/guest/messages + embed_key) chat flows.

import * as embedRepo from "../repositories/embed.repository.js";
import * as knowledgeRepo from "../repositories/knowledge.repository.js";
import { NotFoundError, ForbiddenError, TooManyRequestsError } from "../../../shared/errors.js";

export type EmbedContext = {
  config: embedRepo.EmbedConfigRow;
  /** extraction_jobs ids whose courses belong to this business; [] = no courses surface. */
  jobIds: string[];
};

/**
 * Resolve an embed key to an active, within-limit config.
 * Applies the lazy monthly reset before checking the limit.
 */
export async function resolveActiveConfig(embedKey: string): Promise<embedRepo.EmbedConfigRow> {
  const config = await embedRepo.findByEmbedKey(embedKey);
  if (!config) throw new NotFoundError("Embed configuration not found");
  if (!config.is_active) throw new ForbiddenError("This counsellor is currently unavailable");

  if (new Date(config.month_reset_at) <= new Date()) {
    await embedRepo.resetMonthlyUsage(config.id);
    config.credits_used_this_month = 0;
  }
  if (config.credits_used_this_month >= config.monthly_credit_limit) {
    throw new TooManyRequestsError("Monthly message limit reached for this counsellor");
  }
  return config;
}

/**
 * Course scoping for embed mode: courses whose extraction job URL matches the
 * business's website domain. No website or no match → empty scope (the AI answers
 * from shared knowledge only) — never leak other institutions' courses under a
 * business's brand.
 */
export async function buildEmbedContext(config: embedRepo.EmbedConfigRow): Promise<EmbedContext> {
  const website = await embedRepo.businessWebsite(config.business_id);
  const domain = website ? extractDomain(website) : null;
  const jobIds = domain ? await knowledgeRepo.jobIdsByInstitutionDomain(domain) : [];
  return { config, jobIds };
}

/** "https://www.uts.edu.au/courses" → "uts.edu.au" */
export function extractDomain(url: string): string | null {
  try {
    const host = new URL(url.includes("://") ? url : `https://${url}`).hostname;
    return host.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

const INJECTION_PATTERN = /ignore\s+(previous|above|all)|forget\s+(your|the)|you\s+are\s+now|system\s*:|override/i;

/** Reject custom instructions that look like prompt injection; null = drop them. */
export function sanitizeCustomInstructions(text: string | null): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed || INJECTION_PATTERN.test(trimmed)) return null;
  return trimmed.slice(0, 2000);
}
