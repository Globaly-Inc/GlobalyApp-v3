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
import { recipientFilter, type Recipient } from "../shared/recipient.js";
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
 *
 * Paging happens AFTER enrichment, not in the tenant query. Everything worth searching — course,
 * institution, student name, message — lives in the central schema, while the tenant row holds
 * only ids and a status; a LIMIT applied before the join would page through unfiltered rows and
 * then filter the page, so page 2 of a search could legitimately come back empty while matches sat
 * on page 3.
 *
 * Safe because the set is bounded by "distributions to this one recipient", and the inbox already
 * loaded all of them to count its own tabs.
 */
export async function listForBusinessFromTenant(
  db: Knex,
  filters: { status?: string; limit?: number; offset?: number; search?: string } = {},
) {
  // Return type is inferred, not annotated: a hand-written one would erase every field name the
  // callers and their tests rely on. That is also why there is a single return below rather than
  // early exits — separate returns would union into a shape whose fields cannot be read. An empty
  // inbox costs two `where in (...)` queries that match nothing, which is cheaper than the
  // alternative of hand-maintaining a duplicate of the row type.
  // Status is applied AFTER enrichment too, not in this query: the same single pass then serves
  // both the filtered page and the per-status counts the tabs show. Filtering here would mean a
  // second pass to count the tabs the user is not currently looking at.
  const tenantRows = await db("business_enquiries").whereNull("deleted_at").orderBy("created_at", "desc");

  const enquiryIds = tenantRows.map((r) => r.enquiry_id);
  const distributionIds = tenantRows.map((r) => r.distribution_id);

  const enquiryRows = await masterKnex("enquiries as e")
    .join("superadmin.extraction_courses as c", "c.id", "e.course_id")
    .leftJoin("superadmin.extraction_institution_overview as o", "o.job_id", "e.extraction_job_id")
    .join("platform_users as u", "u.id", "e.student_id")
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
      "e.eligibility_snapshot",
      "e.share_contact_number",
      // Name is visible BEFORE unlock; email and phone are not. Joined here rather than in the
      // gated contact lookup below precisely because it is not gated.
      "u.first_name as student_first_name",
      "u.last_name as student_last_name",
      "u.photo_url as student_photo_url",
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

  // Reachable contact details are what unlocking buys, so they are fetched ONLY for rows that
  // were actually unlocked — an unpaid row must not be able to leak them through a client that
  // ignores the flag. The student's NAME is not in here: it comes off the enquiry batch above and
  // is visible either way.
  const unlockedEnquiryIds = actionableRows
    .filter((r) => distributionById.get(r.distribution_id)?.unlocked_at != null)
    .map((r) => r.enquiry_id);

  const contactByEnquiry = new Map<string, any>();
  if (unlockedEnquiryIds.length > 0) {
    const contacts = await masterKnex("enquiries as e")
      .join("platform_users as u", "u.id", "e.student_id")
      .whereIn("e.id", unlockedEnquiryIds)
      .select("e.id", "u.email", "u.phone", "e.share_contact_number");
    for (const c of contacts) contactByEnquiry.set(c.id, c);
  }

  const mapped = actionableRows.map((row) => {
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

      // The rollup is visible either way. Null on enquiries predating the check.
      eligibility_status: (enquiry?.eligibility_snapshot?.status ?? null) as
        | "eligible"
        | "not_eligible"
        | "unknown"
        | null,
      // The criteria name the student's actual degree and scores — profile detail a locked row
      // has not paid for, so they appear only once it has.
      eligibility_criteria: isUnlocked ? (enquiry?.eligibility_snapshot?.criteria ?? null) : null,

      is_unlocked: isUnlocked,
      coin_cost: Number(distribution?.coin_cost ?? 0),
      unlocked_at: distribution?.unlocked_at ?? null,
      closed_at: distribution?.closed_at ?? null,
      close_reason: distribution?.close_reason ?? null,

      // First name is visible before unlock; the surname is not, and it is WITHHELD rather than
      // sent-and-blurred. A CSS blur still ships the real value to the browser, where it is one
      // devtools glance away — the card renders a placeholder instead.
      student_first_name: enquiry?.student_first_name ?? null,
      student_name: isUnlocked
        ? `${enquiry?.student_first_name ?? ""} ${enquiry?.student_last_name ?? ""}`.trim() || null
        : null,
      // A face is as identifying as a surname, so it sits behind the same gate. Still a raw
      // storage path here — the service signs it, as it does everywhere else.
      student_photo_url: isUnlocked ? (enquiry?.student_photo_url ?? null) : null,

      // Null until unlocked — see the gated contact lookup above.
      student_email: contact?.email ?? null,

      // Two gates, not one: unlocking buys the email, but the phone number additionally requires
      // the student to have opted in when they submitted. A business that paid still does not get
      // a number the student withheld.
      student_phone: contact?.share_contact_number ? (contact.phone ?? null) : null,

      // So the UI can say "the student chose not to share their number" instead of rendering a
      // blank that reads as missing data — and so it never implies the business was short-changed.
      student_phone_withheld: isUnlocked && contact != null && !contact.share_contact_number,
    };
  });

  // Matched against what the card actually shows. `student_email` is deliberately excluded: it is
  // null on locked rows, so searching it would silently return different results depending on what
  // the business had paid for.
  const term = filters.search?.trim().toLowerCase();
  const filtered = term
    ? mapped.filter((r) =>
        // student_first_name, not student_name: the latter is null until unlocked, so searching it
        // would quietly stop matching locked rows.
        [r.course_name, r.course_short_name, r.institution_name, r.student_first_name, r.message]
          .some((v) => typeof v === "string" && v.toLowerCase().includes(term)),
      )
    : mapped;

  // Counts span every status but honour the search, so a selected tab never zeroes the others
  // while the search still narrows all of them. Computed before the status filter for that reason.
  const counts = filtered.reduce<Record<string, number>>((acc, r) => {
    const key = String(r.status);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  // Comma-separated, matching the student list: one UI tab maps to several raw statuses
  // ("Unlocked" covers unlocked + in_conversation + converted), so it arrives as a set.
  const wanted = filters.status?.split(",").map((v) => v.trim()).filter(Boolean);
  const inStatus = wanted?.length ? filtered.filter((r) => wanted.includes(String(r.status))) : filtered;

  // Total is the FILTERED count, so the paginator never offers a page the search cannot fill.
  const offset = filters.offset ?? 0;
  const limit = filters.limit ?? inStatus.length;
  return { data: inStatus.slice(offset, offset + limit), total: inStatus.length, counts };
}

export async function findById(id: string) {
  return masterKnex(T).where({ id }).whereNull("deleted_at").first();
}

/**
 * Locks a distribution for a state transition, scoped to the owning business so no
 * business can act on another's row (a foreign id simply returns undefined, which
 * callers surface as 404 rather than 403 — no existence leak).
 */
export async function findForRecipientForUpdate(trx: Knex.Transaction, id: string, recipient: Recipient) {
  return trx(T)
    .where({ id, ...recipientFilter(recipient) })
    .whereNull("deleted_at")
    .forUpdate()
    .first();
}

/**
 * A distribution scoped to its owning recipient, without a row lock — the read-only twin of
 * findForRecipientForUpdate.
 *
 * A foreign id returns undefined, which callers surface as 404 rather than 403: telling a business
 * "that exists but is not yours" is itself a leak.
 */
export async function findForRecipient(id: string, recipient: Recipient) {
  return masterKnex(T)
    .where({ id, ...recipientFilter(recipient) })
    .whereNull("deleted_at")
    .first();
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

/**
 * Student contact details — only ever called for an unlocked distribution.
 *
 * Returns the consent flag rather than applying it, so the single place that decides what a
 * business may see stays in the service. Callers MUST honour `share_contact_number`.
 */
export async function findStudentContact(enquiryId: string) {
  return masterKnex("enquiries as e")
    .join("platform_users as u", "u.id", "e.student_id")
    .where("e.id", enquiryId)
    .first(
      "u.first_name as student_first_name",
      "u.last_name as student_last_name",
      "u.email as student_email",
      "u.phone as student_phone",
      "e.share_contact_number",
    );
}

/** All business_ids ever distributed to for this enquiry. */
export async function listBusinessIdsForEnquiry(enquiryId: string): Promise<number[]> {
  const rows = await masterKnex(T).where({ enquiry_id: enquiryId }).select("business_id");
  return rows.map((r) => r.business_id);
}

/**
 * Default when a recipient has no configured price. Mirrors `businesses.enquiry_coin_cost`'s
 * column default, so a business row and an institution (which has no such column) charge the
 * same thing rather than disagreeing by accident.
 */
export const DEFAULT_UNLOCK_COST = 30;

export interface RecipientBilling {
  /** The wallet to charge. `credit_wallets` is keyed on platform_users.id, so an org bills
   * through the person who owns it: businesses.owner_id, institutions.platform_user_id. */
  walletUserId: number;
  /** What this recipient pays per unlock, from its own configured price. */
  unlockCost: number;
  /** For the ledger description — an admin reading the ledger needs a name, not an id. */
  name: string;
}

/**
 * Who pays for this recipient's unlocks, and how much.
 *
 * Both branches resolve to a platform user because that is what the credit system is keyed on.
 * There is no per-business wallet table, and inventing one here would be exactly the separate
 * credit mechanism this is meant to remove.
 *
 * Institutions have no `enquiry_coin_cost` column, so they take the default. Adding one is a
 * schema change the unlock flow does not need today.
 */
export async function findRecipientBilling(recipient: Recipient): Promise<RecipientBilling | undefined> {
  if (recipient.kind === "institution") {
    const row = await masterKnex("institutions")
      .where({ id: recipient.id })
      .whereNull("deleted_at")
      .first("platform_user_id", "institution_name");
    if (!row) return undefined;
    return {
      walletUserId: Number(row.platform_user_id),
      unlockCost: DEFAULT_UNLOCK_COST,
      name: row.institution_name,
    };
  }

  const row = await masterKnex("businesses")
    .where({ id: recipient.id })
    .whereNull("deleted_at")
    .first("owner_id", "business_name", "enquiry_coin_cost");
  if (!row) return undefined;
  return {
    walletUserId: Number(row.owner_id),
    unlockCost: Number(row.enquiry_coin_cost ?? DEFAULT_UNLOCK_COST),
    name: row.business_name,
  };
}
