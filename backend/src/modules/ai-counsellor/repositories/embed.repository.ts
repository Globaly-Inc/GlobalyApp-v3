import { masterKnex } from "../../../core/db/master-pool.js";

export interface EmbedConfigRow {
  id: number;
  business_id: number;
  embed_key: string;
  display_name: string | null;
  logo_url: string | null;
  brand_color: string | null;
  custom_instructions: string | null;
  monthly_credit_limit: number;
  credits_used_this_month: number;
  month_reset_at: Date;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

const TABLE = "ai_embed_configs";

export async function create(
  businessId: number,
  data: {
    display_name?: string;
    logo_url?: string;
    brand_color?: string;
    custom_instructions?: string;
    monthly_credit_limit?: number;
  },
): Promise<EmbedConfigRow> {
  const [row] = await masterKnex(TABLE)
    .insert({ business_id: businessId, ...data })
    .returning("*");
  return row;
}

export async function findByEmbedKey(embedKey: string): Promise<EmbedConfigRow | undefined> {
  return masterKnex(TABLE).where({ embed_key: embedKey }).first();
}

export async function findByBusinessId(businessId: number): Promise<EmbedConfigRow[]> {
  return masterKnex(TABLE).where({ business_id: businessId }).orderBy("created_at", "desc");
}

export async function deactivate(id: number, businessId: number): Promise<number> {
  return masterKnex(TABLE)
    .where({ id, business_id: businessId })
    .update({ is_active: false, updated_at: masterKnex.fn.now() });
}

export async function reactivate(id: number, businessId: number): Promise<number> {
  return masterKnex(TABLE)
    .where({ id, business_id: businessId })
    .update({ is_active: true, updated_at: masterKnex.fn.now() });
}

export async function incrementMonthlyUsage(id: number): Promise<void> {
  await masterKnex(TABLE)
    .where({ id })
    .update({ credits_used_this_month: masterKnex.raw("credits_used_this_month + 1") });
}

export async function resetMonthlyUsage(id: number): Promise<void> {
  await masterKnex(TABLE).where({ id }).update({
    credits_used_this_month: 0,
    month_reset_at: masterKnex.raw("date_trunc('month', now()) + INTERVAL '1 month'"),
  });
}

/** Website of the config's owning business — the RAG scoping key. */
export async function businessWebsite(businessId: number): Promise<string | null> {
  const row = await masterKnex("businesses").where({ id: businessId }).select("website").first();
  return row?.website ?? null;
}
