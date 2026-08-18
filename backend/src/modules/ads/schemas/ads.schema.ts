// Zod schemas for the ads module — the trust boundary.
//
// Every URL field uses webUrl() from shared/url.ts, NEVER z.string().url():
// media_url lands in an <img src> and cta_url in an anchor href, and the URL
// constructor happily parses `javascript:`, `data:text/html` and `vbscript:`.
// See shared/url.ts for the full argument.

import { z } from "zod";
import { PaginationSchema } from "../../../shared/pagination.js";
import { webUrl } from "../../../shared/url.js";
import {
  AD_BUDGET_TYPES,
  AD_COST_MODELS,
  AD_LEAD_TYPES,
  AD_MEDIA_TYPES,
  AD_OBJECTIVES,
  AD_REPORT_REASONS,
  AD_STATUSES,
  ADVERTISER_SETTABLE_STATUSES,
} from "../consts.js";

export const IdParamSchema = z.object({ id: z.coerce.number().int().positive() });
export const PlacementParamSchema = z.object({ placement: z.string().trim().min(1).max(120) });

const money = z.number().nonnegative().max(99_999_999);
const targetList = z.array(z.string().trim().min(1).max(120)).max(100);

// ── Campaigns (owner-writable fields only) ──────────────────────────────────
//
// business_id, created_by, spent_amount, the review columns and every counter are
// server-controlled and therefore absent: a body that mentions them is ignored,
// not honoured. That is the whole reason this is an allowlist rather than a
// blocklist.

const campaignFields = {
  name: z.string().trim().min(1).max(300),
  objective: z.enum(AD_OBJECTIVES),
  budget_type: z.enum(AD_BUDGET_TYPES),
  budget_amount: money,
  cost_model: z.enum(AD_COST_MODELS),
  cost_per_unit: money,
  starts_at: z.string().datetime().nullable(),
  ends_at: z.string().datetime().nullable(),
  target_audiences: targetList,
  target_countries: targetList,
  target_study_fields: targetList,
  auto_pause_at_budget: z.boolean(),
} as const;

export const CampaignCreateSchema = z
  .object({
    ...campaignFields,
    objective: campaignFields.objective.default("awareness"),
    budget_type: campaignFields.budget_type.default("lifetime"),
    budget_amount: campaignFields.budget_amount.default(0),
    cost_model: campaignFields.cost_model.default("cpv"),
    cost_per_unit: campaignFields.cost_per_unit.default(1),
    starts_at: campaignFields.starts_at.optional(),
    ends_at: campaignFields.ends_at.optional(),
    target_audiences: campaignFields.target_audiences.default([]),
    target_countries: campaignFields.target_countries.default([]),
    target_study_fields: campaignFields.target_study_fields.default([]),
    auto_pause_at_budget: campaignFields.auto_pause_at_budget.default(true),
  })
  .strict();

export const CampaignPatchSchema = z
  .object({
    ...campaignFields,
    // The advertiser's own lifecycle verbs. Approving is the platform's.
    status: z.enum(ADVERTISER_SETTABLE_STATUSES as unknown as [string, ...string[]]),
  })
  .partial()
  .strict();

export const CampaignListQuery = PaginationSchema.extend({
  status: z.enum(AD_STATUSES).optional(),
});

// ── Creatives ───────────────────────────────────────────────────────────────

const creativeFields = {
  media_type: z.enum(AD_MEDIA_TYPES),
  media_url: webUrl({ max: 2000 }),
  thumbnail_url: webUrl({ max: 2000 }).nullable(),
  headline: z.string().trim().max(300).nullable(),
  description: z.string().trim().max(2000).nullable(),
  cta_text: z.string().trim().max(120).nullable(),
  cta_url: webUrl({ max: 2000 }).nullable(),
  is_active: z.boolean(),
  sort_order: z.number().int().min(0).max(10_000),
} as const;

export const CreativeCreateSchema = z
  .object({
    ...creativeFields,
    media_type: creativeFields.media_type.default("image"),
    thumbnail_url: creativeFields.thumbnail_url.optional(),
    headline: creativeFields.headline.optional(),
    description: creativeFields.description.optional(),
    cta_text: creativeFields.cta_text.optional(),
    cta_url: creativeFields.cta_url.optional(),
    is_active: creativeFields.is_active.default(true),
    sort_order: creativeFields.sort_order.default(0),
  })
  .strict();

export const CreativePatchSchema = z.object(creativeFields).partial().strict();

// ── Placements ──────────────────────────────────────────────────────────────

export const PlacementsPutSchema = z
  .object({ placements: z.array(z.string().trim().min(1).max(120)).max(50) })
  .strict();

// ── Public engagement bodies (mirror record-ad-impression / record-ad-lead) ──

export const ImpressionSchema = z
  .object({
    campaign_id: z.number().int().positive(),
    creative_id: z.number().int().positive().optional(),
    placement: z.string().trim().min(1).max(120),
    // Opaque client token. Bounded because it is stored, and never trusted as
    // identity — the viewer is always taken from the verified JWT.
    viewer_fingerprint: z.string().trim().max(200).optional(),
    is_click: z.boolean().default(false),
  })
  .strict();

export const LeadSchema = z
  .object({
    campaign_id: z.number().int().positive(),
    creative_id: z.number().int().positive().optional(),
    placement: z.string().trim().min(1).max(120),
    lead_type: z.enum(AD_LEAD_TYPES),
  })
  .strict();

export const DismissalSchema = z.object({ campaign_id: z.number().int().positive() }).strict();

export const ReportSchema = z
  .object({
    campaign_id: z.number().int().positive(),
    creative_id: z.number().int().positive().optional(),
    reason: z.enum(AD_REPORT_REASONS),
    details: z.string().trim().max(2000).optional(),
  })
  .strict();

// ── Admin moderation ────────────────────────────────────────────────────────

/**
 * A rejection must say why. V1's admin page always sent a reason but nothing
 * enforced it, so a campaign could be killed with no explanation for the
 * advertiser — mirrored by the ad_campaigns_rejection_reason_check constraint.
 */
export const RejectSchema = z.object({ reason: z.string().trim().min(1).max(2000) }).strict();

export const AdminCampaignListQuery = PaginationSchema.extend({
  status: z.enum(AD_STATUSES).optional(),
  business_id: z.coerce.number().int().positive().optional(),
  q: z.string().trim().min(1).max(200).optional(),
});

export const AdminReportListQuery = PaginationSchema.extend({
  status: z.enum(["pending", "reviewed", "dismissed", "actioned"]).optional(),
});

export type CampaignCreateInput = z.infer<typeof CampaignCreateSchema>;
export type CampaignPatchInput = z.infer<typeof CampaignPatchSchema>;
export type CreativeCreateInput = z.infer<typeof CreativeCreateSchema>;
export type CreativePatchInput = z.infer<typeof CreativePatchSchema>;
export type ImpressionInput = z.infer<typeof ImpressionSchema>;
export type LeadInput = z.infer<typeof LeadSchema>;
export type ReportInput = z.infer<typeof ReportSchema>;
export type CampaignListInput = z.infer<typeof CampaignListQuery>;
export type AdminCampaignListInput = z.infer<typeof AdminCampaignListQuery>;
