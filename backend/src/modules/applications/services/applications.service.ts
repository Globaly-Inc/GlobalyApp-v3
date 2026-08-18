// Student applications: submit, list, and the business-side decision.
//
// Schema spec: V2 `applications`. The charge that fires on acceptance is
// charges.service.ts, and V1's `charge-application` is its behavioural spec.

import { masterKnex } from "../../../core/db/master-pool.js";
import { BadRequestError, NotFoundError } from "../../../shared/errors.js";
import {
  buildPaginatedResponse,
  paginationToOffset,
} from "../../../shared/pagination.js";
import { createChildLogger } from "../../../shared/logger.js";
import * as repo from "../repositories/applications.repository.js";
import { chargeForApplication } from "./charges.service.js";
import type {
  BusinessApplicationsInput,
  CreateApplicationInput,
  MyApplicationsInput,
} from "../schemas/applications.schema.js";

const logger = createChildLogger("applications");

const iso = (value: Date | string | null) => (value === null ? null : new Date(value).toISOString());

function serialize(row: repo.ApplicationRow) {
  return {
    id: row.id,
    student_id: row.student_id,
    org_type: row.org_type,
    org_id: row.org_id,
    business_id: row.business_id,
    service_id: row.service_id,
    status: row.status,
    notes: row.notes,
    submitted_at: iso(row.submitted_at),
    decided_at: iso(row.decided_at),
    decided_by: row.decided_by,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}

// ── student ─────────────────────────────────────────────────────────────────

/**
 * Submit an application.
 *
 * There is no draft step: V1's UI created the row already submitted, and a `draft`
 * an applicant can never reach is dead state. `draft` stays in the CHECK
 * constraint for the V1 loader's benefit.
 *
 * The org reference is validated against the real table here rather than by a FK,
 * because (org_type, org_id) is polymorphic across `businesses` and `institutions`
 * — the same app-level FK pattern as scholarships' owner pair.
 */
export async function submit(studentId: number, input: CreateApplicationInput) {
  const exists =
    input.org_type === "business"
      ? await repo.businessExists(input.org_id)
      : await repo.institutionExists(input.org_id);
  if (!exists) throw new NotFoundError(`No such ${input.org_type}`);

  const row = await repo.insertApplication({
    student_id: studentId,
    org_type: input.org_type,
    org_id: input.org_id,
    // Denormalised so the inbox and the charge path filter on one indexed column.
    // Only a business can be billed; an institution has no wallet.
    business_id: input.org_type === "business" ? input.org_id : null,
    service_id: input.service_id ?? null,
    status: "submitted",
    notes: input.notes ?? null,
    submitted_at: masterKnex.fn.now(),
  });
  logger.info("application submitted", { applicationId: row.id, studentId, orgId: input.org_id });
  return serialize(row);
}

export async function listMine(studentId: number, query: MyApplicationsInput) {
  const { limit, offset } = paginationToOffset(query);
  const filters = { studentId, status: query.status };
  const [rows, total] = await Promise.all([
    repo.listApplications(filters, limit, offset),
    repo.countApplications(filters),
  ]);
  return buildPaginatedResponse(rows.map(serialize), total, query);
}

// ── business inbox ──────────────────────────────────────────────────────────

export async function listForBusiness(businessId: number, query: BusinessApplicationsInput) {
  const { limit, offset } = paginationToOffset(query);
  const filters = { businessId, status: query.status };
  const [rows, total] = await Promise.all([
    repo.listApplications(filters, limit, offset),
    repo.countApplications(filters),
  ]);
  return buildPaginatedResponse(rows.map(serialize), total, query);
}

export async function getForBusiness(businessId: number, id: number) {
  const row = await repo.findApplicationForBusiness(id, businessId);
  if (!row) throw new NotFoundError("Application not found");
  return serialize(row);
}

/**
 * Accept an application — the monetised verb.
 *
 * ONE master transaction containing the decision AND the charge, in that order,
 * with the wallet debit last (see charges.service.chargeForApplication). So:
 *   * unfunded wallet → spendCredits throws 402, everything rolls back, and the
 *     application is still `submitted`. The business does not get an outcome it
 *     has not paid for, and V1's orphan `pending` charge row never exists.
 *   * two concurrent accepts → the charge's UNIQUE idempotency_key arbitrates;
 *     one debit, one charge row, and both callers get a 200.
 *   * a replay days later → the committed charge is found first and returned as
 *     already_charged, with no second debit.
 */
export async function accept(businessId: number, id: number, actorId: number | null) {
  const application = await repo.findApplicationForBusiness(id, businessId);
  if (!application) throw new NotFoundError("Application not found");

  // Fast path: already decided AND already charged is a replay, not an error.
  if (application.status === "accepted") {
    const charge = await repo.findChargeByApplication(id);
    if (charge) {
      return {
        ...serialize(application),
        charge_id: charge.id,
        credits_charged: charge.credits_charged,
        already_charged: true,
      };
    }
  }
  if (application.status === "rejected" || application.status === "withdrawn") {
    throw new BadRequestError(`Application is already ${application.status}`);
  }

  return masterKnex.transaction(async (trx) => {
    const decided = await repo.decideApplication(
      id,
      businessId,
      { status: "accepted", decided_by: actorId },
      trx,
    );
    // Lost the compare-and-set: another accept is committing. Report its result
    // rather than charging a second time.
    if (!decided) {
      const winner = await repo.findApplicationForBusiness(id, businessId, trx);
      const charge = await repo.findChargeByApplication(id, trx);
      if (!winner || !charge) throw new NotFoundError("Application not found");
      return {
        ...serialize(winner),
        charge_id: charge.id,
        credits_charged: charge.credits_charged,
        already_charged: true,
      };
    }

    const outcome = await chargeForApplication(
      {
        id: decided.id,
        business_id: businessId,
        student_id: decided.student_id,
        service_id: decided.service_id,
      },
      actorId,
      trx,
    );
    return { ...serialize(decided), ...outcome };
  });
}

/** Rejecting is free — nothing was delivered, so nothing is billed. */
export async function reject(businessId: number, id: number, actorId: number | null, note?: string) {
  const application = await repo.findApplicationForBusiness(id, businessId);
  if (!application) throw new NotFoundError("Application not found");
  if (application.status === "rejected") return serialize(application);

  const decided = await masterKnex.transaction((trx) =>
    repo.decideApplication(
      id,
      businessId,
      { status: "rejected", decided_by: actorId, notes: note ?? application.notes },
      trx,
    ),
  );
  if (!decided) throw new BadRequestError(`Application is already ${application.status}`);
  return serialize(decided);
}
