// Platform-operator billing service: plan/coupon catalogue CRUD plus the two
// cross-business reports (subscribers, credit ledger) that are the whole reason
// billing lives in the master schema.

import { NotFoundError } from "../../../shared/errors.js";
import {
  buildPaginatedResponse,
  paginationToOffset,
  type PaginationInput,
} from "../../../shared/pagination.js";
import * as repo from "../repositories/billing.repository.js";
import type { SubscriptionStatus, TransactionType } from "../consts.js";

// ── Plans ───────────────────────────────────────────────────────────────────

export async function listPlans() {
  const plans = await repo.listPlans({ publicOnly: false });
  const features = await repo.listPlanFeatures(plans.map((p) => p.id));
  return plans.map((plan) => ({ ...plan, features: features.filter((f) => f.plan_id === plan.id) }));
}

export async function createPlan(input: Record<string, unknown>) {
  return repo.insertPlan(serialisePlan(input));
}

export async function updatePlan(id: number, input: Record<string, unknown>) {
  const row = await repo.updatePlan(id, serialisePlan(input));
  if (!row) throw new NotFoundError("Subscription plan not found");
  return row;
}

export async function deletePlan(id: number) {
  const affected = await repo.softDeletePlan(id);
  if (affected === 0) throw new NotFoundError("Subscription plan not found");
  return { deleted: true };
}

/** jsonb needs a string; text[] does not. Everything else passes through. */
function serialisePlan(input: Record<string, unknown>): Record<string, unknown> {
  const values = { ...input };
  if (values.limits !== undefined) values.limits = JSON.stringify(values.limits);
  return values;
}

// ── Coupons ─────────────────────────────────────────────────────────────────

export async function listCoupons() {
  return repo.listCoupons();
}

export async function createCoupon(input: Record<string, unknown>) {
  return repo.insertCoupon(input);
}

export async function updateCoupon(id: number, input: Record<string, unknown>) {
  const row = await repo.updateCoupon(id, input);
  if (!row) throw new NotFoundError("Coupon not found");
  return row;
}

export async function deleteCoupon(id: number) {
  const affected = await repo.softDeleteCoupon(id);
  if (affected === 0) throw new NotFoundError("Coupon not found");
  return { deleted: true };
}

// ── Reports ─────────────────────────────────────────────────────────────────

export async function listSubscribers(
  filters: { status?: SubscriptionStatus; planId?: number },
  pagination: PaginationInput,
) {
  const { limit, offset } = paginationToOffset(pagination);
  const { rows, total } = await repo.listSubscribers(filters, limit, offset);
  return buildPaginatedResponse(rows, total, pagination);
}

export async function listLedger(
  filters: { businessId?: number; transactionType?: TransactionType },
  pagination: PaginationInput,
) {
  const { limit, offset } = paginationToOffset(pagination);
  const [rows, total] = await Promise.all([
    repo.listLedger(filters, limit, offset),
    repo.countLedger(filters),
  ]);
  return buildPaginatedResponse(rows, total, pagination);
}
