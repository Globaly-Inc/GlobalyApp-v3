// Admin ad moderation — the cross-tenant view §3.8 names `admin/marketing/ads`.
//
// Spec: V1's src/pages/admin/AdminAds.tsx. Three verbs (approve → active,
// reject + reason, force-pause), a status-filtered list across every business, and
// the pending-report count.
//
// V2's ads.ts has NO admin routes at all — its RLS policies granted admins full
// access to ad_campaigns and left the UI to talk to Postgres directly. That is not
// portable to a REST backend, so these three verbs are derived from what the V1
// page actually sent, not from a V2 route file. Recorded as a §3.8 contradiction.

import { NotFoundError } from "../../../shared/errors.js";
import { buildPaginatedResponse, paginationToOffset } from "../../../shared/pagination.js";
import { AD_STATUSES } from "../consts.js";
import * as repo from "../repositories/ads.repository.js";
import * as serialize from "./serializers.js";
import type { AdminCampaignListInput } from "../schemas/ads.schema.js";
import type { PaginationInput } from "../../../shared/pagination.js";

export async function list(query: AdminCampaignListInput) {
  const { limit, offset } = paginationToOffset(query);
  const filters = { status: query.status, businessId: query.business_id, q: query.q };
  const [rows, total] = await Promise.all([
    repo.listCampaigns(filters, limit, offset),
    repo.countCampaigns(filters),
  ]);
  return buildPaginatedResponse(rows.map(serialize.ownerCampaign), total, query);
}

export async function stats() {
  const [counts, pendingReports] = await Promise.all([
    repo.campaignStatusCounts(),
    repo.countReports({ status: "pending" }),
  ]);
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  return {
    total,
    // Every status present with an explicit zero, so the UI never has to guard a
    // missing key — V1's page did `filter(...).length || 0` per status.
    ...Object.fromEntries(AD_STATUSES.map((s) => [s, counts[s] ?? 0])),
    pending_reports: pendingReports,
  } as Record<string, number>;
}

async function transition(id: number, values: Record<string, unknown>, adminId: number) {
  const row = await repo.moderateCampaign(id, {
    ...values,
    reviewed_by: adminId,
    reviewed_at: new Date(),
  });
  if (!row) throw new NotFoundError("Campaign not found");
  return serialize.ownerCampaign(row);
}

/** Approve → active. Clears any previous rejection so the reason cannot outlive it. */
export async function approve(id: number, adminId: number) {
  return transition(id, { status: "active", rejection_reason: null }, adminId);
}

/**
 * Reject with a reason. The reason is REQUIRED — by RejectSchema at the boundary
 * and by ad_campaigns_rejection_reason_check in the database, because V1 allowed a
 * silent rejection that left the advertiser with no way to find out why.
 */
export async function reject(id: number, adminId: number, reason: string) {
  return transition(id, { status: "rejected", rejection_reason: reason }, adminId);
}

/** Force-pause. Does not clear rejection_reason: pausing is not a re-review. */
export async function pause(id: number, adminId: number) {
  return transition(id, { status: "paused" }, adminId);
}

export async function listReports(query: PaginationInput & { status?: string }) {
  const { limit, offset } = paginationToOffset(query);
  const filters = { status: query.status };
  const [rows, total] = await Promise.all([
    repo.listReports(filters, limit, offset),
    repo.countReports(filters),
  ]);
  return buildPaginatedResponse(rows, total, query);
}
