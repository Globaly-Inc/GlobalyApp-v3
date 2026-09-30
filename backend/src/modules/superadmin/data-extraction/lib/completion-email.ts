// "Your profile is ready" email when a job finishes verification — to the owner of the institution
// or business the job belongs to, else that entity's own email. Jobs with no platform institution or
// business (an admin crawl of a university that has no account here) are NOT emailed: the only
// address would be one scraped off their site, and that would be unsolicited outreach.
//
// Once per RUN: the claim is a marker in pipeline_progress, which the job worker rewrites wholesale
// at the start of every run (Re-run, Deep scrape) — so a redelivered VERIFY, a Resume or a manual
// re-verification inside one run never sends twice, and the next run sends again.

import { masterKnex } from "../../../../core/db/master-pool.js";
import { config } from "../../../../config.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { extractionCompleteEmail } from "../../../../shared/mail/templates.js";
import { queueEmail } from "../../../auth/auth.service.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import { fieldCoverage } from "./field-coverage.js";
import { writeJobEvent } from "./staging-writer.js";

const logger = createChildLogger("completion-email");

export interface EntityContact {
  entityName: string | null;
  entityEmail: string | null;
  ownerEmail: string | null;
  ownerFirstName: string | null;
  ownerDisplayName: string | null;
}

export interface Recipient { email: string; name: string | null; kind: "owner" | "entity" }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const valid = (e: string | null | undefined): e is string => !!e && EMAIL_RE.test(e.trim());

/** Owner first, else the entity's own address, else nobody. Pure. */
export function pickRecipient(c: EntityContact): Recipient | null {
  if (valid(c.ownerEmail)) {
    return { email: c.ownerEmail.trim(), name: c.ownerFirstName?.trim() || c.ownerDisplayName?.trim() || null, kind: "owner" };
  }
  if (valid(c.entityEmail)) return { email: c.entityEmail.trim(), name: null, kind: "entity" };
  return null;
}

/** "jo***@example.edu" — enough on the timeline to tell which inbox, without publishing the address. */
export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 2)}***@${domain}`;
}

/** The institution, else the business, whose source job this is — with its owner's contact. */
async function entityFor(jobId: string): Promise<EntityContact | null> {
  const inst = await masterKnex("public.institutions as i")
    .leftJoin("public.platform_users as u", "u.id", "i.platform_user_id")
    .where("i.source_job_id", jobId).whereNull("i.deleted_at")
    .first("i.institution_name as entityName", "i.email as entityEmail", "u.email as ownerEmail",
      "u.first_name as ownerFirstName", "u.display_name as ownerDisplayName");
  if (inst) return inst;
  const biz = await masterKnex("public.businesses as b")
    .leftJoin("public.platform_users as u", "u.id", "b.owner_id")
    .where("b.source_job_id", jobId).whereNull("b.deleted_at")
    .first("b.business_name as entityName", "b.email as entityEmail", "u.email as ownerEmail",
      "u.first_name as ownerFirstName", "u.display_name as ownerDisplayName");
  return biz ?? null;
}

/** Atomically take this run's email slot. False = already taken (sent or skipped) in this run. */
async function claim(jobId: string, value: string): Promise<boolean> {
  const n = await masterKnex(`${S}.extraction_jobs`)
    .where({ id: jobId })
    .whereRaw("(pipeline_progress->>'completion_email') IS NULL")
    .update({ pipeline_progress: masterKnex.raw("coalesce(pipeline_progress, '{}'::jsonb) || ?::jsonb", [JSON.stringify({ completion_email: value })]) });
  return n > 0;
}

export const _completionDeps = { send: queueEmail };

/** Never throws: the job is already in review, and a mail problem must not undo that. */
export async function sendCompletionEmail(jobId: string): Promise<"sent" | "skipped" | "already" | "failed"> {
  try {
    const job = await masterKnex(`${S}.extraction_jobs`).where({ id: jobId })
      .first("source_type", "institution_name", "institution_url");
    // Sign-up placeholder jobs carry no crawl — there is nothing to report.
    if (!job || job.source_type === "self_service") return "skipped";

    const entity = await entityFor(jobId);
    const recipient = entity ? pickRecipient(entity) : null;
    if (!(await claim(jobId, recipient ? "sent" : "skipped"))) return "already";
    if (!recipient) {
      await writeJobEvent(jobId, "completion_email_skipped", {
        phase: "verification",
        message: entity
          ? "No completion email: the institution/business has no owner email or email of its own"
          : "No completion email: this job belongs to no institution or business on the platform",
        data: { has_entity: !!entity },
      });
      return "skipped";
    }

    const isVisa = job.source_type === "visa_service";
    let itemCount: number;
    let coverage: Array<{ label: string; count: number }> = [];
    if (isVisa) {
      const row = await masterKnex(`${S}.extraction_visa_services`).where({ job_id: jobId }).count({ n: "*" }).first();
      itemCount = Number(row?.n ?? 0);
    } else {
      const { total, counts } = await fieldCoverage(jobId);
      const campuses = await masterKnex(`${S}.extraction_campuses`).where({ job_id: jobId }).count({ n: "*" }).first();
      itemCount = total;
      coverage = [
        { label: `campus${Number(campuses?.n) === 1 ? "" : "es"}`, count: Number(campuses?.n ?? 0) },
        { label: "courses with fees", count: counts.fees ?? 0 },
        { label: "courses with intake dates", count: counts.intakes ?? 0 },
        { label: "courses with entry requirements", count: counts.eligibility ?? 0 },
        { label: "courses with study units", count: counts.units ?? 0 },
      ];
    }

    const mail = extractionCompleteEmail({
      recipientName: recipient.kind === "owner" ? recipient.name : null,
      entityName: entity?.entityName || job.institution_name || "your institution",
      website: job.institution_url ? job.institution_url.replace(/^https?:\/\//, "").replace(/\/$/, "") : null,
      itemLabel: isVisa ? "services" : "courses",
      itemCount,
      coverage,
      portalUrl: `${config.WEB_APP_URL.replace(/\/$/, "")}/business/portal`,
    });
    await _completionDeps.send({ to: recipient.email, ...mail });
    await writeJobEvent(jobId, "completion_email_sent", {
      phase: "verification",
      message: `Completion email sent to the ${recipient.kind === "owner" ? "owner" : "institution's own address"} (${maskEmail(recipient.email)})`,
      data: { recipient_kind: recipient.kind, to: maskEmail(recipient.email), items: itemCount },
    });
    return "sent";
  } catch (err) {
    logger.warn("Completion email failed", { jobId, error: err instanceof Error ? err.message : String(err) });
    await writeJobEvent(jobId, "completion_email_failed", {
      level: "warn", phase: "verification", message: "Completion email could not be sent",
      data: { error: err instanceof Error ? err.message : String(err) },
    }).catch(() => {});
    return "failed";
  }
}
