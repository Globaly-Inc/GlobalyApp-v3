// Ad serving and engagement recording.
//
// Behavioural spec: V1 `record-ad-impression` / `record-ad-lead` edge functions,
// plus V2's GET /ads/placements/:placement.
//
// ── WHAT V1 GOT WRONG, AND WHERE IT IS FIXED HERE ──
// D-G5-1  V1 ran `SELECT count(*) FROM ad_impressions WHERE campaign_id = ?` on
//         EVERY impression and then tested `count % 1000 === 0` to decide whether
//         to bill 50 credits. That is an unbounded query in the hot path AND a
//         read-modify-write race: two impressions landing together both read 999
//         (nobody bills) or both read 1000 (double bill). Here the counter is a
//         single atomic UPDATE ... RETURNING, so the returned number is a gap-free
//         sequence, and the block claim is a compare-and-set.
// D-G5-2  V1 deduped by counting rows in a rolling window and then inserting. N
//         concurrent impressions from one viewer all passed and all charged. Here
//         the rolling-window check is kept for parity but the arbiter is a UNIQUE
//         index; the insert IS the claim.
// D-G5-6  V1 charged the CPV/CPL cost BEFORE inserting the impression row, on a
//         separate un-transacted call. A failure between the two left the
//         advertiser billed for an impression that was never recorded. Here both
//         happen in one master transaction, and the budget charge is the first
//         write so a rejected budget writes nothing at all.

import { masterKnex } from "../../../core/db/master-pool.js";
import { NotFoundError } from "../../../shared/errors.js";
import { createChildLogger } from "../../../shared/logger.js";
import * as credits from "../../billing/services/credits.service.js";
import { InsufficientCreditsError } from "../../billing/errors.js";
import { publish } from "../../notifications/services/notifications.service.js";
import {
  ADS_PER_PLACEMENT,
  AD_REFERENCE_TYPE,
  CAMPAIGN_PAUSED_NOTIFICATION_TYPE,
  IMPRESSION_BLOCK_CREDITS,
  IMPRESSION_BLOCK_SIZE,
  impressionBlockIdempotencyKey,
} from "../consts.js";
import * as repo from "../repositories/ads.repository.js";
import { serveCreative } from "./serializers.js";
import type { ImpressionInput, LeadInput, ReportInput } from "../schemas/ads.schema.js";

const logger = createChildLogger("ads");

export interface EngagementResult {
  ok: boolean;
  deduplicated?: boolean;
  budget_exhausted?: boolean;
}

/** Signals "the dedup index rejected this insert" across the transaction boundary. */
class DedupRollback extends Error {}

// ── serving ─────────────────────────────────────────────────────────────────

/**
 * Up to ADS_PER_PLACEMENT ads for a slot.
 *
 * The eligibility filter (status, date window, budget, dismissals) is entirely in
 * SQL — see repo.findServeCandidates. V2 fetched every active campaign and
 * filtered in JavaScript, which transfers rows only to discard them.
 */
export async function serve(placement: string, viewerId: number | null) {
  const candidates = await repo.findServeCandidates(placement, viewerId);
  if (!candidates.length) return { ads: [] };

  const creatives = await repo.listActiveCreatives(candidates.map((c) => c.campaign_id));
  if (!creatives.length) return { ads: [] };

  const byCampaign = new Map<number, repo.CreativeRow[]>();
  for (const row of creatives) {
    const list = byCampaign.get(row.campaign_id);
    if (list) list.push(row);
    else byCampaign.set(row.campaign_id, [row]);
  }

  const served = [];
  for (const candidate of candidates) {
    const pool = byCampaign.get(candidate.campaign_id);
    if (!pool?.length) continue;
    const picked = pool[Math.floor(Math.random() * pool.length)];
    served.push({
      // Built field-by-field from SERVED_CAMPAIGN_COLUMNS — no budget, no spend, no
      // counters, no moderation trail. An anonymous caller learns nothing about the
      // advertiser's economics from an ad slot.
      campaign: {
        id: candidate.campaign_id,
        business_id: candidate.business_id,
        name: candidate.name,
        objective: candidate.objective,
        cost_model: candidate.cost_model,
      },
      creative: serveCreative(picked),
      placement,
      business_name: candidate.business_name ?? "Advertiser",
      business_logo: candidate.business_logo ?? null,
    });
  }

  // Rotate so the same campaign does not always win the top slot.
  served.sort(() => Math.random() - 0.5);
  return { ads: served.slice(0, ADS_PER_PLACEMENT) };
}

// ── impressions ─────────────────────────────────────────────────────────────

export async function recordImpression(viewerId: number, input: ImpressionInput): Promise<EngagementResult> {
  const campaign = await repo.findActiveCampaign(input.campaign_id);
  if (!campaign) throw new NotFoundError("Campaign not found or inactive");

  // V1's rolling-hour window, for parity. Not the guarantee — the UNIQUE index is.
  if (await repo.recentImpressionExists(campaign.id, input.placement, viewerId)) {
    return { ok: true, deduplicated: true };
  }

  const perView = campaign.cost_model === "cpv" ? Number(campaign.cost_per_unit) : 0;

  const outcome = await masterKnex
    .transaction(async (trx) => {
      // The budget charge is FIRST, and it is a conditional UPDATE holding the
      // campaign row (repo.chargeBudget). No room → the whole transaction rolls
      // back and nothing at all is written. V1 could charge then fail to record.
      if (perView > 0 && !(await repo.chargeBudget(campaign.id, perView, trx))) {
        return { budgetExhausted: true as const };
      }

      const impressionId = await repo.claimImpression(
        {
          campaign_id: campaign.id,
          creative_id: input.creative_id ?? null,
          placement: input.placement,
          viewer_user_id: viewerId,
          viewer_fingerprint: input.viewer_fingerprint ?? null,
          is_click: input.is_click,
          cost_charged: perView,
        },
        trx,
      );
      // Lost the dedup race. Rolling back un-charges the budget just taken, which
      // is the only correct outcome: no row, no charge.
      if (impressionId === null) throw new DedupRollback();

      const counters = await repo.bumpCounters(
        campaign.id,
        { impressions: 1, clicks: input.is_click ? 1 : 0 },
        trx,
      );
      return { counters };
    })
    .catch((err: unknown) => {
      if (err instanceof DedupRollback) return { deduplicated: true as const };
      throw err;
    });

  if ("budgetExhausted" in outcome) return { ok: false, budget_exhausted: true };
  if ("deduplicated" in outcome) return { ok: true, deduplicated: true };

  await settleImpressionBlock(campaign, outcome.counters.impressions_count);
  return { ok: true };
}

/**
 * V1's per-1,000-impressions credit charge, made exactly-once.
 *
 * `total` is the value the atomic increment returned, so exactly one caller ever
 * sees a given multiple of IMPRESSION_BLOCK_SIZE. The claim (compare-and-set on
 * billed_impression_blocks) is a second, independent guard that also covers a
 * replay after a crash, and the wallet debit's derived idempotency key is a third.
 *
 * Deliberately OUTSIDE the impression transaction: an impression that has been
 * recorded must stay recorded even when the wallet is empty.
 */
async function settleImpressionBlock(campaign: repo.ServingCampaign, total: number): Promise<void> {
  if (total <= 0 || total % IMPRESSION_BLOCK_SIZE !== 0) return;
  const block = total / IMPRESSION_BLOCK_SIZE;

  try {
    await masterKnex.transaction(async (trx) => {
      if (!(await repo.claimImpressionBlock(campaign.id, block, trx))) return;
      await credits.spendCredits(
        campaign.business_id,
        {
          amount: IMPRESSION_BLOCK_CREDITS,
          transaction_type: "ad_spend",
          description: `Ad campaign ${campaign.id} — ${IMPRESSION_BLOCK_SIZE} impressions`,
          reference_type: AD_REFERENCE_TYPE,
          reference_id: String(campaign.id),
          idempotency_key: impressionBlockIdempotencyKey(campaign.id, block),
        },
        null,
        trx,
      );
    });
  } catch (err) {
    // ONLY an empty wallet pauses the campaign. A bare catch here would treat a
    // deadlock, a serialization failure or a bug in spendCredits as "out of
    // credits": the block would silently stay unbilled (revenue lost with no
    // error surfaced) and the advertiser would be paused for a reason that was
    // never true. Anything that is not a 402 is a real fault and must propagate.
    if (!(err instanceof InsufficientCreditsError)) throw err;
    // The claim rolled back with the debit, so the block stays unbilled and a
    // later top-up can settle it. V1 paused the campaign here too — that part it
    // got right.
    await pauseForInsufficientCredits(campaign);
  }
}

async function pauseForInsufficientCredits(campaign: repo.ServingCampaign): Promise<void> {
  await repo.pauseCampaign(campaign.id);
  logger.warn("ad campaign paused — insufficient credits", {
    campaignId: campaign.id,
    businessId: campaign.business_id,
  });
  const ownerId = await repo.findBusinessOwner(campaign.business_id);
  if (!ownerId) return;
  // Best-effort by construction: publish() swallows broker failures, so a recorded
  // impression never 500s because the queue blinked.
  await publish({
    platform_user_ids: [ownerId],
    type: CAMPAIGN_PAUSED_NOTIFICATION_TYPE,
    title: "Ad campaign paused",
    body: "Your ad campaign has been paused — insufficient Credits. Top up to resume.",
    reference_type: AD_REFERENCE_TYPE,
    reference_id: String(campaign.id),
    dedupe_key: `ad_campaign_paused:${campaign.id}`,
  });
}

// ── leads ───────────────────────────────────────────────────────────────────

export async function recordLead(userId: number, input: LeadInput): Promise<EngagementResult> {
  const campaign = await repo.findActiveCampaign(input.campaign_id);
  if (!campaign) throw new NotFoundError("Campaign not found or inactive");

  if (await repo.recentLeadExists(campaign.id, userId, input.lead_type)) {
    return { ok: true, deduplicated: true };
  }

  const perLead = campaign.cost_model === "cpl" ? Number(campaign.cost_per_unit) : 0;

  const outcome = await masterKnex
    .transaction(async (trx) => {
      if (perLead > 0 && !(await repo.chargeBudget(campaign.id, perLead, trx))) {
        return { budgetExhausted: true as const };
      }

      const leadId = await repo.claimLead(
        {
          campaign_id: campaign.id,
          creative_id: input.creative_id ?? null,
          placement: input.placement,
          user_id: userId,
          lead_type: input.lead_type,
          cost_charged: perLead,
        },
        trx,
      );
      if (leadId === null) throw new DedupRollback();

      await repo.bumpCounters(campaign.id, { leads: 1 }, trx);
      return { leadId };
    })
    .catch((err: unknown) => {
      if (err instanceof DedupRollback) return { deduplicated: true as const };
      throw err;
    });

  if ("budgetExhausted" in outcome) return { ok: false, budget_exhausted: true };
  if ("deduplicated" in outcome) return { ok: true, deduplicated: true };
  return { ok: true };
}

// ── dismissals & reports ────────────────────────────────────────────────────

export async function dismiss(userId: number, campaignId: number): Promise<{ ok: true }> {
  // No existence check: dismissing a campaign that has gone away is a no-op, and a
  // 404 here would let a caller probe which campaign ids exist.
  await repo.dismiss(userId, campaignId);
  return { ok: true };
}

/** `created` is false when this reporter already has an open report on the campaign. */
export async function report(reporterId: number, input: ReportInput): Promise<{ ok: true; created: boolean }> {
  const campaign = await repo.findCampaign(input.campaign_id);
  if (!campaign) throw new NotFoundError("Campaign not found");
  const row = await repo.insertReport({
    campaign_id: input.campaign_id,
    creative_id: input.creative_id ?? null,
    reporter_user_id: reporterId,
    reason: input.reason,
    details: input.details ?? null,
  });
  return { ok: true, created: row !== null };
}
