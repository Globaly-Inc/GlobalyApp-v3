// "Your profile is ready" email when a business user's own extraction finishes — to the owner of the
// institution/business (user decision, 2026-09-30). Generic across business categories: nothing here
// keys on the category or the pipeline, only on WHO ran it; the content follows what was extracted.
//   - only a BUSINESS USER'S run (`isOwnerRun`): the job was started by a member of the listing it
//     feeds (owner or team, via user_institution_index / user_business_index), not by an admin
//     (superadmin.admin_users), and no admin has acted on it since. Every admin action that starts or
//     continues a run (rerun, resume, deep scrape, reset, run step) stamps
//     `updated_by_platform_user_id`; nothing the business user does in the portal writes it.
//   - only a CLAIMED listing, never a `.invalid` placeholder address.
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
import { adminExtractionReviewEmail, extractionCompleteEmail } from "../../../../shared/mail/templates.js";
import { ensureForOwner } from "../../../ai-counsellor/repositories/embed.repository.js";
import { embedSnippet } from "../../../ai-counsellor/services/embed-handoff.service.js";
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
  starterIsMember: boolean;
  starterIsAdmin: boolean;
}

export interface Recipient { email: string; name: string | null; kind: "owner" | "entity" }

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** `.invalid` is the placeholder owner every promoted listing starts with — reserved, never delivered. */
const valid = (e: string | null | undefined): e is string => !!e && EMAIL_RE.test(e.trim()) && !/\.invalid$/i.test(e.trim());

/** A business user of the listing started this run and no admin has acted on it. Pure. */
export const isOwnerRun = (
  job: { updated_by_platform_user_id: number | string | null },
  entity: Pick<EntityContact, "starterIsMember" | "starterIsAdmin">,
): boolean => job.updated_by_platform_user_id == null && entity.starterIsMember && !entity.starterIsAdmin;

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

/** Which org row this is, for `ensureForOwner`. Kept OFF the exported `EntityContact` because the
 *  pure recipient helpers have no use for it and their fixtures would have to carry it. */
type EntityRow = EntityContact & { entityId: number; entityKind: "institution" | "business" };

/** The institution, else the business, whose source job this is — with its owner's contact and
 *  whether `starterId` (the job's creator) is one of its members, or an admin. */
async function entityFor(jobId: string, starterId: number | null): Promise<EntityRow | null> {
  const k = masterKnex;
  const isAdmin = () => k.raw(`exists (select 1 from superadmin.admin_users a
    where a.platform_user_id = ? and a.deleted_at is null) as "starterIsAdmin"`, [starterId]);
  const inst = await k("public.institutions as i")
    .leftJoin("public.platform_users as u", "u.id", "i.platform_user_id")
    .where("i.source_job_id", jobId).whereNull("i.deleted_at")
    .first("i.id as entityId", k.raw(`'institution' as "entityKind"`),
      "i.institution_name as entityName", "i.email as entityEmail", "u.email as ownerEmail",
      "u.first_name as ownerFirstName", "u.display_name as ownerDisplayName", "i.claim_status as claimStatus",
      k.raw(`(i.platform_user_id = ? or exists (select 1 from public.user_institution_index m
        where m.institution_id = i.id and m.platform_user_id = ? and m.deleted_at is null)) as "starterIsMember"`, [starterId, starterId]),
      isAdmin());
  if (inst) return inst;
  const biz = await k("public.businesses as b")
    .leftJoin("public.platform_users as u", "u.id", "b.owner_id")
    .where("b.source_job_id", jobId).whereNull("b.deleted_at")
    .first("b.id as entityId", k.raw(`'business' as "entityKind"`),
      "b.business_name as entityName", "b.email as entityEmail", "u.email as ownerEmail",
      "u.first_name as ownerFirstName", "u.display_name as ownerDisplayName", "b.claim_status as claimStatus",
      k.raw(`(b.owner_id = ? or exists (select 1 from public.user_business_index m
        where m.business_id = b.id and m.platform_user_id = ? and m.deleted_at is null)) as "starterIsMember"`, [starterId, starterId]),
      isAdmin());
  return biz ?? null;
}

type MarkerKey = "completion_email" | "admin_review_email";

/** Atomically move this run's marker from one of `from` (null = unset) to `value`. False = it was elsewhere. */
async function mark(jobId: string, value: string, from: Array<string | null>, key: MarkerKey = "completion_email"): Promise<boolean> {
  const allowed = from.filter((v): v is string => v !== null);
  const n = await masterKnex(`${S}.extraction_jobs`)
    .where({ id: jobId })
    .where((q) => {
      if (from.includes(null)) q.orWhereRaw("(pipeline_progress->>?) IS NULL", [key]);
      if (allowed.length) q.orWhereRaw("(pipeline_progress->>?) = ANY(?)", [key, allowed]);
    })
    .update({ pipeline_progress: masterKnex.raw("coalesce(pipeline_progress, '{}'::jsonb) || ?::jsonb", [JSON.stringify({ [key]: value })]) });
  return n > 0;
}

/** Give a failed send's slot back so the next verification of this run tries again. */
async function release(jobId: string, key: MarkerKey = "completion_email"): Promise<void> {
  await masterKnex(`${S}.extraction_jobs`).where({ id: jobId })
    .whereRaw("(pipeline_progress->>?) = 'sent'", [key])
    .update({ pipeline_progress: masterKnex.raw("pipeline_progress - ?::text", [key]) });
}

export const _completionDeps = { send: queueEmail };

/** What a finished run found — the figures both completion mails report. */
async function jobCoverage(jobId: string, isVisa: boolean) {
  if (isVisa) {
    const row = await masterKnex(`${S}.extraction_visa_services`).where({ job_id: jobId }).count({ n: "*" }).first();
    return { itemCount: Number(row?.n ?? 0), coverage: [] as Array<{ label: string; count: number; of?: number }> };
  }
  const { total, counts } = await fieldCoverage(jobId);
  const campuses = await masterKnex(`${S}.extraction_campuses`).where({ job_id: jobId }).count({ n: "*" }).first();
  return {
    itemCount: total,
    coverage: [
      // No `of`: campuses are a count in their own right, not a share of the course total.
      { label: `campus${Number(campuses?.n) === 1 ? "" : "es"}`, count: Number(campuses?.n ?? 0) },
      { label: "courses with fees", count: counts.fees ?? 0, of: total },
      { label: "courses with intake dates", count: counts.intakes ?? 0, of: total },
      { label: "courses with entry requirements", count: counts.eligibility ?? 0, of: total },
      { label: "courses with study units", count: counts.units ?? 0, of: total },
    ] as Array<{ label: string; count: number; of?: number }>,
  };
}

/** Never throws: the job is already in review, and a mail problem must not undo that. */
export async function sendCompletionEmail(jobId: string): Promise<"sent" | "skipped" | "already" | "failed"> {
  let claimed = false;
  try {
    const job = await masterKnex(`${S}.extraction_jobs`).where({ id: jobId })
      .first("source_type", "institution_name", "institution_url", "status", "created_by_platform_user_id", "updated_by_platform_user_id");
    // Only a finished verification: link_entities can also be run by hand in the middle of a crawl.
    // The sign-up placeholder job carries no crawl.
    if (!job || job.status !== "review" || job.source_type === "self_service") return "skipped";

    const entity = await entityFor(jobId, job.created_by_platform_user_id ?? null);

    if (!entity || !isOwnerRun(job, entity)) return "skipped";
    const recipient = entity ? pickRecipient(entity) : null;
    if (!recipient) {
      if (await mark(jobId, "skipped", [null])) {
        await writeJobEvent(jobId, "completion_email_skipped", {
          phase: "verification",
          message: !isOwned(entity)
              ? "No completion email: the listing is not claimed, so it has no owner to tell"
              : "No completion email: the institution/business has no owner email or email of its own",
          data: { owned: isOwned(entity) },
        });
      }
      return "skipped";
    }

    const isVisa = job.source_type === "visa_service";
    const { itemCount, coverage } = await jobCoverage(jobId, isVisa);

    // The org's real tag, so the mail hands over something they can paste rather than a link to go
    // find it. Best-effort by design: this mail reports a finished crawl, and a widget problem must
    // not cost them that report — the panel falls back to the portal link.
    let snippet: string | null = null;
    try {
      const widget = await ensureForOwner({ kind: entity.entityKind, id: entity.entityId });
      snippet = embedSnippet(widget.embed_key);
    } catch (err) {
      logger.warn("Completion email: embed snippet unavailable", {
        jobId, error: err instanceof Error ? err.message : String(err),
      });
    }

    const mail = extractionCompleteEmail({
      recipientName: recipient.kind === "owner" ? recipient.name : null,
      entityName: entity?.entityName || job.institution_name || "your institution",
      website: job.institution_url ? job.institution_url.replace(/^https?:\/\//, "").replace(/\/$/, "") : null,
      itemLabel: isVisa ? "services" : "courses",
      itemCount,
      coverage,
      portalUrl: `${config.WEB_APP_URL.replace(/\/$/, "")}/business/portal`,
      snippet,
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

/** Same inbox, ignoring case and stray spaces — an admin account and an owner account are one person here. Pure. */
export const isSamePerson = (a: string | null | undefined, b: string | null | undefined): boolean =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** The admin who ran this extraction: whoever last started/continued it, else its creator. Pure. */
export const adminReviewerId = (job: { created_by_platform_user_id: number | null; updated_by_platform_user_id: number | null }) =>
  job.updated_by_platform_user_id ?? job.created_by_platform_user_id ?? null;

/**
 * "Ready for review" to the admin who ran the extraction — the admin-side counterpart of the owner's
 * mail above, sent at the same moment. A run started by a business user (not an admin) has no admin
 * reviewer and is skipped. Own marker, so once per run independently of the owner's. Never throws.
 */
export async function sendAdminReviewEmail(jobId: string): Promise<"sent" | "skipped" | "already" | "failed"> {
  const KEY = "admin_review_email";
  let claimed = false;
  try {
    const job = await masterKnex(`${S}.extraction_jobs`).where({ id: jobId })
      .first("source_type", "institution_name", "institution_url", "status", "created_by_platform_user_id", "updated_by_platform_user_id");
    if (!job || job.status !== "review" || job.source_type === "self_service") return "skipped";

    const reviewerId = adminReviewerId(job);
    if (reviewerId == null) return "skipped";
    const admin = await masterKnex("superadmin.admin_users as a")
      .join("public.platform_users as u", "u.id", "a.platform_user_id")
      .where({ "a.platform_user_id": reviewerId, "a.is_active": true }).whereNull("a.deleted_at")
      .first("u.email", "u.first_name", "u.display_name");
    if (!admin) return "skipped"; // a business user's own run — the owner's mail covers it
    if (!valid(admin.email)) {
      if (await mark(jobId, "skipped", [null], KEY)) {
        await writeJobEvent(jobId, "admin_review_email_skipped", {
          phase: "verification", message: "No review email: the admin who ran this extraction has no valid email",
        });
      }
      return "skipped";
    }

    const entity = await entityFor(jobId, null);
    // The admin owns this listing too: they are the business owner, not a reviewer of someone else's
    // listing, so the admin review mail is not theirs to get.
    if (isSamePerson(admin.email, entity?.ownerEmail)) {
      if (await mark(jobId, "skipped", [null], KEY)) {
        await writeJobEvent(jobId, "admin_review_email_skipped", {
          phase: "verification", message: "No review email: the admin who ran this extraction is the listing's owner",
        });
      }
      return "skipped";
    }

    const isVisa = job.source_type === "visa_service";
    const { itemCount, coverage } = await jobCoverage(jobId, isVisa);
    const mail = adminExtractionReviewEmail({
      recipientName: admin.first_name?.trim() || admin.display_name?.trim() || null,
      entityName: entity?.entityName || job.institution_name || "this institution",
      website: job.institution_url ? job.institution_url.replace(/^https?:\/\//, "").replace(/\/$/, "") : null,
      itemLabel: isVisa ? "services" : "courses",
      itemCount,
      coverage,
      reviewUrl: `${config.WEB_APP_URL.replace(/\/$/, "")}/admin/data/all-extractions/${jobId}`,
    });
    if (!(await mark(jobId, "sent", [null, "skipped"], KEY))) return "already";
    claimed = true;
    await _completionDeps.send({ to: admin.email.trim(), ...mail });
    claimed = false;
    await writeJobEvent(jobId, "admin_review_email_sent", {
      phase: "verification",
      message: `Review email sent to the admin who ran this extraction (${maskEmail(admin.email.trim())})`,
      data: { to: maskEmail(admin.email.trim()), items: itemCount },
    });
    return "sent";
  } catch (err) {
    logger.warn("Admin review email failed", { jobId, error: err instanceof Error ? err.message : String(err) });
    if (claimed) await release(jobId, KEY).catch(() => {});
    await writeJobEvent(jobId, "admin_review_email_failed", {
      level: "warn", phase: "verification", message: "Admin review email could not be sent",
      data: { error: err instanceof Error ? err.message : String(err) },
    }).catch(() => {});
    return "failed";
  }
}
