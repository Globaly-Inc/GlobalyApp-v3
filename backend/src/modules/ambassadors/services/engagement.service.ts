// Inquiry intake (prospect side) and the business-owner engagement surface:
// inquiry list, one transcript, aggregate analytics.
//
// Behavioural spec: V2 routes/business-ambassador-engagement.ts, plus V1's
// matching rules from `process-ambassador-timeout` (the same picker is used for
// the FIRST match, not just reroutes — V1 matched client-side and only the
// reroute logic survived as code, so this is the one place it lives).
//
// Inquiries carry no business_id: every business-scoped read resolves the
// caller's program ids first and reads only inquiries inside that set. An empty
// set yields empty results, never someone else's rows.

import { masterKnex } from "../../../core/db/master-pool.js";
import { NotFoundError } from "../../../shared/errors.js";
import { buildPaginatedResponse, type PaginationInput } from "../../../shared/pagination.js";
import { INQUIRY_ACCEPT_WINDOW_MS, REROUTE_CANDIDATE_LIMIT, type InquiryStatus } from "../consts.js";
import { pickNextAmbassador } from "../lib/matching.js";
import * as repo from "../repositories/programs.repository.js";
import * as engagement from "../repositories/engagement.repository.js";

/** A prospective student opens an inquiry against a program. */
export async function createInquiry(
  prospectId: number,
  body: { program_id: number; first_message: string; inquiry_context: Record<string, unknown> },
) {
  const program = await masterKnex("ambassador_programs")
    .where({ id: body.program_id, status: "active" })
    .whereNull("deleted_at")
    .first();
  if (!program) throw new NotFoundError("Program not found");

  const candidates = await engagement.rerouteCandidates(
    body.program_id,
    null,
    REROUTE_CANDIDATE_LIMIT,
  );
  const match = pickNextAmbassador(
    candidates,
    (body.inquiry_context?.country_of_origin as string | undefined) ?? null,
  );

  const now = new Date();
  const inquiry = await engagement.insertInquiry({
    program_id: body.program_id,
    prospect_id: prospectId,
    first_message: body.first_message,
    inquiry_context: body.inquiry_context,
    ambassador_id: match?.id ?? null,
    status: match ? "matched" : "pending",
    matched_at: match ? now : null,
    expires_at: match ? new Date(now.getTime() + INQUIRY_ACCEPT_WINDOW_MS) : null,
  });

  if (match) {
    await masterKnex("ambassadors").where({ id: match.id }).increment("total_inquiries", 1);
  }
  return inquiry;
}

// ── Business-scoped reads ───────────────────────────────────────────────────

export async function listInquiries(
  businessId: number,
  query: PaginationInput & { program_id?: number; status?: InquiryStatus },
) {
  const programIds = await repo.programIdsForBusiness(businessId, query.program_id);
  const { rows, total } = await engagement.listInquiriesInPrograms(programIds, query);
  return buildPaginatedResponse(rows, total, query);
}

export async function getTranscript(businessId: number, inquiryId: number) {
  const programIds = await repo.programIdsForBusiness(businessId);
  const inquiry = await engagement.findInquiryInPrograms(inquiryId, programIds);
  if (!inquiry) throw new NotFoundError("Inquiry not found");

  const thread = await engagement.findThreadByInquiry(inquiry.id);
  if (!thread) return { inquiry, messages: [] };

  const messages = await engagement.listMessages(thread.id);
  const names = await engagement.senderNames([...new Set(messages.map((m) => m.sender_id))]);
  const byId = new Map(names.map((n: { user_id: number }) => [n.user_id, n]));

  return {
    inquiry,
    messages: messages.map((m) => ({ ...m, sender: byId.get(m.sender_id) ?? null })),
  };
}

export async function analytics(businessId: number, programId?: number) {
  const programIds = await repo.programIdsForBusiness(businessId, programId);
  const empty = {
    total_inquiries: 0,
    resolved: 0,
    in_progress: 0,
    other: 0,
    resolution_rate: 0,
    active_ambassadors: 0,
    avg_rating: 0,
    avg_response_time_minutes: 0,
    ambassadors: [] as unknown[],
  };
  if (programIds.length === 0) return empty;

  const [counts, ambassadors] = await Promise.all([
    engagement.inquiryStatusCounts(programIds),
    engagement.activeAmbassadorStats(programIds),
  ]);

  const total = counts.reduce((sum, c) => sum + c.count, 0);
  const resolved = counts.find((c) => c.status === "resolved")?.count ?? 0;
  const inProgress = counts.find((c) => c.status === "in_progress")?.count ?? 0;
  const active = ambassadors.length;

  return {
    total_inquiries: total,
    resolved,
    in_progress: inProgress,
    other: total - resolved - inProgress,
    resolution_rate: total > 0 ? Math.round((resolved / total) * 100) : 0,
    active_ambassadors: active,
    avg_rating:
      active > 0
        ? Number((ambassadors.reduce((s, a) => s + a.avg_rating, 0) / active).toFixed(1))
        : 0,
    avg_response_time_minutes:
      active > 0
        ? Math.round(
            ambassadors.reduce((s, a) => s + (a.typical_response_time_minutes ?? 0), 0) / active,
          )
        : 0,
    ambassadors,
  };
}
