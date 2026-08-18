// ai_embed_configs access.
//
// NO `select *`, NO bare `.first()`. Every read below names its columns, because
// this table holds three things a third-party page must never receive:
//   - custom_instructions — the tenant's prompt, which is their IP
//   - allowed_origins     — telling an attacker exactly which Origin to forge
//   - monthly_credit_limit / credits_used_this_month — the tenant's billing state
// V1's ai-embed-validate returned all of those to the browser, and returned the
// whole row a second time in the 402 body. The split here (INTERNAL_COLUMNS for
// the server, a projection in the service for the wire) is what makes that
// impossible to repeat by accident.

import type { Knex } from "knex";

import { masterKnex } from "../../../core/db/master-pool.js";

const TABLE = "ai_embed_configs";

export interface EmbedConfigRow {
  id: number;
  business_id: number;
  embed_key: string;
  display_name: string | null;
  logo_url: string | null;
  brand_color: string | null;
  business_type: string | null;
  custom_instructions: string | null;
  welcome_message: string | null;
  starter_questions: string[] | null;
  allowed_origins: string[];
  scoped_institution_ids: number[] | null;
  scoped_agent_id: number | null;
  monthly_credit_limit: number | null;
  credits_used_this_month: number;
  month_reset_at: Date;
  overage_enabled: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

/** Server-side view. Never serialized as-is — see service `toPublicConfig`. */
const INTERNAL_COLUMNS = [
  "id",
  "business_id",
  "embed_key",
  "display_name",
  "logo_url",
  "brand_color",
  "business_type",
  "custom_instructions",
  "welcome_message",
  "starter_questions",
  "allowed_origins",
  "scoped_institution_ids",
  "scoped_agent_id",
  "monthly_credit_limit",
  "credits_used_this_month",
  "month_reset_at",
  "overage_enabled",
  "is_active",
  "created_at",
  "updated_at",
] as const;

/**
 * Look a config up by its embed key.
 *
 * Filters on `is_active` here rather than at the call site so an inactive config is
 * indistinguishable from a wrong key — both are "no such widget".
 */
export async function findActiveByKey(embedKey: string): Promise<EmbedConfigRow | undefined> {
  return masterKnex(TABLE)
    .select(INTERNAL_COLUMNS)
    .where({ embed_key: embedKey, is_active: true })
    .first<EmbedConfigRow | undefined>();
}

export async function listForBusiness(businessId: number): Promise<EmbedConfigRow[]> {
  return masterKnex(TABLE)
    .select(INTERNAL_COLUMNS)
    .where({ business_id: businessId })
    .orderBy("id", "desc");
}

export async function findForBusiness(
  id: number,
  businessId: number,
): Promise<EmbedConfigRow | undefined> {
  return masterKnex(TABLE)
    .select(INTERNAL_COLUMNS)
    .where({ id, business_id: businessId })
    .first<EmbedConfigRow | undefined>();
}

export async function create(
  businessId: number,
  values: Record<string, unknown>,
): Promise<EmbedConfigRow> {
  const [row] = await masterKnex(TABLE)
    .insert({ ...values, business_id: businessId })
    .returning(INTERNAL_COLUMNS as unknown as string[]);
  return row as EmbedConfigRow;
}

/** Scoped by business_id as well as id, so one tenant cannot patch another's. */
export async function update(
  id: number,
  businessId: number,
  values: Record<string, unknown>,
): Promise<EmbedConfigRow | undefined> {
  const [row] = await masterKnex(TABLE)
    .where({ id, business_id: businessId })
    .update({ ...values, updated_at: masterKnex.fn.now() })
    .returning(INTERNAL_COLUMNS as unknown as string[]);
  return row as EmbedConfigRow | undefined;
}

/**
 * Spend `credits` against the monthly budget, atomically.
 *
 * The reset and the increment are ONE statement on purpose. Read-then-write would
 * let two concurrent widget turns both observe `credits_used_this_month` under the
 * limit and both spend it; `credits_used_this_month = CASE ... END + ?` cannot.
 * The CASE is the monthly rollover: when `month_reset_at` has passed, this turn
 * starts a fresh month rather than adding to last month's total.
 */
export async function spendCredits(
  id: number,
  credits: number,
  trx?: Knex,
): Promise<void> {
  const db = trx ?? masterKnex;
  await db(TABLE)
    .where({ id })
    .update({
      credits_used_this_month: db.raw(
        "CASE WHEN month_reset_at <= now() THEN 0 ELSE credits_used_this_month END + ?",
        [credits],
      ),
      month_reset_at: db.raw(
        "CASE WHEN month_reset_at <= now() THEN date_trunc('month', now()) + INTERVAL '1 month' ELSE month_reset_at END",
      ),
      updated_at: db.fn.now(),
    });
}
