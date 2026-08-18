// Knex queries for the ads module. No business logic lives here.
//
// ── EVERY SELECT LISTS ITS COLUMNS ──
// There is not one `select *` or bare `.first()` in this file, and the column
// lists are named constants rather than inline arrays so a reviewer can see at a
// glance which projection a caller got. The reason is concrete: ad_impressions
// carries `viewer_user_id` + `viewer_fingerprint`, ad_leads carries `user_id` and
// ad_reports carries `reporter_user_id`. A `select *` behind a serializer shared
// between an authenticated owner and an anonymous ad viewer is exactly the leak
// this program has already caught twice, and it only shows up the day someone adds
// a column.

import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";
import { IMPRESSION_DEDUP_HOURS, LEAD_DEDUP_HOURS } from "../consts.js";

export type Db = Knex | Knex.Transaction;
export const db = (trx?: Db): Db => trx ?? masterKnex;

// ── column lists ────────────────────────────────────────────────────────────

/** Full campaign, for its owner and for admins. */
export const CAMPAIGN_COLUMNS = [
  "id",
  "business_id",
  "created_by",
  "name",
  "objective",
  "status",
  "budget_type",
  "budget_amount",
  "spent_amount",
  "cost_model",
  "cost_per_unit",
  "starts_at",
  "ends_at",
  "target_audiences",
  "target_countries",
  "target_study_fields",
  "auto_pause_at_budget",
  "rejection_reason",
  "reviewed_by",
  "reviewed_at",
  "impressions_count",
  "clicks_count",
  "leads_count",
  "created_at",
  "updated_at",
] as const;

/**
 * What an ANONYMOUS ad viewer may know about a campaign. Budget, spend, the
 * counters, the moderation trail and who created it are all absent — a viewer
 * learning a competitor's remaining budget from an ad slot is a leak even though
 * every field is "just a number".
 */
export const SERVED_CAMPAIGN_COLUMNS = ["id", "business_id", "name", "objective", "cost_model"] as const;

/** Creative fields safe for anyone: they are the ad itself. */
export const CREATIVE_COLUMNS = [
  "id",
  "campaign_id",
  "media_type",
  "media_url",
  "thumbnail_url",
  "headline",
  "description",
  "cta_text",
  "cta_url",
  "is_active",
  "sort_order",
  "created_at",
] as const;

export const PLACEMENT_COLUMNS = ["id", "campaign_id", "placement", "is_active"] as const;

/**
 * V2's analytics projection, verbatim — and note what is NOT in it:
 * viewer_user_id, viewer_fingerprint, cost_charged. The campaign editor slices
 * these rows per creative and per placement; it has never needed to know who.
 */
export const ANALYTICS_IMPRESSION_COLUMNS = ["id", "creative_id", "placement", "is_click", "viewed_at"] as const;
export const ANALYTICS_LEAD_COLUMNS = ["id", "creative_id", "lead_type", "created_at"] as const;

export interface CampaignRow {
  id: number;
  business_id: number;
  created_by: number | null;
  name: string;
  objective: string;
  status: string;
  budget_type: string;
  budget_amount: string;
  spent_amount: string;
  cost_model: string;
  cost_per_unit: string;
  starts_at: Date | null;
  ends_at: Date | null;
  target_audiences: string[];
  target_countries: string[];
  target_study_fields: string[];
  auto_pause_at_budget: boolean;
  rejection_reason: string | null;
  reviewed_by: number | null;
  reviewed_at: Date | null;
  impressions_count: number;
  clicks_count: number;
  leads_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreativeRow {
  id: number;
  campaign_id: number;
  media_type: string;
  media_url: string;
  thumbnail_url: string | null;
  headline: string | null;
  description: string | null;
  cta_text: string | null;
  cta_url: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: Date;
}

// ── campaigns ───────────────────────────────────────────────────────────────

export async function findCampaign(id: number, trx?: Db): Promise<CampaignRow | undefined> {
  return db(trx)<CampaignRow>("ad_campaigns")
    .where({ id })
    .whereNull("deleted_at")
    .first(...CAMPAIGN_COLUMNS);
}

/**
 * The isolation primitive. Every owner-scoped read and write goes through this,
 * so business B asking for business A's campaign gets `undefined` — which the
 * service turns into a 404, not a 403: a 403 would confirm the id exists.
 */
export async function findCampaignForBusiness(
  id: number,
  businessId: number,
  trx?: Db,
): Promise<CampaignRow | undefined> {
  return db(trx)<CampaignRow>("ad_campaigns")
    .where({ id, business_id: businessId })
    .whereNull("deleted_at")
    .first(...CAMPAIGN_COLUMNS);
}

/** Campaign row needed to price and gate an impression/lead. Active only. */
export interface ServingCampaign {
  id: number;
  business_id: number;
  cost_model: string;
  cost_per_unit: string;
  budget_amount: string;
  spent_amount: string;
  billed_impression_blocks: number;
  auto_pause_at_budget: boolean;
}

export async function findActiveCampaign(id: number, trx?: Db): Promise<ServingCampaign | undefined> {
  return db(trx)<ServingCampaign>("ad_campaigns")
    .where("id", id)
    .where("status", "active")
    .whereNull("deleted_at")
    .first(
      "id",
      "business_id",
      "cost_model",
      "cost_per_unit",
      "budget_amount",
      "spent_amount",
      "billed_impression_blocks",
      "auto_pause_at_budget",
    );
}

export async function insertCampaign(values: Record<string, unknown>): Promise<CampaignRow> {
  const [row] = await masterKnex("ad_campaigns").insert(values).returning([...CAMPAIGN_COLUMNS]);
  return row as CampaignRow;
}

export async function updateCampaign(
  id: number,
  businessId: number,
  values: Record<string, unknown>,
): Promise<CampaignRow | undefined> {
  const [row] = await masterKnex("ad_campaigns")
    .where({ id, business_id: businessId })
    .whereNull("deleted_at")
    .update({ ...values, updated_at: masterKnex.fn.now() })
    .returning([...CAMPAIGN_COLUMNS]);
  return row as CampaignRow | undefined;
}

/** Admin-only: no business_id filter, because moderation spans every tenant. */
export async function moderateCampaign(
  id: number,
  values: Record<string, unknown>,
): Promise<CampaignRow | undefined> {
  const [row] = await masterKnex("ad_campaigns")
    .where({ id })
    .whereNull("deleted_at")
    .update({ ...values, updated_at: masterKnex.fn.now() })
    .returning([...CAMPAIGN_COLUMNS]);
  return row as CampaignRow | undefined;
}

function campaignFilter(qb: Knex.QueryBuilder, filters: { status?: string; businessId?: number; q?: string }) {
  qb.whereNull("ad_campaigns.deleted_at");
  if (filters.businessId) qb.where("ad_campaigns.business_id", filters.businessId);
  if (filters.status) qb.where("ad_campaigns.status", filters.status);
  if (filters.q) qb.whereILike("ad_campaigns.name", `%${filters.q}%`);
  return qb;
}

export async function listCampaigns(
  filters: { status?: string; businessId?: number; q?: string },
  limit: number,
  offset: number,
): Promise<(CampaignRow & { business_name: string | null })[]> {
  const rows = await campaignFilter(masterKnex("ad_campaigns"), filters)
    .leftJoin("businesses", "businesses.id", "ad_campaigns.business_id")
    .orderBy("ad_campaigns.created_at", "desc")
    .limit(limit)
    .offset(offset)
    .select(
      ...CAMPAIGN_COLUMNS.map((c) => `ad_campaigns.${c}`),
      "businesses.business_name as business_name",
    );
  return rows as (CampaignRow & { business_name: string | null })[];
}

export async function countCampaigns(filters: {
  status?: string;
  businessId?: number;
  q?: string;
}): Promise<number> {
  const row = await campaignFilter(masterKnex("ad_campaigns"), filters).count<{ count: string }[]>(
    "ad_campaigns.id as count",
  );
  return Number(row[0]?.count ?? 0);
}

export async function campaignStatusCounts(): Promise<Record<string, number>> {
  const rows = await masterKnex("ad_campaigns")
    .whereNull("deleted_at")
    .groupBy("status")
    .select("status")
    .count<{ status: string; count: string }[]>("id as count");
  return Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
}

// ── the serve query ─────────────────────────────────────────────────────────

export interface ServeCandidate {
  campaign_id: number;
  business_id: number;
  name: string;
  objective: string;
  cost_model: string;
  business_name: string | null;
  business_logo: string | null;
}

/**
 * Live campaigns covering `placement`, minus anything `viewerId` dismissed.
 *
 * The eligibility predicates V2 evaluated in JavaScript after fetching every
 * active campaign (date window, budget vs spend) are pushed into SQL — the
 * database already has the index, and filtering in the process meant transferring
 * rows only to throw them away.
 */
export async function findServeCandidates(
  placement: string,
  viewerId: number | null,
): Promise<ServeCandidate[]> {
  const qb = masterKnex("ad_placements")
    .join("ad_campaigns", "ad_campaigns.id", "ad_placements.campaign_id")
    .leftJoin("businesses", "businesses.id", "ad_campaigns.business_id")
    .where("ad_placements.placement", placement)
    .where("ad_placements.is_active", true)
    .where("ad_campaigns.status", "active")
    .whereNull("ad_campaigns.deleted_at")
    .where((b) => b.whereNull("ad_campaigns.starts_at").orWhere("ad_campaigns.starts_at", "<=", masterKnex.fn.now()))
    .where((b) => b.whereNull("ad_campaigns.ends_at").orWhere("ad_campaigns.ends_at", ">=", masterKnex.fn.now()))
    // budget_amount = 0 means "unlimited", which is how V1 read it.
    .where((b) =>
      b.where("ad_campaigns.budget_amount", "<=", 0).orWhereRaw("ad_campaigns.spent_amount < ad_campaigns.budget_amount"),
    )
    .select(
      "ad_campaigns.id as campaign_id",
      "ad_campaigns.business_id as business_id",
      "ad_campaigns.name as name",
      "ad_campaigns.objective as objective",
      "ad_campaigns.cost_model as cost_model",
      "businesses.business_name as business_name",
      "businesses.logo_url as business_logo",
    );

  if (viewerId !== null) {
    qb.whereNotExists((b) =>
      b
        .select(masterKnex.raw("1"))
        .from("ad_dismissed")
        .whereRaw("ad_dismissed.campaign_id = ad_campaigns.id")
        .where("ad_dismissed.user_id", viewerId),
    );
  }
  return (await qb) as ServeCandidate[];
}

// ── creatives ───────────────────────────────────────────────────────────────

export async function listActiveCreatives(campaignIds: number[]): Promise<CreativeRow[]> {
  if (!campaignIds.length) return [];
  return masterKnex<CreativeRow>("ad_creatives")
    .whereIn("campaign_id", campaignIds)
    .where({ is_active: true })
    .whereNull("deleted_at")
    .orderBy("sort_order")
    .select(...CREATIVE_COLUMNS);
}

export async function listCreatives(campaignId: number): Promise<CreativeRow[]> {
  return masterKnex<CreativeRow>("ad_creatives")
    .where({ campaign_id: campaignId })
    .whereNull("deleted_at")
    .orderBy("sort_order")
    .select(...CREATIVE_COLUMNS);
}

export async function insertCreative(values: Record<string, unknown>): Promise<CreativeRow> {
  const [row] = await masterKnex("ad_creatives").insert(values).returning([...CREATIVE_COLUMNS]);
  return row as CreativeRow;
}

/** Creative + its owning business, so the caller can be authorised in one query. */
export async function findCreativeOwner(
  id: number,
): Promise<{ id: number; campaign_id: number; business_id: number } | undefined> {
  return masterKnex("ad_creatives")
    .join("ad_campaigns", "ad_campaigns.id", "ad_creatives.campaign_id")
    .where("ad_creatives.id", id)
    .whereNull("ad_creatives.deleted_at")
    .whereNull("ad_campaigns.deleted_at")
    .first("ad_creatives.id as id", "ad_creatives.campaign_id as campaign_id", "ad_campaigns.business_id as business_id");
}

export async function updateCreative(id: number, values: Record<string, unknown>): Promise<CreativeRow | undefined> {
  const [row] = await masterKnex("ad_creatives")
    .where({ id })
    .whereNull("deleted_at")
    .update({ ...values, updated_at: masterKnex.fn.now() })
    .returning([...CREATIVE_COLUMNS]);
  return row as CreativeRow | undefined;
}

/**
 * Soft delete. A hard delete would SET NULL every impression's creative_id and
 * silently destroy the per-creative analytics the campaign was optimised on.
 */
export async function softDeleteCreative(id: number): Promise<number> {
  return masterKnex("ad_creatives")
    .where({ id })
    .whereNull("deleted_at")
    .update({ deleted_at: masterKnex.fn.now(), is_active: false, updated_at: masterKnex.fn.now() });
}

// ── placements ──────────────────────────────────────────────────────────────

export async function listPlacements(campaignId: number, trx?: Db) {
  return db(trx)("ad_placements").where({ campaign_id: campaignId }).select(...PLACEMENT_COLUMNS);
}

export async function replacePlacements(campaignId: number, placements: string[]) {
  return masterKnex.transaction(async (trx) => {
    await trx("ad_placements").where({ campaign_id: campaignId }).delete();
    if (placements.length) {
      // Dedupe: the unique index would otherwise turn a repeated checkbox into a
      // 409 for a request that expressed a perfectly clear intent.
      await trx("ad_placements").insert(
        [...new Set(placements)].map((placement) => ({ campaign_id: campaignId, placement })),
      );
    }
    return listPlacements(campaignId, trx);
  });
}

// ── impressions ─────────────────────────────────────────────────────────────

/**
 * V1's rolling-window dedup check, kept for parity: it is what makes the ordinary
 * sequential repeat return `deduplicated: true`. It is NOT the guarantee — the
 * ad_impressions_dedup_uniq index is (see 20260817_801). Both are needed: this
 * one for the exact V1 window, that one for concurrency.
 */
export async function recentImpressionExists(
  campaignId: number,
  placement: string,
  viewerId: number,
  trx?: Db,
): Promise<boolean> {
  const since = new Date(Date.now() - IMPRESSION_DEDUP_HOURS * 3_600_000);
  const row = await db(trx)("ad_impressions")
    .where({ campaign_id: campaignId, placement, viewer_user_id: viewerId })
    .where("viewed_at", ">=", since)
    .first("id");
  return Boolean(row);
}

/** Returns the new row's id, or null when the dedup index rejected it. */
export async function claimImpression(
  values: Record<string, unknown>,
  trx: Db,
): Promise<number | null> {
  const rows = (await trx("ad_impressions")
    .insert(values)
    .onConflict(["campaign_id", "placement", "viewer_user_id", "viewed_hour"])
    .ignore()
    .returning(["id"])) as { id: number }[];
  return rows[0]?.id ?? null;
}

export async function listAnalyticsImpressions(campaignId: number) {
  return masterKnex("ad_impressions")
    .where({ campaign_id: campaignId })
    .orderBy("viewed_at", "desc")
    .select(...ANALYTICS_IMPRESSION_COLUMNS);
}

// ── leads ───────────────────────────────────────────────────────────────────

export async function recentLeadExists(
  campaignId: number,
  userId: number,
  leadType: string,
  trx?: Db,
): Promise<boolean> {
  const since = new Date(Date.now() - LEAD_DEDUP_HOURS * 3_600_000);
  const row = await db(trx)("ad_leads")
    .where({ campaign_id: campaignId, user_id: userId, lead_type: leadType })
    .where("created_at", ">=", since)
    .first("id");
  return Boolean(row);
}

export async function claimLead(values: Record<string, unknown>, trx: Db): Promise<number | null> {
  const rows = (await trx("ad_leads")
    .insert(values)
    .onConflict(["campaign_id", "user_id", "lead_type", "created_day"])
    .ignore()
    .returning(["id"])) as { id: number }[];
  return rows[0]?.id ?? null;
}

export async function listAnalyticsLeads(campaignId: number) {
  return masterKnex("ad_leads")
    .where({ campaign_id: campaignId })
    .orderBy("created_at", "desc")
    .select(...ANALYTICS_LEAD_COLUMNS);
}

// ── the atomic counter (see 20260817_800's header) ──────────────────────────

export interface CounterResult {
  impressions_count: number;
  clicks_count: number;
  leads_count: number;
  spent_amount: string;
  billed_impression_blocks: number;
}

/**
 * Bump a campaign's counters and its spend in ONE statement, returning the new
 * values. `impressions_count` is thereby a gap-free sequence: whoever gets 1000
 * back is the 1,000th impression, once, ever — no count(*), no read-modify-write.
 *
 * `cost` is applied to spent_amount under the same row lock, so the budget guard
 * below can never be beaten by a concurrent spend.
 */
export async function bumpCounters(
  campaignId: number,
  bump: { impressions?: number; clicks?: number; leads?: number; cost?: number },
  trx: Db,
): Promise<CounterResult> {
  const [row] = (await trx("ad_campaigns")
    .where({ id: campaignId })
    .update({
      impressions_count: trx.raw("impressions_count + ?", [bump.impressions ?? 0]),
      clicks_count: trx.raw("clicks_count + ?", [bump.clicks ?? 0]),
      leads_count: trx.raw("leads_count + ?", [bump.leads ?? 0]),
      spent_amount: trx.raw("spent_amount + ?", [bump.cost ?? 0]),
      updated_at: trx.fn.now(),
    })
    .returning([
      "impressions_count",
      "clicks_count",
      "leads_count",
      "spent_amount",
      "billed_impression_blocks",
    ])) as CounterResult[];
  return row;
}

/**
 * V1's `deduct_ad_cost` SECURITY DEFINER function, as a conditional UPDATE.
 *
 * The `WHERE budget_amount <= 0 OR spent_amount + cost <= budget_amount` is the
 * whole guard: it is evaluated by the database while holding the row, so two
 * concurrent impressions cannot both find room for the last unit of budget.
 * Returns null when there was no room — the caller then reports
 * `budget_exhausted` and writes nothing.
 */
export async function chargeBudget(
  campaignId: number,
  cost: number,
  trx: Db,
): Promise<CounterResult | null> {
  const rows = (await trx("ad_campaigns")
    .where({ id: campaignId })
    .where((b) =>
      b.where("budget_amount", "<=", 0).orWhereRaw("spent_amount + ? <= budget_amount", [cost]),
    )
    .update({ spent_amount: trx.raw("spent_amount + ?", [cost]), updated_at: trx.fn.now() })
    .returning([
      "impressions_count",
      "clicks_count",
      "leads_count",
      "spent_amount",
      "billed_impression_blocks",
    ])) as CounterResult[];
  return rows[0] ?? null;
}

/**
 * Claim the right to bill impression block `block`, exactly once.
 * `WHERE billed_impression_blocks = block - 1` makes the claim a compare-and-set:
 * a second attempt at the same block matches nothing and bills nothing.
 */
export async function claimImpressionBlock(campaignId: number, block: number, trx: Db): Promise<boolean> {
  const updated = await trx("ad_campaigns")
    .where({ id: campaignId, billed_impression_blocks: block - 1 })
    .update({ billed_impression_blocks: block, updated_at: trx.fn.now() });
  return updated === 1;
}

export async function pauseCampaign(campaignId: number, trx?: Db): Promise<void> {
  await db(trx)("ad_campaigns")
    .where({ id: campaignId, status: "active" })
    .update({ status: "paused", updated_at: db(trx).fn.now() });
}

export async function findBusinessOwner(businessId: number, trx?: Db): Promise<number | null> {
  const row = await db(trx)("businesses").where({ id: businessId }).first("owner_id");
  return row ? Number(row.owner_id) : null;
}

// ── dismissals & reports ────────────────────────────────────────────────────

export async function dismiss(userId: number, campaignId: number): Promise<void> {
  await masterKnex("ad_dismissed")
    .insert({ user_id: userId, campaign_id: campaignId })
    .onConflict(["user_id", "campaign_id"])
    .ignore();
}

/** null when this reporter already has an open report on the campaign. */
export async function insertReport(values: Record<string, unknown>): Promise<{ id: number } | null> {
  const rows = (await masterKnex("ad_reports")
    .insert(values)
    .onConflict(["campaign_id", "reporter_user_id"])
    .ignore()
    .returning(["id"])) as { id: number }[];
  return rows[0] ?? null;
}

/**
 * Admin-only. `reporter_user_id` IS in this projection, deliberately — a moderator
 * has to be able to see a reporter abusing the queue. It is the reason this list
 * lives behind requireAdmin and has no owner-facing counterpart.
 */
export async function listReports(filters: { status?: string }, limit: number, offset: number) {
  const qb = masterKnex("ad_reports")
    .join("ad_campaigns", "ad_campaigns.id", "ad_reports.campaign_id")
    .leftJoin("businesses", "businesses.id", "ad_campaigns.business_id");
  if (filters.status) qb.where("ad_reports.status", filters.status);
  return qb
    .orderBy("ad_reports.created_at", "desc")
    .limit(limit)
    .offset(offset)
    .select(
      "ad_reports.id as id",
      "ad_reports.campaign_id as campaign_id",
      "ad_reports.creative_id as creative_id",
      "ad_reports.reporter_user_id as reporter_user_id",
      "ad_reports.reason as reason",
      "ad_reports.details as details",
      "ad_reports.status as status",
      "ad_reports.created_at as created_at",
      "ad_campaigns.name as campaign_name",
      "businesses.business_name as business_name",
    );
}

export async function countReports(filters: { status?: string }): Promise<number> {
  const qb = masterKnex("ad_reports");
  if (filters.status) qb.where("status", filters.status);
  const row = await qb.count<{ count: string }[]>("id as count");
  return Number(row[0]?.count ?? 0);
}
