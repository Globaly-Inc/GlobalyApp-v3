// Knex queries for applications + charges. No business logic here.
//
// ── THREE PROJECTIONS, NEVER ONE ──
// application_charges carries `student_id` (PII) and `idempotency_key` (the money
// path's arbiter). There are three deliberately different column lists:
//
//   OWNER_CHARGE_COLUMNS  what the paying business sees — V2's projection exactly
//                         (id, credits_charged, status, created_at, service_name).
//                         NOT the student: a billing screen has no reason to
//                         re-identify the applicant, and V2 agreed.
//   ADMIN_CHARGE_COLUMNS  what a super-admin sees, which does include the student,
//                         because V1's AdminApplicationCharges page renders it and
//                         a moderator adjudicating a refund needs to know who.
//   (no public projection)  nothing here is ever anonymous-readable.
//
// `idempotency_key` appears in NO projection. It is internal.
// No `select *`, no bare `.first()`, anywhere in this file.

import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";

export type Db = Knex | Knex.Transaction;
export const db = (trx?: Db): Db => trx ?? masterKnex;

export const APPLICATION_COLUMNS = [
  "id",
  "student_id",
  "org_type",
  "org_id",
  "business_id",
  "service_id",
  "status",
  "notes",
  "submitted_at",
  "decided_at",
  "decided_by",
  "created_at",
  "updated_at",
] as const;

export interface ApplicationRow {
  id: number;
  student_id: number;
  org_type: string | null;
  org_id: number | null;
  business_id: number | null;
  service_id: number | null;
  status: string;
  notes: string | null;
  submitted_at: Date | null;
  decided_at: Date | null;
  decided_by: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface ChargeRow {
  id: number;
  business_id: number;
  application_id: number;
  student_id: number | null;
  service_id: number | null;
  credits_charged: number;
  status: string;
  charged_at: Date;
  credit_transaction_id: number | null;
  refund_transaction_id: number | null;
  waived_by: number | null;
  waived_at: Date | null;
  refunded_at: Date | null;
  created_at: Date;
}

const CHARGE_BASE_COLUMNS = [
  "id",
  "business_id",
  "application_id",
  "student_id",
  "service_id",
  "credits_charged",
  "status",
  "charged_at",
  "credit_transaction_id",
  "refund_transaction_id",
  "waived_by",
  "waived_at",
  "refunded_at",
  "created_at",
] as const;

// ── applications ────────────────────────────────────────────────────────────

export async function insertApplication(values: Record<string, unknown>): Promise<ApplicationRow> {
  const [row] = await masterKnex("applications").insert(values).returning([...APPLICATION_COLUMNS]);
  return row as ApplicationRow;
}

export async function findApplicationForStudent(
  id: number,
  studentId: number,
): Promise<ApplicationRow | undefined> {
  return masterKnex<ApplicationRow>("applications")
    .where("id", id)
    .where("student_id", studentId)
    .whereNull("deleted_at")
    .first(...APPLICATION_COLUMNS);
}

/**
 * The isolation primitive for the business inbox. `businessId` comes from
 * req.business, so business B asking for business A's application gets undefined —
 * which the service turns into a 404, never a 403.
 */
export async function findApplicationForBusiness(
  id: number,
  businessId: number,
  trx?: Db,
): Promise<ApplicationRow | undefined> {
  return db(trx)<ApplicationRow>("applications")
    .where("id", id)
    .where("business_id", businessId)
    .whereNull("deleted_at")
    .first(...APPLICATION_COLUMNS);
}

export async function listApplications(
  filters: { studentId?: number; businessId?: number; status?: string },
  limit: number,
  offset: number,
): Promise<ApplicationRow[]> {
  const qb = masterKnex<ApplicationRow>("applications").whereNull("deleted_at");
  if (filters.studentId) qb.where("student_id", filters.studentId);
  if (filters.businessId) qb.where("business_id", filters.businessId);
  if (filters.status) qb.where("status", filters.status);
  return qb.orderBy("created_at", "desc").limit(limit).offset(offset).select(...APPLICATION_COLUMNS);
}

export async function countApplications(filters: {
  studentId?: number;
  businessId?: number;
  status?: string;
}): Promise<number> {
  const qb = masterKnex("applications").whereNull("deleted_at");
  if (filters.studentId) qb.where("student_id", filters.studentId);
  if (filters.businessId) qb.where("business_id", filters.businessId);
  if (filters.status) qb.where("status", filters.status);
  const row = await qb.count<{ count: string }[]>("id as count");
  return Number(row[0]?.count ?? 0);
}

/**
 * Move an application to a decision, ONLY from a state that has not decided yet.
 *
 * `whereIn(status, ['submitted','under_review'])` makes this a compare-and-set: a
 * second accept matches nothing and returns undefined, so the caller knows it did
 * not win without reading first and deciding after.
 */
export async function decideApplication(
  id: number,
  businessId: number,
  values: { status: string; decided_by: number | null; notes?: string | null },
  trx: Db,
): Promise<ApplicationRow | undefined> {
  const [row] = (await trx("applications")
    .where({ id, business_id: businessId })
    .whereIn("status", ["submitted", "under_review"])
    .whereNull("deleted_at")
    .update({
      status: values.status,
      decided_by: values.decided_by,
      decided_at: trx.fn.now(),
      ...(values.notes === undefined ? {} : { notes: values.notes }),
      updated_at: trx.fn.now(),
    })
    .returning([...APPLICATION_COLUMNS])) as ApplicationRow[];
  return row;
}

export async function businessExists(id: number): Promise<boolean> {
  const row = await masterKnex("businesses").where("id", id).whereNull("deleted_at").first("id");
  return Boolean(row);
}

export async function institutionExists(id: number): Promise<boolean> {
  const row = await masterKnex("institutions").where("id", id).first("id");
  return Boolean(row);
}

// ── charges ─────────────────────────────────────────────────────────────────

export async function findChargeByApplication(
  applicationId: number,
  trx?: Db,
): Promise<ChargeRow | undefined> {
  return db(trx)<ChargeRow>("application_charges")
    .where("application_id", applicationId)
    .first(...CHARGE_BASE_COLUMNS);
}

export async function findCharge(id: number, trx?: Db): Promise<ChargeRow | undefined> {
  return db(trx)<ChargeRow>("application_charges").where("id", id).first(...CHARGE_BASE_COLUMNS);
}

/**
 * Claim the charge. Returns undefined when the NOT NULL UNIQUE idempotency_key is
 * already taken — i.e. somebody else is charging or has charged this application.
 *
 * This is the FIRST write of the charge transaction, before the wallet debit, so:
 *   * two concurrent accepts → the loser blocks on the index, conflicts, and
 *     reports "already charged" without ever reaching the debit;
 *   * a failed debit → this row rolls back with it, leaving nothing to clean up.
 */
export async function claimCharge(
  values: Record<string, unknown>,
  trx: Db,
): Promise<ChargeRow | undefined> {
  const rows = (await trx("application_charges")
    .insert(values)
    .onConflict("idempotency_key")
    .ignore()
    .returning([...CHARGE_BASE_COLUMNS])) as ChargeRow[];
  return rows[0];
}

export async function attachChargeTransaction(id: number, transactionId: number, trx: Db): Promise<void> {
  await trx("application_charges")
    .where({ id })
    .update({ credit_transaction_id: transactionId, updated_at: trx.fn.now() });
}

/**
 * Compare-and-set the charge into a terminal void state, from `charged` only.
 *
 * This is what makes waive/refund non-replayable, and it runs BEFORE the credit
 * grant in the same transaction. V1 granted first and updated after, on two
 * un-transacted calls: a failure in between left the credits granted and the row
 * still reading `charged`, so the button minted credits on every press (D-G5-4).
 */
export async function claimVoid(
  id: number,
  status: "waived" | "refunded",
  actor: { adminId: number | null },
  trx: Db,
): Promise<ChargeRow | undefined> {
  const patch: Record<string, unknown> = { status, updated_at: trx.fn.now() };
  if (status === "waived") {
    patch.waived_at = trx.fn.now();
    patch.waived_by = actor.adminId;
  } else {
    patch.refunded_at = trx.fn.now();
  }
  const rows = (await trx("application_charges")
    .where({ id, status: "charged" })
    .update(patch)
    .returning([...CHARGE_BASE_COLUMNS])) as ChargeRow[];
  return rows[0];
}

export async function attachRefundTransaction(id: number, transactionId: number, trx: Db): Promise<void> {
  await trx("application_charges")
    .where({ id })
    .update({ refund_transaction_id: transactionId, updated_at: trx.fn.now() });
}

/** OWNER projection — V2's exactly. No student, no idempotency key. */
export async function listOwnerCharges(
  businessId: number,
  filters: { status?: string },
  limit: number,
  offset: number,
) {
  const qb = masterKnex("application_charges").where("application_charges.business_id", businessId);
  if (filters.status) qb.where("application_charges.status", filters.status);
  return qb
    .orderBy("application_charges.charged_at", "desc")
    .limit(limit)
    .offset(offset)
    .select(
      "application_charges.id as id",
      "application_charges.credits_charged as credits_charged",
      "application_charges.status as status",
      "application_charges.created_at as created_at",
      // The service catalogue is per-tenant so it cannot be joined from master.
      // Resolved by the service against req.db; null until then.
      "application_charges.service_id as service_id",
    );
}

export async function countOwnerCharges(
  businessId: number,
  filters: { status?: string },
): Promise<number> {
  const qb = masterKnex("application_charges").where("business_id", businessId);
  if (filters.status) qb.where("status", filters.status);
  const row = await qb.count<{ count: string }[]>("id as count");
  return Number(row[0]?.count ?? 0);
}

interface AdminChargeFilters {
  status?: string;
  businessId?: number;
  from?: string;
  to?: string;
}

function adminChargeQuery(filters: AdminChargeFilters) {
  const qb = masterKnex("application_charges");
  if (filters.status) qb.where("application_charges.status", filters.status);
  if (filters.businessId) qb.where("application_charges.business_id", filters.businessId);
  if (filters.from) qb.where("application_charges.charged_at", ">=", filters.from);
  if (filters.to) qb.where("application_charges.charged_at", "<=", filters.to);
  return qb;
}

/**
 * ADMIN projection. Includes the student's name — V1's page renders it, and a
 * moderator adjudicating a refund has to know whose application it was. Still not
 * the idempotency key.
 */
export async function listAdminCharges(filters: AdminChargeFilters, limit: number, offset: number) {
  return adminChargeQuery(filters)
    .leftJoin("businesses", "businesses.id", "application_charges.business_id")
    .leftJoin("platform_users", "platform_users.id", "application_charges.student_id")
    .orderBy("application_charges.charged_at", "desc")
    .limit(limit)
    .offset(offset)
    .select(
      "application_charges.id as id",
      "application_charges.business_id as business_id",
      "application_charges.application_id as application_id",
      "application_charges.student_id as student_id",
      "application_charges.service_id as service_id",
      "application_charges.credits_charged as credits_charged",
      "application_charges.status as status",
      "application_charges.charged_at as charged_at",
      "application_charges.waived_at as waived_at",
      "application_charges.refunded_at as refunded_at",
      "application_charges.created_at as created_at",
      "businesses.business_name as business_name",
      masterKnex.raw(
        `nullif(trim(coalesce(platform_users.first_name, '') || ' ' || coalesce(platform_users.last_name, '')), '') as student_name`,
      ),
    );
}

export async function countAdminCharges(filters: AdminChargeFilters): Promise<number> {
  const row = await adminChargeQuery(filters).count<{ count: string }[]>("application_charges.id as count");
  return Number(row[0]?.count ?? 0);
}

export async function chargeStats(): Promise<{
  total: number;
  charged: number;
  waived: number;
  refunded: number;
  credits_charged: number;
}> {
  const rows = await masterKnex("application_charges")
    .groupBy("status")
    .select("status")
    .count<{ status: string; count: string; credits: string }[]>("id as count")
    .sum("credits_charged as credits");

  const byStatus = new Map(rows.map((r) => [r.status, r]));
  const n = (s: string) => Number(byStatus.get(s)?.count ?? 0);
  return {
    total: rows.reduce((sum, r) => sum + Number(r.count), 0),
    charged: n("charged"),
    waived: n("waived"),
    refunded: n("refunded"),
    // Credits actually retained by the platform: charged only. Waived and refunded
    // rows have had the money handed back, so counting them would overstate revenue
    // — which is exactly what V1's page did by summing every row.
    credits_charged: Number(byStatus.get("charged")?.credits ?? 0),
  };
}
