// Enquiry repository — Knex only, always against the master schema (see the
// header of 20260817_100_enquiries.ts for why nothing here is per-tenant).
//
// Tenant isolation is this layer's job: every business-scoped read takes a
// business_id and filters on it, and routes derive that id from req.business,
// never from the request body.

import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";
import {
  DISTRIBUTION_RADIUS_KM,
  NEARBY_RADIUS_KM,
  type DistributionStatus,
  type EnquiryStatus,
} from "../consts.js";

export type Db = Knex | Knex.Transaction;

export function db(trx?: Db): Db {
  return trx ?? masterKnex;
}

// ── Rows ────────────────────────────────────────────────────────────────────

export interface EnquiryRow {
  id: number;
  v1_id: string | null;
  student_id: number;
  target_org_type: "business" | "institution" | null;
  target_org_id: number | null;
  service_id: string | null;
  agent_business_id: number | null;
  message: string;
  preferred_intake: string | null;
  preferred_year: number | null;
  status: EnquiryStatus;
  assigned_to: number | null;
  distributed_at: Date | null;
  converted_at: Date | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface DistributionRow {
  id: number;
  v1_id: string | null;
  enquiry_id: number;
  business_id: number;
  coin_cost: number;
  distance_km: string | null;
  status: DistributionStatus;
  closed_at: Date | null;
  close_reason: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

/** What the close transition writes back. No student columns — see closeDistribution. */
export interface ClosedDistribution {
  id: number;
  status: DistributionStatus;
  closed_at: Date | null;
  close_reason: string | null;
}

export interface UnlockRow {
  id: number;
  distribution_id: number;
  enquiry_id: number;
  business_id: number;
  unlocked_by: number | null;
  credits_spent: number;
  credit_transaction_id: number | null;
  created_at: Date;
}

export interface Candidate {
  id: number;
  enquiry_coin_cost: number;
  distance_km: number | null;
  is_representative: boolean;
}

// ── Enquiries ───────────────────────────────────────────────────────────────

export async function insertEnquiry(
  values: Partial<EnquiryRow>,
  trx?: Db,
): Promise<EnquiryRow> {
  const [row] = await db(trx)<EnquiryRow>("enquiries").insert(values).returning("*");
  return row;
}

export async function findEnquiry(id: number, trx?: Db): Promise<EnquiryRow | undefined> {
  return db(trx)<EnquiryRow>("enquiries").where({ id }).whereNull("deleted_at").first();
}

export async function setEnquiryFields(
  id: number,
  values: Partial<EnquiryRow>,
  trx?: Db,
): Promise<void> {
  await db(trx)("enquiries")
    .where({ id })
    .whereNull("deleted_at")
    .update({ ...values, updated_at: db(trx).fn.now() });
}

/** V1's `validate_enquiry_rate_limit` trigger, as a query. */
export async function countRecentEnquiries(studentId: number, windowHours: number): Promise<number> {
  const rows = await masterKnex("enquiries")
    .where({ student_id: studentId })
    .whereNull("deleted_at")
    .whereRaw("created_at > now() - (? || ' hours')::interval", [windowHours])
    .count<{ count: string }[]>("id as count");
  return Number(rows[0]?.count ?? 0);
}

function myEnquiriesQuery(studentId: number, status?: EnquiryStatus) {
  const q = masterKnex("enquiries").where({ student_id: studentId }).whereNull("deleted_at");
  if (status) q.where({ status });
  return q;
}

export async function listEnquiriesByStudent(
  studentId: number,
  status: EnquiryStatus | undefined,
  limit: number,
  offset: number,
) {
  return myEnquiriesQuery(studentId, status)
    .select(
      "enquiries.*",
      masterKnex.raw(
        `(SELECT count(*)::int FROM enquiry_distributions d
            WHERE d.enquiry_id = enquiries.id AND d.deleted_at IS NULL) AS distributed_to`,
      ),
      masterKnex.raw(
        `(SELECT count(*)::int FROM enquiry_unlocks u
            WHERE u.enquiry_id = enquiries.id AND u.deleted_at IS NULL) AS unlocked_by_count`,
      ),
    )
    .orderBy("created_at", "desc")
    .orderBy("id", "desc")
    .limit(limit)
    .offset(offset);
}

export async function countEnquiriesByStudent(
  studentId: number,
  status?: EnquiryStatus,
): Promise<number> {
  const rows = await myEnquiriesQuery(studentId, status).count<{ count: string }[]>("id as count");
  return Number(rows[0]?.count ?? 0);
}

// ── Distribution matching ───────────────────────────────────────────────────

/** The origin point distribution measures from: the student's own coordinates. */
export async function findStudentOrigin(
  studentId: number,
): Promise<{ latitude: number | null; longitude: number | null }> {
  const row = await masterKnex("platform_user_profiles")
    .where({ user_id: studentId })
    .whereNull("deleted_at")
    .first("latitude", "longitude");
  return {
    latitude: row?.latitude == null ? null : Number(row.latitude),
    longitude: row?.longitude == null ? null : Number(row.longitude),
  };
}

/**
 * Great-circle distance in kilometres, in plain SQL.
 *
 * Haversine with the `asin` form — no PostGIS, no earthdistance, no new
 * extension: this is four trig calls on two numeric columns, which is cheaper
 * than the dependency at every volume this table will ever see.
 * ponytail: at millions of businesses, add a lat/lng bounding-box prefilter so
 * an index can be used before the trig runs.
 */
const DISTANCE_KM_SQL = `
  CASE WHEN b.latitude IS NULL OR b.longitude IS NULL THEN NULL ELSE
    6371 * 2 * asin(sqrt(
      power(sin(radians(b.latitude::float8 - ?) / 2), 2)
      + cos(radians(?)) * cos(radians(b.latitude::float8))
      * power(sin(radians(b.longitude::float8 - ?) / 2), 2)
    ))
  END`;

interface CandidateFilters {
  origin: { latitude: number | null; longitude: number | null };
  /** The org the enquiry targets — its active representatives rank first. */
  target: { type: "business" | "institution"; id: number } | null;
  excludeIds: number[];
  limit: number;
}

/**
 * Eligible recipients, best first.
 *
 * With a known origin this is a HARD radius: a business further than
 * DISTRIBUTION_RADIUS_KM, or with no coordinates at all, is not a candidate.
 * That is stricter than V1, which topped the list up with arbitrary verified
 * agents whenever the tiers under-filled — so a London lead could land on a
 * Sydney desk and be charged for. Without an origin there is nothing to measure,
 * so the unfiltered verified pool is the only sensible fallback (V1 tier 4).
 *
 * Ordering mirrors V1's tiers without running three queries to produce one list:
 * active representatives of the target org first, then the ≤20 km band, then by
 * distance.
 */
export async function selectCandidates(filters: CandidateFilters): Promise<Candidate[]> {
  const { origin, target, excludeIds, limit } = filters;
  if (limit <= 0) return [];

  const hasOrigin = origin.latitude != null && origin.longitude != null;
  const lat = origin.latitude ?? 0;
  const lng = origin.longitude ?? 0;

  const distanceExpr = hasOrigin ? DISTANCE_KM_SQL : "NULL::float8";
  const distanceBindings = hasOrigin ? [lat, lat, lng] : [];

  const q = masterKnex("businesses as b")
    .select(
      "b.id",
      "b.enquiry_coin_cost",
      masterKnex.raw(`${distanceExpr} AS distance_km`, distanceBindings),
      masterKnex.raw("(r.id IS NOT NULL) AS is_representative"),
    )
    .leftJoin("representations as r", function joinRepresentation() {
      this.on("r.agent_org_type", masterKnex.raw("'business'"))
        .andOn("r.agent_org_id", "b.id")
        .andOn("r.status", masterKnex.raw("'active'"))
        .andOnNull("r.deleted_at");
      if (target) {
        this.andOn("r.institution_org_type", masterKnex.raw("?", [target.type])).andOn(
          "r.institution_org_id",
          masterKnex.raw("?", [target.id]),
        );
      } else {
        // No target org — the join can never match, so it degrades to `false`.
        this.andOn(masterKnex.raw("false"));
      }
    })
    .whereNull("b.deleted_at")
    .where("b.account_status", 1)
    .where("b.enquiry_enabled", true)
    .where("b.status", "verified")
    .limit(limit);

  if (excludeIds.length > 0) q.whereNotIn("b.id", excludeIds);

  if (hasOrigin) {
    q.whereRaw(`${DISTANCE_KM_SQL} <= ?`, [lat, lat, lng, DISTRIBUTION_RADIUS_KM]);
    q.orderByRaw("(r.id IS NOT NULL) DESC");
    q.orderByRaw(`(${DISTANCE_KM_SQL}) <= ? DESC`, [lat, lat, lng, NEARBY_RADIUS_KM]);
    q.orderByRaw(`(${DISTANCE_KM_SQL}) ASC`, [lat, lat, lng]);
  } else {
    q.orderByRaw("(r.id IS NOT NULL) DESC");
  }
  q.orderBy("b.id", "asc");

  const rows = await q;
  return rows.map((r: Record<string, unknown>) => ({
    id: Number(r.id),
    enquiry_coin_cost: Number(r.enquiry_coin_cost),
    distance_km: r.distance_km == null ? null : Number(r.distance_km),
    is_representative: r.is_representative === true,
  }));
}

/**
 * A business the student named explicitly (target org, or agent_business_id).
 * It bypasses the radius — the student asked for it — but not the eligibility
 * rules, because an unverified or enquiry-disabled business still cannot be
 * charged for a lead it never opted into.
 */
export async function findEligibleBusiness(id: number): Promise<Candidate | undefined> {
  const row = await masterKnex("businesses")
    .where({ id, account_status: 1, enquiry_enabled: true, status: "verified" })
    .whereNull("deleted_at")
    .first("id", "enquiry_coin_cost");
  if (!row) return undefined;
  return {
    id: Number(row.id),
    enquiry_coin_cost: Number(row.enquiry_coin_cost),
    distance_km: null,
    is_representative: false,
  };
}

// ── Distributions ───────────────────────────────────────────────────────────

/**
 * Insert the fan-out. `ON CONFLICT (enquiry_id, business_id) DO NOTHING` means
 * re-running distribution for the same enquiry adds nothing and charges nobody —
 * the pair UNIQUE is the guard, not a prior SELECT.
 */
export interface NewDistribution {
  enquiry_id: number;
  business_id: number;
  coin_cost: number;
  /** Written as numeric; pg hands it back as a string, hence DistributionRow. */
  distance_km: number | null;
}

export async function insertDistributions(
  rows: NewDistribution[],
  trx?: Db,
): Promise<DistributionRow[]> {
  if (rows.length === 0) return [];
  return db(trx)("enquiry_distributions")
    .insert(rows)
    .onConflict(["enquiry_id", "business_id"])
    .ignore()
    .returning("*");
}

export async function findDistributionForBusiness(
  distributionId: number,
  businessId: number,
  trx?: Db,
): Promise<DistributionRow | undefined> {
  return db(trx)<DistributionRow>("enquiry_distributions")
    .where({ id: distributionId, business_id: businessId })
    .whereNull("deleted_at")
    .first();
}

export async function setDistributionStatus(
  distributionId: number,
  status: DistributionStatus,
  trx?: Db,
): Promise<void> {
  await db(trx)("enquiry_distributions")
    .where({ id: distributionId })
    .update({ status, updated_at: db(trx).fn.now() });
}

/**
 * Move one distribution to 'closed'. Returns the closed row, or undefined when
 * nothing matched — which is either "not this business's row" or "already
 * closed", and the caller distinguishes those with its own lookup.
 *
 * Both guards live in the WHERE clause on purpose:
 *   * `business_id` is repeated here even though the caller has already checked
 *     ownership. A lookup and a write are two statements, and only the predicate
 *     on the write itself can guarantee the row that changes is the row that was
 *     authorised.
 *   * `status <> 'closed'` is what makes closing twice a genuine no-op rather
 *     than a second UPDATE with the same values: no row matches, so `closed_at`,
 *     `close_reason` and `updated_at` all keep their original values, and two
 *     simultaneous closes settle on the first one without a transaction.
 *
 * RETURNING lists its columns: the row carries no student data, and it must stay
 * that way whatever columns this table grows.
 */
export async function closeDistribution(
  distributionId: number,
  businessId: number,
  closeReason: string | null,
  trx?: Db,
): Promise<ClosedDistribution | undefined> {
  const [row] = await db(trx)("enquiry_distributions")
    .where({ id: distributionId, business_id: businessId })
    .whereNot({ status: "closed" })
    .whereNull("deleted_at")
    .update({
      status: "closed",
      closed_at: db(trx).fn.now(),
      close_reason: closeReason,
      updated_at: db(trx).fn.now(),
    })
    .returning<ClosedDistribution[]>(["id", "status", "closed_at", "close_reason"]);
  return row;
}

/**
 * The caller's own per-lead price, for the inbox's credit widget.
 *
 * A single explicit column: this read exists only to price an unlock, and
 * `businesses` carries plenty that has no business being on that wire.
 */
export async function findEnquiryCoinCost(businessId: number): Promise<number | null> {
  const row = await masterKnex("businesses")
    .where({ id: businessId })
    .whereNull("deleted_at")
    .first("enquiry_coin_cost");
  return row?.enquiry_coin_cost == null ? null : Number(row.enquiry_coin_cost);
}

/** The business inbox. Joins the unlock ledger so the caller can mask. */
function inboxQuery(businessId: number, filters: { status?: DistributionStatus; unlocked?: boolean }) {
  const q = masterKnex("enquiry_distributions as d")
    .join("enquiries as e", "e.id", "d.enquiry_id")
    .leftJoin("enquiry_unlocks as u", function joinUnlock() {
      this.on("u.distribution_id", "d.id").andOnNull("u.deleted_at");
    })
    .where("d.business_id", businessId)
    .whereNull("d.deleted_at")
    .whereNull("e.deleted_at");
  if (filters.status) q.where("d.status", filters.status);
  if (filters.unlocked === true) q.whereNotNull("u.id");
  if (filters.unlocked === false) q.whereNull("u.id");
  return q;
}

/** Every column an inbox row needs, locked or unlocked. Masking happens above. */
function withInboxColumns(q: Knex.QueryBuilder) {
  return q
    .join("platform_users as s", "s.id", "e.student_id")
    .leftJoin("platform_user_profiles as p", "p.user_id", "e.student_id")
    .select(
      "d.id",
      "d.enquiry_id",
      "d.coin_cost",
      "d.distance_km",
      "d.status",
      "d.closed_at",
      "d.close_reason",
      "d.created_at",
      "e.message",
      "e.preferred_intake",
      "e.preferred_year",
      "e.service_id",
      "e.target_org_type",
      "e.target_org_id",
      "e.status as enquiry_status",
      "s.id as student_id",
      "s.first_name as student_first_name",
      "s.last_name as student_last_name",
      "s.email as student_email",
      "s.phone as student_phone",
      "s.photo_url as student_photo_url",
      "p.city_of_residence as student_city",
      "p.nationality_id as student_nationality_id",
      "p.country_of_residence_id as student_country_of_residence_id",
      "u.id as unlock_id",
      "u.credits_spent",
      "u.created_at as unlocked_at",
    );
}

export interface InboxRow {
  id: number;
  enquiry_id: number;
  coin_cost: number;
  distance_km: string | null;
  status: DistributionStatus;
  closed_at: Date | null;
  close_reason: string | null;
  created_at: Date;
  message: string;
  preferred_intake: string | null;
  preferred_year: number | null;
  service_id: string | null;
  target_org_type: "business" | "institution" | null;
  target_org_id: number | null;
  enquiry_status: EnquiryStatus;
  student_id: number;
  student_first_name: string;
  student_last_name: string;
  student_email: string;
  student_phone: string | null;
  student_photo_url: string | null;
  student_city: string | null;
  student_nationality_id: number | null;
  student_country_of_residence_id: number | null;
  unlock_id: number | null;
  credits_spent: number | null;
  unlocked_at: Date | null;
}

export async function listInbox(
  businessId: number,
  filters: { status?: DistributionStatus; unlocked?: boolean },
  limit: number,
  offset: number,
): Promise<InboxRow[]> {
  return withInboxColumns(inboxQuery(businessId, filters))
    .orderBy("d.created_at", "desc")
    .orderBy("d.id", "desc")
    .limit(limit)
    .offset(offset);
}

export async function findInboxItem(
  distributionId: number,
  businessId: number,
): Promise<InboxRow | undefined> {
  return withInboxColumns(inboxQuery(businessId, {}).andWhere("d.id", distributionId)).first();
}

export async function countInbox(
  businessId: number,
  filters: { status?: DistributionStatus; unlocked?: boolean },
): Promise<number> {
  const rows = await inboxQuery(businessId, filters).count<{ count: string }[]>("d.id as count");
  return Number(rows[0]?.count ?? 0);
}

// ── Unlocks ─────────────────────────────────────────────────────────────────

/**
 * Claim the unlock. Returns the new row, or undefined when this distribution was
 * already unlocked — the UNIQUE index decides, not a prior read, which is what
 * makes two simultaneous unlocks charge exactly once. MUST be called inside the
 * same transaction as the wallet debit.
 */
export async function claimUnlock(
  values: {
    distribution_id: number;
    enquiry_id: number;
    business_id: number;
    unlocked_by: number | null;
    credits_spent: number;
  },
  trx: Db,
): Promise<UnlockRow | undefined> {
  const [row] = await trx<UnlockRow>("enquiry_unlocks")
    .insert(values)
    .onConflict("distribution_id")
    .ignore()
    .returning("*");
  return row;
}

export async function findUnlock(
  distributionId: number,
  trx?: Db,
): Promise<UnlockRow | undefined> {
  return db(trx)<UnlockRow>("enquiry_unlocks")
    .where({ distribution_id: distributionId })
    .whereNull("deleted_at")
    .first();
}

export async function attachTransaction(
  unlockId: number,
  creditTransactionId: number,
  trx: Db,
): Promise<void> {
  await trx("enquiry_unlocks")
    .where({ id: unlockId })
    .update({ credit_transaction_id: creditTransactionId, updated_at: trx.fn.now() });
}

export async function countUnlocksForEnquiry(enquiryId: number): Promise<number> {
  const rows = await masterKnex("enquiry_unlocks")
    .where({ enquiry_id: enquiryId })
    .whereNull("deleted_at")
    .count<{ count: string }[]>("id as count");
  return Number(rows[0]?.count ?? 0);
}

// ── Email queue ─────────────────────────────────────────────────────────────

export async function enqueueDigestRows(
  rows: Array<{ distribution_id: number; business_id: number }>,
  trx?: Db,
): Promise<void> {
  if (rows.length === 0) return;
  await db(trx)("enquiry_email_queue").insert(rows).onConflict("distribution_id").ignore();
}

export interface ClaimedQueueRow {
  id: number;
  distribution_id: number;
  business_id: number;
  enquiry_id: number;
  student_first_name: string;
  student_photo_url: string | null;
  created_at: Date;
}

/**
 * Atomically claim up to `limit` pending rows and return them already joined to
 * what the email needs.
 *
 * The claim is the idempotency: `WHERE status = 'pending' ... RETURNING` in a
 * single statement means a re-delivered queue message claims zero rows and sends
 * nothing. V1 flipped the status *after* calling the mail provider, so a crash
 * mid-loop re-sent every digest.
 */
export async function claimPendingQueue(limit: number, trx?: Db): Promise<ClaimedQueueRow[]> {
  const result = await db(trx).raw(
    `WITH claimed AS (
       UPDATE enquiry_email_queue q
          SET status = 'sent', sent_at = now(), attempts = q.attempts + 1, updated_at = now()
        WHERE q.id IN (
                SELECT id FROM enquiry_email_queue
                 WHERE status = 'pending' AND deleted_at IS NULL
                 ORDER BY created_at ASC, id ASC
                 LIMIT ?
                 FOR UPDATE SKIP LOCKED
              )
        RETURNING q.id, q.distribution_id, q.business_id
     )
     SELECT c.id, c.distribution_id, c.business_id,
            d.enquiry_id, d.created_at,
            s.first_name AS student_first_name, s.photo_url AS student_photo_url
       FROM claimed c
       JOIN enquiry_distributions d ON d.id = c.distribution_id
       JOIN enquiries e            ON e.id = d.enquiry_id
       JOIN platform_users s       ON s.id = e.student_id
      ORDER BY c.business_id, d.created_at`,
    [limit],
  );
  return result.rows as ClaimedQueueRow[];
}

/** Put a claimed batch back as 'failed' when the send did not happen. */
export async function markQueueFailed(ids: number[], error: string, trx?: Db): Promise<void> {
  if (ids.length === 0) return;
  await db(trx)("enquiry_email_queue")
    .whereIn("id", ids)
    .update({ status: "failed", sent_at: null, last_error: error.slice(0, 500), updated_at: db(trx).fn.now() });
}

// ── Admin monitoring ────────────────────────────────────────────────────────

interface AdminFilters {
  status?: EnquiryStatus;
  studentId?: number;
  businessId?: number;
}

function adminQuery(filters: AdminFilters) {
  const q = masterKnex("enquiries as e")
    .join("platform_users as s", "s.id", "e.student_id")
    .whereNull("e.deleted_at");
  if (filters.status) q.where("e.status", filters.status);
  if (filters.studentId) q.where("e.student_id", filters.studentId);
  if (filters.businessId) {
    q.whereExists(
      masterKnex("enquiry_distributions as d")
        .whereRaw("d.enquiry_id = e.id")
        .where("d.business_id", filters.businessId)
        .whereNull("d.deleted_at"),
    );
  }
  return q;
}

export async function listAdminEnquiries(filters: AdminFilters, limit: number, offset: number) {
  return adminQuery(filters)
    .select(
      "e.id",
      "e.status",
      "e.message",
      "e.preferred_intake",
      "e.preferred_year",
      "e.target_org_type",
      "e.target_org_id",
      "e.distributed_at",
      "e.converted_at",
      "e.created_at",
      "s.id as student_id",
      masterKnex.raw("(s.first_name || ' ' || s.last_name) AS student_name"),
      "s.email as student_email",
      masterKnex.raw(
        `(SELECT count(*)::int FROM enquiry_distributions d
            WHERE d.enquiry_id = e.id AND d.deleted_at IS NULL) AS distributed_to`,
      ),
      masterKnex.raw(
        `(SELECT count(*)::int FROM enquiry_unlocks u
            WHERE u.enquiry_id = e.id AND u.deleted_at IS NULL) AS unlocked_count`,
      ),
      masterKnex.raw(
        `(SELECT coalesce(sum(u.credits_spent), 0)::int FROM enquiry_unlocks u
            WHERE u.enquiry_id = e.id AND u.deleted_at IS NULL) AS credits_earned`,
      ),
    )
    .orderBy("e.created_at", "desc")
    .orderBy("e.id", "desc")
    .limit(limit)
    .offset(offset);
}

export async function countAdminEnquiries(filters: AdminFilters): Promise<number> {
  const rows = await adminQuery(filters).count<{ count: string }[]>("e.id as count");
  return Number(rows[0]?.count ?? 0);
}

export async function adminStats() {
  const [enquiries] = await masterKnex("enquiries")
    .whereNull("deleted_at")
    .select(
      masterKnex.raw("count(*)::int AS total"),
      masterKnex.raw("count(*) FILTER (WHERE status = 'pending')::int AS pending"),
      masterKnex.raw("count(*) FILTER (WHERE status = 'converted')::int AS converted"),
      masterKnex.raw("count(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS last_7_days"),
    );

  const [distributions] = await masterKnex("enquiry_distributions")
    .whereNull("deleted_at")
    .select(masterKnex.raw("count(*)::int AS total"));

  const [unlocks] = await masterKnex("enquiry_unlocks")
    .whereNull("deleted_at")
    .select(
      masterKnex.raw("count(*)::int AS total"),
      masterKnex.raw("coalesce(sum(credits_spent), 0)::int AS credits_spent"),
    );

  const [queue] = await masterKnex("enquiry_email_queue")
    .whereNull("deleted_at")
    .select(
      masterKnex.raw("count(*) FILTER (WHERE status = 'pending')::int AS pending"),
      masterKnex.raw("count(*) FILTER (WHERE status = 'failed')::int AS failed"),
    );

  return {
    enquiries,
    distributions_total: distributions.total,
    unlocks: { total: unlocks.total, credits_spent: unlocks.credits_spent },
    digest_queue: queue,
  };
}
