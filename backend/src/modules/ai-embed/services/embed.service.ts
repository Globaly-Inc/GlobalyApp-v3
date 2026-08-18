// Widget request resolution: key → config → origin → budget.
//
// The order matters and is fixed: an unknown key is 401, a known key from the wrong
// place is 403, and a known key from the right place with no budget left is 402.
// Every widget route funnels through `resolveWidgetRequest` so there is exactly one
// implementation of that ladder, and no route can accidentally skip a rung.

import { PaymentRequiredError, UnauthorizedError } from "../../../shared/errors.js";
import * as repo from "../repositories/embed-config.repository.js";
import { assertOriginAllowed } from "./origin.service.js";

/**
 * Everything the widget is allowed to know about itself.
 *
 * Explicitly built field by field — NOT spread from the row — so a column added to
 * ai_embed_configs later cannot become a leak by default. Compare V1, which
 * selected a list that included custom_instructions' siblings, the credit counters
 * and the scoping ids and handed the lot to the browser.
 */
export interface PublicEmbedConfig {
  embed_key: string;
  display_name: string | null;
  logo_url: string | null;
  brand_color: string | null;
  welcome_message: string | null;
  starter_questions: string[];
}

export function toPublicConfig(row: repo.EmbedConfigRow): PublicEmbedConfig {
  return {
    embed_key: row.embed_key,
    display_name: row.display_name,
    logo_url: row.logo_url,
    brand_color: row.brand_color,
    welcome_message: row.welcome_message,
    starter_questions: row.starter_questions ?? [],
  };
}

/** Credits already spent in the CURRENT month — 0 once the reset date has passed. */
export function creditsUsedThisMonth(row: repo.EmbedConfigRow): number {
  if (row.month_reset_at && new Date(row.month_reset_at).getTime() <= Date.now()) return 0;
  return row.credits_used_this_month;
}

/**
 * True when this config has budget for another turn.
 *
 * A null `monthly_credit_limit` means "no ceiling configured"; `overage_enabled`
 * means the tenant has agreed to be billed past it. Neither is the default.
 */
export function hasBudget(row: repo.EmbedConfigRow): boolean {
  if (row.overage_enabled) return true;
  if (row.monthly_credit_limit === null) return true;
  return creditsUsedThisMonth(row) < row.monthly_credit_limit;
}

export interface ResolvedWidgetRequest {
  config: repo.EmbedConfigRow;
  /** The canonical origin this request was authorized for. */
  origin: string;
}

/**
 * The single gate every public widget endpoint goes through.
 *
 * `requireBudget: false` is for the validate call, which still has to answer for a
 * widget that is out of credits — but answers 402 with NO config body, unlike V1,
 * which attached the whole row to its 402.
 */
export async function resolveWidgetRequest(opts: {
  embedKey: string;
  origin: string | undefined;
  requireBudget: boolean;
}): Promise<ResolvedWidgetRequest> {
  const config = await repo.findActiveByKey(opts.embedKey);
  if (!config) {
    // Same message for "no such key" and "key deactivated" — an enumerating client
    // learns nothing from the difference.
    throw new UnauthorizedError("Invalid or inactive embed key");
  }

  // Throws 403. Not a warning, not a log line, not a header — a refusal.
  const origin = assertOriginAllowed(opts.origin, config.allowed_origins);

  if (opts.requireBudget && !hasBudget(config)) {
    throw new PaymentRequiredError("Monthly credit limit reached for this widget");
  }

  return { config, origin };
}
