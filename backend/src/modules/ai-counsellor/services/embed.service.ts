// Embed-mode helpers shared by the authenticated (/messages + x-embed-key) and
// guest (/guest/messages + embed_key) chat flows.

import * as embedRepo from "../repositories/embed.repository.js";
import * as knowledgeRepo from "../repositories/knowledge.repository.js";
import { NotFoundError, ForbiddenError, TooManyRequestsError } from "../../../shared/errors.js";

export type EmbedContext = {
  config: embedRepo.EmbedConfigRow;
  /** extraction_jobs ids whose courses belong to this widget's owner; [] = no courses surface. */
  jobIds: string[];
  /** Which crawled website the counsellor may read — this institution's, never another's.
   *  Null for a business widget: businesses answer from their matched extraction jobs. */
  rackInstitutionId: number | null;
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
 * Course scoping for embed mode. Empty scope → the AI answers from shared knowledge only;
 * it must never leak another institution's courses under this widget's brand.
 *
 * An institution owns exactly one extraction job (`institutions.source_job_id`, unique), which
 * IS its catalog — so it is scoped directly, no domain matching. That also means a freshly
 * registered institution's widget works immediately: its self-service job carries a
 * `.invalid` placeholder URL that no domain match could ever hit.
 *
 * A business has no such link, so it stays on the website-domain match: courses whose
 * extraction job URL is on the business's own website domain.
 */
export async function buildEmbedContext(config: embedRepo.EmbedConfigRow): Promise<EmbedContext> {
  if (config.institution_id != null) {
    const jobId = await embedRepo.institutionSourceJobId(Number(config.institution_id));
    return {
      config,
      jobIds: jobId ? [jobId] : [],
      rackInstitutionId: Number(config.institution_id),
    };
  }

  const website = await embedRepo.businessWebsite(Number(config.business_id));
  const domain = website ? extractDomain(website) : null;
  const jobIds = domain ? await knowledgeRepo.jobIdsByInstitutionDomain(domain) : [];
  return { config, jobIds, rackInstitutionId: null };
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
