// "Your profile is ready" email when a business user's own extraction finishes — to the owner of the
// institution/business (user decision, 2026-09-30):
//   - only the OWNER'S run: a job started from the portal (`institution_self_service` /
//     `business_self_service`, created by the owner's "start extraction") that no admin has acted on.
//     Every admin action that starts or continues a run (rerun, resume, deep scrape, reset, run step)
//     stamps `updated_by_platform_user_id`, and nothing the owner does in the portal writes it — so a
//     non-null value means an admin ran it, and admin runs are never mailed.
//   - only a CLAIMED listing (sign-up creates theirs claimed), never a `.invalid` placeholder address.
// ponytail: "an admin acted" is job-level, so an admin pausing or editing the owner's run also
// suppresses the mail; record the run's starter on the job if that ever needs to be finer.
//
// Once per RUN: the marker lives in pipeline_progress, which the job worker rewrites wholesale at the
// start of every run. "sent" is taken just before the send and released if the send fails, so a
// failed attempt stays retryable; "skipped" only quiets the timeline and still lets a later
// verification in the same run send. Sent after link_entities when linking runs, so the counts are final.

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
  claimStatus: string | null;
}

export interface Recipient { email: string; name: string | null; kind: "owner" | "entity" }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** `.invalid` is the placeholder owner every promoted listing starts with — reserved, never delivered. */
const valid = (e: string | null | undefined): e is string => !!e && EMAIL_RE.test(e.trim()) && !/\.invalid$/i.test(e.trim());

/** Portal-started jobs: the only runs a business user can start. */
const OWNER_SOURCE_TYPES = new Set(["institution_self_service", "business_self_service"]);

/** The business user's own run, untouched by an admin. Pure. */
export const isOwnerRun = (job: { source_type: string | null; updated_by_platform_user_id: number | string | null }): boolean =>
  OWNER_SOURCE_TYPES.has(job.source_type ?? "") && job.updated_by_platform_user_id == null;

/** A listing with a real owner. Unclaimed listings are never mailed (user decision). Pure. */
export const isOwned = (c: Pick<EntityContact, "claimStatus">): boolean => c.claimStatus === "claimed";

/** Owned listings only; the owner first, else the entity's own address, else nobody. Pure. */
export function pickRecipient(c: EntityContact): Recipient | null {
  if (!isOwned(c)) return null;
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
      "u.first_name as ownerFirstName", "u.display_name as ownerDisplayName", "i.claim_status as claimStatus");
  if (inst) return inst;
  const biz = await masterKnex("public.businesses as b")
    .leftJoin("public.platform_users as u", "u.id", "b.owner_id")
    .where("b.source_job_id", jobId).whereNull("b.deleted_at")
    .first("b.business_name as entityName", "b.email as entityEmail", "u.email as ownerEmail",
      "u.first_name as ownerFirstName", "u.display_name as ownerDisplayName", "b.claim_status as claimStatus");
  return biz ?? null;
}

/** Atomically move this run's marker from one of `from` (null = unset) to `value`. False = it was elsewhere. */
async function mark(jobId: string, value: string, from: Array<string | null>): Promise<boolean> {
  const allowed = from.filter((v): v is string => v !== null);
  const n = await masterKnex(`${S}.extraction_jobs`)
    .where({ id: jobId })
    .where((q) => {
      if (from.includes(null)) q.orWhereRaw("(pipeline_progress->>'completion_email') IS NULL");
      if (allowed.length) q.orWhereRaw("(pipeline_progress->>'completion_email') = ANY(?)", [allowed]);
    })
    .update({ pipeline_progress: masterKnex.raw("coalesce(pipeline_progress, '{}'::jsonb) || ?::jsonb", [JSON.stringify({ completion_email: value })]) });
  return n > 0;
}

/** Give a failed send's slot back so the next verification of this run tries again. */
async function release(jobId: string): Promise<void> {
  await masterKnex(`${S}.extraction_jobs`).where({ id: jobId })
    .whereRaw("(pipeline_progress->>'completion_email') = 'sent'")
    .update({ pipeline_progress: masterKnex.raw("pipeline_progress - 'completion_email'") });
}

export const _completionDeps = { send: queueEmail };

/** Never throws: the job is already in review, and a mail problem must not undo that. */
export async function sendCompletionEmail(jobId: string): Promise<"sent" | "skipped" | "already" | "failed"> {
  let claimed = false;
  try {
    const job = await masterKnex(`${S}.extraction_jobs`).where({ id: jobId })
      .first("source_type", "institution_name", "institution_url", "status", "updated_by_platform_user_id");
    // Only a finished verification: link_entities can also be run by hand in the middle of a crawl.
    // Admin runs are silent — no event on every admin crawl's timeline.
    if (!job || job.status !== "review" || !isOwnerRun(job)) return "skipped";

    const entity = await entityFor(jobId);
    const recipient = entity ? pickRecipient(entity) : null;
    if (!recipient) {
      if (await mark(jobId, "skipped", [null])) {
        await writeJobEvent(jobId, "completion_email_skipped", {
          phase: "verification",
          message: !entity
            ? "No completion email: no institution or business is linked to this job"
            : !isOwned(entity)
              ? "No completion email: the listing is not claimed, so it has no owner to tell"
              : "No completion email: the institution/business has no owner email or email of its own",
          data: { has_entity: !!entity, owned: entity ? isOwned(entity) : false },
        });
      }
      return "skipped";
    }

    // Portal extraction is institutions-only (businesses.startExtraction), so it is always courses.
    const { total: itemCount, counts } = await fieldCoverage(jobId);
    const campuses = await masterKnex(`${S}.extraction_campuses`).where({ job_id: jobId }).count({ n: "*" }).first();
    const coverage = [
      { label: `campus${Number(campuses?.n) === 1 ? "" : "es"}`, count: Number(campuses?.n ?? 0) },
      { label: "courses with fees", count: counts.fees ?? 0 },
      { label: "courses with intake dates", count: counts.intakes ?? 0 },
      { label: "courses with entry requirements", count: counts.eligibility ?? 0 },
      { label: "courses with study units", count: counts.units ?? 0 },
    ];

    const mail = extractionCompleteEmail({
      recipientName: recipient.kind === "owner" ? recipient.name : null,
      entityName: entity?.entityName || job.institution_name || "your institution",
      website: job.institution_url ? job.institution_url.replace(/^https?:\/\//, "").replace(/\/$/, "") : null,
      itemLabel: "courses",
      itemCount,
      coverage,
      portalUrl: `${config.WEB_APP_URL.replace(/\/$/, "")}/business/portal`,
    });
    if (!(await mark(jobId, "sent", [null, "skipped"]))) return "already";
    claimed = true;
    await _completionDeps.send({ to: recipient.email, ...mail });
    claimed = false; // delivered to the queue: a failure after this point must not re-send
    await writeJobEvent(jobId, "completion_email_sent", {
      phase: "verification",
      message: `Completion email sent to the ${recipient.kind === "owner" ? "owner" : "institution's own address"} (${maskEmail(recipient.email)})`,
      data: { recipient_kind: recipient.kind, to: maskEmail(recipient.email), items: itemCount },
    });
    return "sent";
  } catch (err) {
    logger.warn("Completion email failed", { jobId, error: err instanceof Error ? err.message : String(err) });
    if (claimed) await release(jobId).catch(() => {});
    await writeJobEvent(jobId, "completion_email_failed", {
      level: "warn", phase: "verification", message: "Completion email could not be sent",
      data: { error: err instanceof Error ? err.message : String(err) },
    }).catch(() => {});
    return "failed";
  }
}
