// Distribution — pick the businesses that should see a lead, price it, fan it
// out, and queue the digest. Behavioural spec: V1 `distribute-enquiry`.

import { masterKnex } from "../../../core/db/master-pool.js";
import { createChildLogger } from "../../../shared/logger.js";
import {
  DEFAULT_COIN_COST,
  MAX_DISTRIBUTIONS,
  MIN_COIN_COST,
} from "../consts.js";
import * as repo from "../repositories/enquiries.repository.js";

const logger = createChildLogger("enquiry-distribution");

export interface DistributionResult {
  distributed_to: number;
  recipients: Array<{ business_id: number; coin_cost: number; distance_km: number | null }>;
}

/**
 * Price one lead for one recipient.
 *
 * V1 multiplied the base cost by a student-profile-completion factor, but its own
 * UI only let 100%-complete profiles raise an enquiry, so the factor was always
 * 1.0 — every V1 distribution row is priced 30, the base. V3 keeps the floor and
 * the per-business base and drops the multiplier that never fired.
 */
export function priceLead(baseCost: number | null | undefined): number {
  const base = baseCost == null || baseCost <= 0 ? DEFAULT_COIN_COST : baseCost;
  return Math.max(MIN_COIN_COST, Math.round(base));
}

/**
 * Distribute (or re-distribute) an enquiry.
 *
 * Idempotent: recipients already holding a distribution are excluded up front,
 * and the insert falls back on UNIQUE (enquiry_id, business_id), so calling this
 * twice never produces a second chargeable copy of the same lead.
 */
export async function distribute(enquiry: repo.EnquiryRow): Promise<DistributionResult> {
  const origin = await repo.findStudentOrigin(enquiry.student_id);

  const existing = await masterKnex("enquiry_distributions")
    .where({ enquiry_id: enquiry.id })
    .pluck<number[]>("business_id");
  const chosen = new Map<number, repo.Candidate>();
  const exclude = new Set<number>(existing);

  // Businesses the student named explicitly always get the lead, regardless of
  // distance — asking an agent by name is a stronger signal than proximity.
  const namedIds = [
    enquiry.target_org_type === "business" ? enquiry.target_org_id : null,
    enquiry.agent_business_id,
  ].filter((id): id is number => id != null);

  for (const id of namedIds) {
    if (exclude.has(id) || chosen.has(id)) continue;
    const named = await repo.findEligibleBusiness(id);
    if (named) chosen.set(id, named);
  }

  // The cap is on the enquiry's TOTAL reach, not on one run of this function.
  // Counting only `chosen` would let a re-distribution top the list up to five
  // fresh recipients every time it was called.
  const remaining = MAX_DISTRIBUTIONS - existing.length - chosen.size;
  if (remaining > 0) {
    const candidates = await repo.selectCandidates({
      origin,
      target:
        enquiry.target_org_type && enquiry.target_org_id
          ? { type: enquiry.target_org_type, id: enquiry.target_org_id }
          : null,
      excludeIds: [...exclude, ...chosen.keys()],
      limit: remaining,
    });
    for (const candidate of candidates) chosen.set(candidate.id, candidate);
  }

  if (chosen.size === 0) {
    logger.info("no eligible recipients", { enquiryId: enquiry.id, hasOrigin: origin.latitude != null });
    return { distributed_to: 0, recipients: [] };
  }

  const created = await masterKnex.transaction(async (trx) => {
    const rows = await repo.insertDistributions(
      [...chosen.values()].map((c) => ({
        enquiry_id: enquiry.id,
        business_id: c.id,
        coin_cost: priceLead(c.enquiry_coin_cost),
        distance_km: c.distance_km == null ? null : Number(c.distance_km.toFixed(2)),
      })),
      trx,
    );

    // Queue the digest in the same transaction as the fan-out: a lead that exists
    // but was never queued would silently never be emailed.
    await repo.enqueueDigestRows(
      rows.map((r) => ({ distribution_id: r.id, business_id: r.business_id })),
      trx,
    );

    if (rows.length > 0) {
      await repo.setEnquiryFields(enquiry.id, { distributed_at: new Date() }, trx);
    }
    return rows;
  });

  logger.info("distributed", { enquiryId: enquiry.id, count: created.length });
  return {
    distributed_to: created.length,
    recipients: created.map((r) => ({
      business_id: r.business_id,
      coin_cost: r.coin_cost,
      distance_km: r.distance_km == null ? null : Number(r.distance_km),
    })),
  };
}
