import { masterKnex } from "../../../core/db/master-pool.js";
// A widget owner is a business or an institution — the same {kind, id} pair the enquiry lane
// already models for two-master-table ownership, so the helpers are reused rather than retyped.
import { recipientFilter, type Recipient } from "../../enquiries/shared/recipient.js";

export type EmbedOwner = Recipient;

export interface EmbedConfigRow {
  id: number;
  /** Exactly one of these is set — CHECK chk_ai_embed_configs_owner. */
  business_id: number | null;
  institution_id: number | null;
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
  owner: EmbedOwner,
  data: {
    display_name?: string;
    logo_url?: string;
    brand_color?: string;
    custom_instructions?: string;
    monthly_credit_limit?: number;
  },
): Promise<EmbedConfigRow> {
  const [row] = await masterKnex(TABLE)
    .insert({ ...recipientFilter(owner), ...data })
    .returning("*");
  return row;
}

export async function findByEmbedKey(embedKey: string): Promise<EmbedConfigRow | undefined> {
  return masterKnex(TABLE).where({ embed_key: embedKey }).first();
}

export async function findByOwner(owner: EmbedOwner): Promise<EmbedConfigRow[]> {
  return masterKnex(TABLE).where(recipientFilter(owner)).orderBy("created_at", "desc");
}

export async function deactivate(id: number, owner: EmbedOwner): Promise<number> {
  return masterKnex(TABLE)
    .where({ id, ...recipientFilter(owner) })
    .update({ is_active: false, updated_at: masterKnex.fn.now() });
}

export async function reactivate(id: number, owner: EmbedOwner): Promise<number> {
  return masterKnex(TABLE)
    .where({ id, ...recipientFilter(owner) })
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

/** Website of the config's owning business — the RAG scoping key for a business widget. */
export async function businessWebsite(businessId: number): Promise<string | null> {
  const row = await masterKnex("businesses").where({ id: businessId }).select("website").first();
  return row?.website ?? null;
}

/** Website of the config's owning institution — what its widget site index crawls. */
export async function institutionWebsite(institutionId: number): Promise<string | null> {
  const row = await masterKnex("institutions").where({ id: institutionId }).select("website").first();
  return row?.website ?? null;
}

/** Either owner kind's website, for the site index. */
export async function ownerWebsite(owner: EmbedOwner): Promise<string | null> {
  return owner.kind === "institution" ? institutionWebsite(owner.id) : businessWebsite(owner.id);
}

/**
 * The institution's own extraction job — the RAG scoping key for an institution widget.
 * `institutions.source_job_id` is unique and every institution has one (promote sets it for
 * admin-created listings, `mintSelfServiceJob` for self-registered), so the catalog is
 * addressable directly instead of via a website-domain match.
 */
export async function institutionSourceJobId(institutionId: number): Promise<string | null> {
  const row = await masterKnex("institutions")
    .where({ id: institutionId })
    .select("source_job_id")
    .first();
  return row?.source_job_id ?? null;
}
