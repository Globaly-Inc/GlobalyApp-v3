import { masterKnex } from "../../../core/db/master-pool.js";
import type { CampaignStatus } from "../consts.js";

export interface CampaignRow {
  id: number;
  business_id: number;
  title: string;
  description: string | null;
  image_url: string | null;
  target_url: string | null;
  budget_minor: number;
  currency: string;
  start_at: Date;
  end_at: Date | null;
  status: CampaignStatus;
  impressions: number;
  clicks: number;
  created_at: Date;
  updated_at: Date;
}

export async function listForBusiness(businessId: number): Promise<CampaignRow[]> {
  return masterKnex<CampaignRow>("ad_campaigns")
    .where({ business_id: businessId })
    .whereNull("deleted_at")
    .orderBy("created_at", "desc");
}

export async function findForBusiness(id: number, businessId: number): Promise<CampaignRow | undefined> {
  return masterKnex<CampaignRow>("ad_campaigns").where({ id, business_id: businessId }).whereNull("deleted_at").first();
}

export async function insert(data: Record<string, unknown>): Promise<CampaignRow> {
  const [row] = await masterKnex<CampaignRow>("ad_campaigns").insert(data).returning("*");
  return row;
}

export async function update(id: number, data: Record<string, unknown>): Promise<CampaignRow> {
  const [row] = await masterKnex<CampaignRow>("ad_campaigns")
    .where({ id })
    .update({ ...data, updated_at: masterKnex.fn.now() })
    .returning("*");
  return row;
}

export async function softDelete(id: number): Promise<void> {
  await masterKnex("ad_campaigns").where({ id }).update({ deleted_at: masterKnex.fn.now() });
}

export async function incrementMetric(id: number, metric: "impressions" | "clicks"): Promise<void> {
  await masterKnex("ad_campaigns").where({ id }).increment(metric, 1);
}
