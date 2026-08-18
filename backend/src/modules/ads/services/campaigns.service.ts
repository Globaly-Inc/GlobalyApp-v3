// Owner-scoped campaign management: CRUD, creatives, placements, analytics.
//
// Spec: V2's /me/business/ads/* routes.
//
// ── ISOLATION ──
// `businessId` always comes from req.business, which tenant.plugin resolved from
// the verified JWT's orgId — never from a path or body. Every read and write goes
// through repo.findCampaignForBusiness, so business B asking for business A's
// campaign gets a 404, not a 403: a 403 confirms the id exists.
//
// V2 instead took `business_id` from the request body/query and then called
// assertMembership on it. That works, but it makes every route responsible for
// remembering the check; here the id is simply not attacker-controlled.

import { BadRequestError, NotFoundError } from "../../../shared/errors.js";
import {
  buildPaginatedResponse,
  paginationToOffset,
  type PaginationInput,
} from "../../../shared/pagination.js";
import { ADVERTISER_SETTABLE_STATUSES } from "../consts.js";
import * as repo from "../repositories/ads.repository.js";
import * as serialize from "./serializers.js";
import type {
  CampaignCreateInput,
  CampaignListInput,
  CampaignPatchInput,
  CreativeCreateInput,
  CreativePatchInput,
} from "../schemas/ads.schema.js";

/** 404s anything not owned by `businessId`. The one authorisation point. */
async function ownedCampaign(id: number, businessId: number) {
  const row = await repo.findCampaignForBusiness(id, businessId);
  if (!row) throw new NotFoundError("Campaign not found");
  return row;
}

// ── campaigns ───────────────────────────────────────────────────────────────

export async function list(businessId: number, query: CampaignListInput) {
  const { limit, offset } = paginationToOffset(query);
  const filters = { businessId, status: query.status };
  const [rows, total] = await Promise.all([
    repo.listCampaigns(filters, limit, offset),
    repo.countCampaigns(filters),
  ]);
  return buildPaginatedResponse(rows.map(serialize.ownerCampaign), total, query);
}

export async function get(businessId: number, id: number) {
  return serialize.ownerCampaign(await ownedCampaign(id, businessId));
}

export async function create(businessId: number, actorId: number | null, input: CampaignCreateInput) {
  // status is absent from CampaignCreateSchema on purpose: a new campaign is a
  // draft, and only an admin can make it live (V1's AdminAds page was the only
  // writer of 'active').
  const row = await repo.insertCampaign({
    business_id: businessId,
    created_by: actorId,
    name: input.name,
    objective: input.objective,
    status: "draft",
    budget_type: input.budget_type,
    budget_amount: input.budget_amount,
    cost_model: input.cost_model,
    cost_per_unit: input.cost_per_unit,
    starts_at: input.starts_at ?? null,
    ends_at: input.ends_at ?? null,
    target_audiences: input.target_audiences,
    target_countries: input.target_countries,
    target_study_fields: input.target_study_fields,
    auto_pause_at_budget: input.auto_pause_at_budget,
  });
  return serialize.ownerCampaign(row);
}

export async function update(businessId: number, id: number, input: CampaignPatchInput) {
  await ownedCampaign(id, businessId);

  if (input.status && !(ADVERTISER_SETTABLE_STATUSES as readonly string[]).includes(input.status)) {
    throw new BadRequestError(
      `An advertiser may only set status to ${ADVERTISER_SETTABLE_STATUSES.join(", ")}`,
    );
  }

  const values: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) values[key] = value;
  }
  if (!Object.keys(values).length) return serialize.ownerCampaign(await ownedCampaign(id, businessId));

  const row = await repo.updateCampaign(id, businessId, values);
  if (!row) throw new NotFoundError("Campaign not found");
  return serialize.ownerCampaign(row);
}

// ── creatives ───────────────────────────────────────────────────────────────

export async function listCreatives(businessId: number, campaignId: number) {
  await ownedCampaign(campaignId, businessId);
  return (await repo.listCreatives(campaignId)).map(serialize.creative);
}

export async function addCreative(businessId: number, campaignId: number, input: CreativeCreateInput) {
  await ownedCampaign(campaignId, businessId);
  const row = await repo.insertCreative({
    campaign_id: campaignId,
    media_type: input.media_type,
    media_url: input.media_url,
    thumbnail_url: input.thumbnail_url ?? null,
    headline: input.headline ?? null,
    description: input.description ?? null,
    cta_text: input.cta_text ?? null,
    cta_url: input.cta_url ?? null,
    is_active: input.is_active,
    sort_order: input.sort_order,
  });
  return serialize.creative(row);
}

/** Resolves a creative to its owning business in one query, then 404s a mismatch. */
async function ownedCreative(id: number, businessId: number) {
  const owner = await repo.findCreativeOwner(id);
  if (!owner || owner.business_id !== businessId) throw new NotFoundError("Creative not found");
  return owner;
}

export async function updateCreative(businessId: number, id: number, input: CreativePatchInput) {
  await ownedCreative(id, businessId);
  const values: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) values[key] = value;
  }
  const row = Object.keys(values).length ? await repo.updateCreative(id, values) : undefined;
  if (!row) {
    const current = (await repo.listCreatives((await ownedCreative(id, businessId)).campaign_id)).find(
      (c) => c.id === id,
    );
    if (!current) throw new NotFoundError("Creative not found");
    return serialize.creative(current);
  }
  return serialize.creative(row);
}

export async function removeCreative(businessId: number, id: number) {
  await ownedCreative(id, businessId);
  // Soft delete: a hard delete SET NULLs every impression's creative_id and
  // silently destroys the per-creative analytics the campaign was optimised on.
  await repo.softDeleteCreative(id);
}

// ── placements ──────────────────────────────────────────────────────────────

export async function listPlacements(businessId: number, campaignId: number) {
  await ownedCampaign(campaignId, businessId);
  return repo.listPlacements(campaignId);
}

export async function replacePlacements(businessId: number, campaignId: number, placements: string[]) {
  await ownedCampaign(campaignId, businessId);
  return repo.replacePlacements(campaignId, placements);
}

// ── analytics ───────────────────────────────────────────────────────────────

/**
 * V2's projection, verbatim: aggregate totals plus the RAW impression and lead
 * rows, which the campaign editor slices client-side per creative and per
 * placement. Neither array carries viewer identity — see
 * ANALYTICS_IMPRESSION_COLUMNS / ANALYTICS_LEAD_COLUMNS.
 */
export async function analytics(businessId: number, campaignId: number) {
  await ownedCampaign(campaignId, businessId);
  const [impressions, leads] = await Promise.all([
    repo.listAnalyticsImpressions(campaignId),
    repo.listAnalyticsLeads(campaignId),
  ]);

  const clicks = impressions.filter((i) => i.is_click).length;
  return {
    total_impressions: impressions.length,
    total_clicks: clicks,
    total_leads: leads.length,
    // Fixed 2dp always, including the zero case. V2 returned the string "0" with
    // no decimals when there were no impressions and "0.00" otherwise, so the
    // frontend had two formats for one field.
    ctr: (impressions.length ? (clicks / impressions.length) * 100 : 0).toFixed(2),
    impressions: impressions.map((i) => ({
      id: i.id,
      creative_id: i.creative_id,
      placement: i.placement,
      is_click: i.is_click,
      viewed_at: new Date(i.viewed_at as string).toISOString(),
    })),
    leads: leads.map((l) => ({
      id: l.id,
      creative_id: l.creative_id,
      lead_type: l.lead_type,
      created_at: new Date(l.created_at as string).toISOString(),
    })),
  };
}

export type { PaginationInput };
