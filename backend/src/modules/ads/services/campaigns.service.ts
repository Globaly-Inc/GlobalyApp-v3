import { NotFoundError } from "../../../shared/errors.js";
import * as repo from "../repositories/campaigns.repository.js";
import type { CreateCampaignInput, UpdateCampaignInput } from "../schemas/ads.schema.js";

export async function list(businessId: number) {
  return repo.listForBusiness(businessId);
}

export async function create(businessId: number, input: CreateCampaignInput) {
  return repo.insert({ business_id: businessId, ...input });
}

export async function getOne(campaignId: number, businessId: number) {
  const campaign = await repo.findForBusiness(campaignId, businessId);
  if (!campaign) throw new NotFoundError("Ad campaign not found");
  return campaign;
}

export async function update(campaignId: number, businessId: number, input: UpdateCampaignInput) {
  await getOne(campaignId, businessId);
  return repo.update(campaignId, input);
}

export async function remove(campaignId: number, businessId: number) {
  await getOne(campaignId, businessId);
  await repo.softDelete(campaignId);
}

/** Called by whatever surface actually renders the ad — not built yet, so nothing calls this. */
export async function recordImpression(campaignId: number) {
  await repo.incrementMetric(campaignId, "impressions");
}

export async function recordClick(campaignId: number) {
  await repo.incrementMetric(campaignId, "clicks");
}
