// Weekly ambassador program digest. Behavioural spec: V1
// `send-ambassador-digest` (Resend + hand-rolled HTML there; the shared
// GlobalyHub mail layout here, so it reads like every other transactional mail).
//
// The logic lives here, not in the worker, so a test can drive it with an
// injected sender and no SMTP. `src/workers/ambassador-digest.worker.ts` is the
// LavinMQ shim.
//
// V1 skipped a program with no activity in the window; so does this. V1 also
// mailed every business member individually by looking each profile up in a
// loop — V3 mails the business's contact address once, the same recipient rule
// the enquiry digest already uses.

import { config } from "../../../config.js";
import { emailLayout, esc } from "../../../shared/mail/templates.js";
import { createChildLogger } from "../../../shared/logger.js";
import { DIGEST_TOP_AMBASSADORS, DIGEST_WINDOW_DAYS } from "../consts.js";
import * as repo from "../repositories/engagement.repository.js";

const logger = createChildLogger("ambassador-digest");

export interface DigestEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type SendDigest = (email: DigestEmail) => Promise<void>;

export interface DigestResult {
  programs_processed: number;
  emails_sent: number;
  skipped_no_activity: number;
  skipped_no_email: number;
}

interface TopRow {
  name: string;
  resolved: number;
  rating: number;
}

function digestHtml(
  programName: string,
  businessName: string,
  counts: repo.DigestCounts,
  top: TopRow[],
): string {
  const rows =
    top.length > 0
      ? top
          .map(
            (a, i) =>
              `<tr><td style="padding:6px 0;font-size:14px;color:#374151">${i + 1}. ${esc(a.name)}</td>` +
              `<td style="padding:6px 0;font-size:14px;color:#6b7280;text-align:right">${a.resolved} resolved` +
              `${a.rating > 0 ? ` · ${a.rating.toFixed(1)}★` : ""}</td></tr>`,
          )
          .join("")
      : `<tr><td colspan="2" style="padding:6px 0;font-size:13px;color:#9ca3af">No ambassador activity this week</td></tr>`;

  return emailLayout({
    heading: `Weekly ambassador report — ${esc(programName)}`,
    body:
      `<p style="margin:0 0 12px">Hi ${esc(businessName)},</p>` +
      `<p style="margin:0 0 12px">Here is the last ${DIGEST_WINDOW_DAYS} days for your program.</p>` +
      `<ul style="margin:0 0 16px;padding-left:18px">` +
      `<li>${counts.new_inquiries} new inquir${counts.new_inquiries === 1 ? "y" : "ies"}</li>` +
      `<li>${counts.resolved_inquiries} resolved</li>` +
      `<li>${counts.new_ambassadors} new ambassador${counts.new_ambassadors === 1 ? "" : "s"}</li>` +
      `<li>${counts.flagged_messages} flagged message${counts.flagged_messages === 1 ? "" : "s"}</li>` +
      `</ul>` +
      `<table style="width:100%;border-collapse:collapse">${rows}</table>`,
    cta: {
      label: "View dashboard",
      href: `${config.WEB_APP_URL.replace(/\/$/, "")}/business/ambassadors`,
    },
    footnote: `You receive this because you manage ${esc(programName)} on GlobalyHub.`,
  });
}

/**
 * Run one digest pass. Safe to re-deliver: it only reads and sends, and the
 * window is derived from `now`, so a duplicate tick within the same window
 * re-sends the same summary rather than corrupting anything.
 */
export async function runDigest(send: SendDigest, now: Date = new Date()): Promise<DigestResult> {
  const since = new Date(now.getTime() - DIGEST_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const programs = await repo.activeProgramsForDigest();

  let sent = 0;
  let noActivity = 0;
  let noEmail = 0;

  for (const program of programs as Array<{
    id: number;
    name: string;
    business_name: string;
    business_email: string | null;
  }>) {
    const counts = await repo.digestCounts(program.id, since);
    const quiet =
      counts.new_inquiries === 0 &&
      counts.resolved_inquiries === 0 &&
      counts.new_ambassadors === 0 &&
      counts.flagged_messages === 0;
    if (quiet) {
      noActivity += 1;
      continue;
    }
    if (!program.business_email) {
      noEmail += 1;
      continue;
    }

    const top = (await repo.topAmbassadors(program.id, DIGEST_TOP_AMBASSADORS)) as TopRow[];
    try {
      await send({
        to: program.business_email,
        subject: `Weekly ambassador report — ${program.name}`,
        html: digestHtml(program.name, program.business_name, counts, top),
        text:
          `${counts.new_inquiries} new inquiries, ${counts.resolved_inquiries} resolved, ` +
          `${counts.new_ambassadors} new ambassadors, ${counts.flagged_messages} flagged.`,
      });
      sent += 1;
    } catch (err) {
      logger.error("ambassador digest send failed", {
        program_id: program.id,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const result = {
    programs_processed: programs.length,
    emails_sent: sent,
    skipped_no_activity: noActivity,
    skipped_no_email: noEmail,
  };
  logger.info("ambassador digest run", result);
  return result;
}
