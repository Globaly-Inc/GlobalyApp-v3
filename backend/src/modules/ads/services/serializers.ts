// Response shapes for the ads module.
//
// Two campaign serializers on purpose, never one shared between an authenticated
// owner and an anonymous ad viewer. That shared-serializer shape is the exact leak
// this program has already caught twice: it looks safe on the day it is written
// and starts leaking the day someone adds a column.
//
//   ownerCampaign()  — everything the owner and admins may see (budget, spend,
//                      counters, moderation trail).
//   serve()          — in ads.service.ts, built field-by-field from
//                      SERVED_CAMPAIGN_COLUMNS. No budget, no spend, no counters.
//
// Numeric columns are returned as NUMBERS. Postgres hands `numeric` back as a
// string and V2 passed that straight out; the frontend renders these into money
// amounts and arithmetic on a string is a bug waiting for a currency formatter.

import type { CampaignRow, CreativeRow } from "../repositories/ads.repository.js";

const iso = (value: Date | string | null): string | null =>
  value === null ? null : new Date(value).toISOString();

export function ownerCampaign(row: CampaignRow & { business_name?: string | null }) {
  return {
    id: row.id,
    business_id: row.business_id,
    business_name: row.business_name ?? undefined,
    created_by: row.created_by,
    name: row.name,
    objective: row.objective,
    status: row.status,
    budget_type: row.budget_type,
    budget_amount: Number(row.budget_amount),
    spent_amount: Number(row.spent_amount),
    cost_model: row.cost_model,
    cost_per_unit: Number(row.cost_per_unit),
    starts_at: iso(row.starts_at),
    ends_at: iso(row.ends_at),
    target_audiences: row.target_audiences ?? [],
    target_countries: row.target_countries ?? [],
    target_study_fields: row.target_study_fields ?? [],
    auto_pause_at_budget: row.auto_pause_at_budget,
    rejection_reason: row.rejection_reason,
    reviewed_by: row.reviewed_by,
    reviewed_at: iso(row.reviewed_at),
    impressions_count: row.impressions_count,
    clicks_count: row.clicks_count,
    leads_count: row.leads_count,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}

export function creative(row: CreativeRow) {
  return {
    id: row.id,
    campaign_id: row.campaign_id,
    media_type: row.media_type,
    media_url: row.media_url,
    thumbnail_url: row.thumbnail_url,
    headline: row.headline,
    description: row.description,
    cta_text: row.cta_text,
    cta_url: row.cta_url,
    is_active: row.is_active,
    sort_order: row.sort_order,
    created_at: iso(row.created_at),
  };
}

/** What an anonymous viewer gets: the ad, and nothing about the campaign's economics. */
export function serveCreative(row: CreativeRow) {
  return {
    id: row.id,
    media_type: row.media_type,
    media_url: row.media_url,
    thumbnail_url: row.thumbnail_url,
    headline: row.headline,
    description: row.description,
    cta_text: row.cta_text,
    cta_url: row.cta_url,
  };
}
