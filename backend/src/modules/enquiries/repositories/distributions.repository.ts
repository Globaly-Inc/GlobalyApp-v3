// Distributions repository — writes/reads against globalyapp.enquiry_distributions.
// Duplicate prevention is the DB's UNIQUE(enquiry_id, business_id) constraint
// (PRD §13), not an app-level check-then-insert — ON CONFLICT DO NOTHING makes
// re-running the matcher on the same enquiry safe.
//
// Carries the business side of an enquiry: the match itself, plus the paywall
// (coin_cost/unlocked_at/unlocked_by) and per-business closure
// (closed_at/close_reason) that unlock & close write.

import type { Knex } from "knex";
import { masterKnex } from "../../../core/db/master-pool.js";
import { createChildLogger } from "../../../shared/logger.js";

const logger = createChildLogger("enquiry-distributions");

const T = "enquiry_distributions";

/**
 * How much of the student's message a business sees before paying to unlock.
 * Truncation happens HERE, not in the UI — doing it in the component would still
 * ship the full text to an unpaid client.
 */
const MESSAGE_TEASER_LENGTH = 80;

function teaser(message: string | null): { message: string | null; message_truncated: boolean } {
  if (!message || message.length <= MESSAGE_TEASER_LENGTH) {
    return { message, message_truncated: false };
  }
  return { message: `${message.slice(0, MESSAGE_TEASER_LENGTH).trimEnd()}…`, message_truncated: true };
}

export interface NewDistribution {
  enquiry_id: string;
  business_id: number;
  representation_id?: string | null;
  tier: number;
  match_rank: number;
  match_distance_km: number | null;
}

export async function insertMany(trx: Knex.Transaction, rows: NewDistribution[]) {
  if (rows.length === 0) return [];
  return trx(T)
    .insert(rows.map((r) => ({ ...r, status: "distributed" })))
    .onConflict(["enquiry_id", "business_id"])
    .ignore()
    .returning("*");
}

export async function listByEnquiry(enquiryId: string) {
  return masterKnex(T).where({ enquiry_id: enquiryId }).whereNull("deleted_at");
}

/**
 * Business inbox listing — reads the business's own tenant `business_enquiries` table
 * (synced by tenant-sync.service.ts), then batch-enriches with central fields
 * for display. `db` is the tenant-scoped Knex (req.db).
 */
export async function listForBusinessFromTenant(
  db: Knex,
  filters: { status?: string; limit?: number; offset?: number } = {},
) {
  let q = db("business_enquiries").whereNull("deleted_at").orderBy("created_at", "desc");

  if (filters.status) q = q.andWhere("status", filters.status);
  if (filters.limit) q = q.limit(filters.limit);
  if (filters.offset) q = q.offset(filters.offset);

  const tenantRows = await q;
  if (tenantRows.length === 0) return [];

  const enquiryIds = tenantRows.map((r) => r.enquiry_id);
  const distributionIds = tenantRows.map((r) => r.distribution_id);

  const enquiryRows = await masterKnex("enquiries as e")
    .join("superadmin.extraction_courses as c", "c.id", "e.course_id")
    .leftJoin("superadmin.extraction_institution_overview as o", "o.job_id", "e.extraction_job_id")
    .whereIn("e.id", enquiryIds)
    .select(
      "e.id",
      "e.message",
      "e.preferred_intake",
      "e.preferred_year",
      // How many businesses have unlocked this enquiry, and the cap — the card
      // shows "1/3 unlocked". Column names stay accept_* per the schema.
      "e.accept_count",
      "e.max_accepts",
      "c.name as course_name",
      "c.short_name as course_short_name",
      "o.name as institution_name",
    );
  const enquiryById = new Map(enquiryRows.map((r) => [r.id, r]));

  const distributionRows = await masterKnex(T)
    .whereIn("id", distributionIds)
    .select("id", "tier", "match_rank", "status", "coin_cost", "unlocked_at", "closed_at", "close_reason");
  const distributionById = new Map(distributionRows.map((r) => [r.id, r]));

  // Drop tenant rows whose central counterpart is gone. The tenant table holds
  // `enquiry_id`/`distribution_id` as plain uuids — a cross-schema FK is not
  // possible — so nothing stops a row outliving the central distribution it
  // mirrors. Such a row used to render as a perfectly normal actionable card and
  // then 404 on unlock/close, because there is no central row to lock. The central
  // distribution is the source of truth for "this business was sent this enquiry",
  // so without it there is nothing to show.
  const actionableRows = tenantRows.filter(
    (r) => distributionById.has(r.distribution_id) && enquiryById.has(r.enquiry_id),
  );
  if (actionableRows.length !== tenantRows.length) {
    logger.warn("Skipped orphaned tenant enquiry rows with no central distribution", {
      skipped: tenantRows.length - actionableRows.length,
      of: tenantRows.length,
    });
  }
  if (actionableRows.length === 0) return [];

  // Contact is what unlocking buys, so it is fetched ONLY for rows that were
  // actually unlocked — an unpaid row must not be able to leak it through a client
  // that ignores the flag.
  const unlockedEnquiryIds = actionableRows
    .filter((r) => distributionById.get(r.distribution_id)?.unlocked_at != null)
    .map((r) => r.enquiry_id);

  const contactByEnquiry = new Map<string, any>();
  if (unlockedEnquiryIds.length > 0) {
    const contacts = await masterKnex("enquiries as e")
      .join("platform_users as u", "u.id", "e.student_id")
      .whereIn("e.id", unlockedEnquiryIds)
      .select("e.id", "u.first_name", "u.last_name", "u.email", "u.phone");
    for (const c of contacts) contactByEnquiry.set(c.id, c);
  }

  return actionableRows.map((row) => {
    const enquiry = enquiryById.get(row.enquiry_id);
    const distribution = distributionById.get(row.distribution_id);
    const contact = contactByEnquiry.get(row.enquiry_id);
    const isUnlocked = distribution?.unlocked_at != null;
    const { message, message_truncated } = isUnlocked
      ? { message: enquiry?.message ?? null, message_truncated: false }
      : teaser(enquiry?.message ?? null);
    return {
      enquiry_id: row.enquiry_id,
      distribution_id: row.distribution_id,
      // The tenant row is the business's own workflow state (unlocked →
      // in_conversation → converted → closed), so it wins over the central
      // distribution status, which only tracks the platform's side.
      // GAP: nothing propagates a central withdraw/expire back onto the tenant
      // row — add that to whatever sets those, or a business keeps seeing
      // 'distributed' for a withdrawn enquiry.
      status: row.status ?? distribution?.status,
      tier: distribution?.tier ?? null,
      match_rank: distribution?.match_rank ?? null,
      message,
      message_truncated,
      preferred_intake: enquiry?.preferred_intake ?? null,
      preferred_year: enquiry?.preferred_year ?? null,
      course_name: enquiry?.course_name ?? null,
      course_short_name: enquiry?.course_short_name ?? null,
      institution_name: enquiry?.institution_name ?? null,
      created_at: row.created_at,

      accept_count: Number(enquiry?.accept_count ?? 0),
      max_accepts: Number(enquiry?.max_accepts ?? 0),

      is_unlocked: isUnlocked,
      coin_cost: Number(distribution?.coin_cost ?? 0),
      unlocked_at: distribution?.unlocked_at ?? null,
      closed_at: distribution?.closed_at ?? null,
      close_reason: distribution?.close_reason ?? null,

      // Null until unlocked — see the gated contact lookup above.
      student_name: contact ? `${contact.first_name} ${contact.last_name}`.trim() : null,
      student_email: contact?.email ?? null,
      student_phone: contact?.phone ?? null,
    };
  });
}

export async function findById(id: string) {
  return masterKnex(T).where({ id }).whereNull("deleted_at").first();
}

/**
 * Locks a distribution for a state transition, scoped to the owning business so no
 * business can act on another's row (a foreign id simply returns undefined, which
 * callers surface as 404 rather than 403 — no existence leak).
 */
export async function findForBusinessForUpdate(trx: Knex.Transaction, id: string, businessId: number) {
  return trx(T).where({ id, business_id: businessId }).whereNull("deleted_at").forUpdate().first();
}

export async function markUnlocked(
  trx: Knex.Transaction,
  id: string,
  opts: { coinCost: number; unlockedBy: number },
) {
  const [row] = await trx(T)
    .where({ id })
    .update({
      status: "unlocked",
      coin_cost: opts.coinCost,
      unlocked_at: trx.fn.now(),
      unlocked_by: opts.unlockedBy,
      updated_at: trx.fn.now(),
    })
    .returning("*");
  return row;
}

export async function markClosed(trx: Knex.Transaction, id: string, closeReason: string) {
  const [row] = await trx(T)
    .where({ id })
    .update({
      status: "closed",
      close_reason: closeReason,
      closed_at: trx.fn.now(),
      updated_at: trx.fn.now(),
    })
    .returning("*");
  return row;
}

/** Student contact details — only ever called for an unlocked distribution. */
export async function findStudentContact(enquiryId: string) {
  return masterKnex("enquiries as e")
    .join("platform_users as u", "u.id", "e.student_id")
    .where("e.id", enquiryId)
    .first(
      "u.first_name as student_first_name",
      "u.last_name as student_last_name",
      "u.email as student_email",
      "u.phone as student_phone",
    );
}

/** All business_ids ever distributed to for this enquiry. */
export async function listBusinessIdsForEnquiry(enquiryId: string): Promise<number[]> {
  const rows = await masterKnex(T).where({ enquiry_id: enquiryId }).select("business_id");
  return rows.map((r) => r.business_id);
}
