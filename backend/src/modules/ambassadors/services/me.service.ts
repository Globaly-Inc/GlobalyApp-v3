// The signed-in user's own ambassadorship: profile, inquiry queue, applications,
// earnings. Behavioural spec: V2 routes/ambassador.ts + routes/ambassador-apply.ts.
//
// The caller is always req.auth.sub. No route here accepts a user id, so there
// is no "read someone else's ambassador row" shape to defend against.

import { masterKnex } from "../../../core/db/master-pool.js";
import { ConflictError, ForbiddenError, NotFoundError } from "../../../shared/errors.js";
import { PLATFORM_COMMISSION_PERCENT } from "../consts.js";
import { netAmountMinor } from "../lib/matching.js";
import * as repo from "../repositories/programs.repository.js";
import * as engagement from "../repositories/engagement.repository.js";
import * as money from "../repositories/payouts.repository.js";

const INQUIRY_PAGE_LIMIT = 100;

/** Full self-view: the ambassador sees their OWN balances and Stripe state. */
export function selfProfile(row: repo.AmbassadorRow, program: repo.ProgramRow | null) {
  return {
    id: row.id,
    user_id: row.user_id,
    program_id: row.program_id,
    status: row.status,
    bio: row.bio,
    photo_url: row.photo_url,
    major: row.major,
    year: row.year,
    country_of_origin: row.country_of_origin,
    languages: row.languages,
    interests: row.interests,
    avg_rating: Number(row.avg_rating),
    total_inquiries: row.total_inquiries,
    total_resolved: row.total_resolved,
    total_earnings_minor: row.total_earnings_minor,
    pending_earnings_minor: row.pending_earnings_minor,
    available_earnings_minor: row.available_earnings_minor,
    currency: row.currency,
    is_online: row.is_online,
    last_active_at: row.last_active_at,
    joined_at: row.joined_at,
    stripe_account_id: row.stripe_account_id,
    stripe_onboarding_complete: row.stripe_onboarding_complete,
    program_name: program?.name ?? null,
    program_slug: program?.slug ?? null,
    business_id: program?.business_id ?? null,
  };
}

export async function requireAmbassador(userId: number): Promise<repo.AmbassadorRow> {
  const row = await repo.findAmbassadorByUser(userId);
  if (!row) throw new NotFoundError("Not an ambassador");
  return row;
}

export async function getProfile(userId: number) {
  const row = await requireAmbassador(userId);
  const program = await masterKnex<repo.ProgramRow>("ambassador_programs")
    .where({ id: row.program_id })
    .first();
  return selfProfile(row, program ?? null);
}

export async function updateProfile(userId: number, body: Record<string, unknown>) {
  const row = await requireAmbassador(userId);
  const updated = await repo.updateAmbassador(row.id, {
    ...body,
    last_active_at: masterKnex.fn.now(),
  });
  const program = await masterKnex<repo.ProgramRow>("ambassador_programs")
    .where({ id: row.program_id })
    .first();
  return selfProfile(updated!, program ?? null);
}

export async function listInquiries(userId: number, limit = INQUIRY_PAGE_LIMIT) {
  const row = await requireAmbassador(userId);
  return { data: await engagement.listInquiriesForAmbassador(row.id, limit) };
}

/**
 * Accept / progress / resolve an inquiry assigned to the caller.
 *
 * The ownership predicate lives inside the UPDATE (see
 * engagement.repository.updateInquiryForAmbassador), so an inquiry assigned to
 * somebody else simply does not match and the caller gets a 403 — it is never
 * read first and checked afterwards.
 *
 * Resolving also credits the ledger, once, from the program's
 * `compensation_model.per_resolution_minor`. Programs that do not configure a
 * rate pay nothing, which is V1's behaviour (its edge functions never wrote
 * ambassador_earnings at all).
 */
export async function setInquiryStatus(userId: number, inquiryId: number, status: string) {
  const ambassador = await requireAmbassador(userId);

  return masterKnex.transaction(async (trx) => {
    const updates: Record<string, unknown> = { status };
    if (status === "accepted") {
      updates.accepted_at = trx.fn.now();
      updates.expires_at = null;
    }
    if (status === "resolved") updates.resolved_at = trx.fn.now();

    const inquiry = await engagement.updateInquiryForAmbassador(
      inquiryId,
      ambassador.id,
      updates,
      trx,
    );
    if (!inquiry) throw new ForbiddenError("Inquiry is not assigned to you");

    if (status === "resolved") {
      await creditResolution(ambassador, inquiry, trx);
    }
    return inquiry;
  });
}

async function creditResolution(
  ambassador: repo.AmbassadorRow,
  inquiry: engagement.InquiryRow,
  trx: money.Db,
) {
  const program = await trx<repo.ProgramRow>("ambassador_programs")
    .where({ id: inquiry.program_id })
    .first();
  const model = (program?.compensation_model ?? {}) as { per_resolution_minor?: number };
  const gross = Number(model.per_resolution_minor ?? 0);

  await trx("ambassadors").where({ id: ambassador.id }).increment("total_resolved", 1);
  if (!Number.isFinite(gross) || gross <= 0) return;

  const net = netAmountMinor(gross, PLATFORM_COMMISSION_PERCENT);
  const earning = await money.insertEarning(
    {
      ambassador_id: ambassador.id,
      inquiry_id: inquiry.id,
      type: "inquiry_resolution",
      amount_minor: gross,
      net_amount_minor: net,
      currency: ambassador.currency,
      status: "available",
      description: `Resolved inquiry #${inquiry.id}`,
    },
    trx,
  );
  // null means the (inquiry, type) unique already held a row — resolving twice
  // must not pay twice, so there is nothing further to do.
  if (!earning) return;

  await trx("ambassadors")
    .where({ id: ambassador.id })
    .increment("total_earnings_minor", net)
    .increment("available_earnings_minor", net);
}

// ── Applications (student side) ─────────────────────────────────────────────

export async function listMyApplications(userId: number) {
  return { data: await repo.listApplicationsForStudent(userId) };
}

export async function apply(
  userId: number,
  body: { program_id: number; application_data: Record<string, unknown>; video_url?: string | null },
) {
  const program = await masterKnex<repo.ProgramRow>("ambassador_programs")
    .where({ id: body.program_id, status: "active" })
    .whereNull("deleted_at")
    .first();
  if (!program) throw new NotFoundError("Program not found");

  try {
    return await repo.insertApplication({
      program_id: body.program_id,
      student_id: userId,
      application_data: body.application_data,
      video_url: body.video_url ?? null,
    });
  } catch (err) {
    if ((err as { code?: string })?.code === "23505") {
      throw new ConflictError("You have already applied to this program");
    }
    throw err;
  }
}

// ── Earnings ────────────────────────────────────────────────────────────────

export async function getEarnings(userId: number) {
  const row = await requireAmbassador(userId);
  const [earnings, payouts] = await Promise.all([
    money.listEarnings(row.id),
    money.listPayouts(row.id, 10),
  ]);
  return {
    summary: {
      total_earnings_minor: row.total_earnings_minor,
      pending_earnings_minor: row.pending_earnings_minor,
      available_earnings_minor: row.available_earnings_minor,
      currency: row.currency,
    },
    earnings,
    payouts,
  };
}
