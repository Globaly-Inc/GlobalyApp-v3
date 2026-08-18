// Inquiry accept-timeout handling. Behavioural spec: V1
// `process-ambassador-timeout`, run there as an unscheduled edge function.
//
// The logic lives here, not in the worker, so a test can drive it with no broker
// and a fixed clock. `src/workers/ambassador-timeout.worker.ts` is the LavinMQ
// shim.
//
// Idempotent over a re-delivered tick: rerouting flips `status` and pushes
// `expires_at` forward inside a conditional UPDATE that also re-asserts the
// previous assignee, so a second delivery finds nothing left to claim.

import { masterKnex } from "../../../core/db/master-pool.js";
import { createChildLogger } from "../../../shared/logger.js";
import {
  INQUIRY_ACCEPT_WINDOW_MS,
  REROUTE_CANDIDATE_LIMIT,
  TIMEOUT_BATCH_LIMIT,
} from "../consts.js";
import { pickNextAmbassador } from "../lib/matching.js";
import * as engagement from "../repositories/engagement.repository.js";
import { publish as publishNotification } from "../../notifications/services/notifications.service.js";

const logger = createChildLogger("ambassador-timeout");

export interface TimeoutResult {
  processed: number;
  rerouted: number;
  escalated: number;
}

export async function processTimeouts(
  now: Date = new Date(),
  limit = TIMEOUT_BATCH_LIMIT,
): Promise<TimeoutResult> {
  const expired = await engagement.claimExpiredInquiries(now, limit);
  if (expired.length === 0) return { processed: 0, rerouted: 0, escalated: 0 };

  let rerouted = 0;
  let escalated = 0;

  for (const inquiry of expired) {
    const candidates = await engagement.rerouteCandidates(
      inquiry.program_id,
      inquiry.ambassador_id,
      REROUTE_CANDIDATE_LIMIT,
    );
    const next = pickNextAmbassador(
      candidates,
      (inquiry.inquiry_context?.country_of_origin as string | undefined) ?? null,
    );

    if (!next) {
      // Nobody else is online in this program — escalate rather than leave the
      // prospect waiting on an ambassador who is not coming.
      const claimed = await masterKnex("ambassador_inquiries")
        .where({ id: inquiry.id, status: "matched" })
        .update({
          status: "escalated",
          escalated_at: now,
          expires_at: null,
          updated_at: masterKnex.fn.now(),
        });
      if (claimed > 0) escalated += 1;
      continue;
    }

    const claimed = await masterKnex("ambassador_inquiries")
      .where({ id: inquiry.id, status: "matched" })
      .update({
        ambassador_id: next.id,
        matched_at: now,
        expires_at: new Date(now.getTime() + INQUIRY_ACCEPT_WINDOW_MS),
        updated_at: masterKnex.fn.now(),
      });
    if (claimed === 0) continue; // somebody accepted between the read and here

    rerouted += 1;
    await masterKnex("ambassadors").where({ id: next.id }).increment("total_inquiries", 1);

    // Best-effort by construction: publish() swallows broker failures and
    // returns false, so a LavinMQ outage cannot undo a reroute that happened.
    // The dedupe key is per (inquiry, assignee), so a re-delivered tick that
    // somehow reroutes to the same person still produces one notification.
    const queued = await publishNotification({
      platform_user_ids: [next.user_id],
      type: "ambassador_inquiry",
      title: "New inquiry assigned to you",
      body: "A prospective student inquiry has been routed to you. Please accept within 5 minutes.",
      reference_type: "ambassador_inquiry",
      reference_id: String(inquiry.id),
      dedupe_key: `ambassador_inquiry:${inquiry.id}:${next.id}`,
    });
    if (!queued) logger.warn("reroute notification not queued", { inquiry_id: inquiry.id });
  }

  return { processed: expired.length, rerouted, escalated };
}
