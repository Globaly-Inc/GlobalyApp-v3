// Inbound cross-app payload → EXTRACTION STAGING.
//
// THE ONE STRUCTURAL DECISION HERE. V1's receive-institution-data wrote straight into
// the live tables: it inserted/updated `businesses`, attached allowed categories, and
// created `business_services` rows (unpublished, but present), all outside any
// transaction. §3.4 specifies this endpoint as "inbound webhook → staging", and that
// is what this does: everything lands in superadmin.extraction_* with the job status
// "review", and reaches the live catalogue only through the existing human review +
// promote path. An external system holding a shared secret does not get to write the
// public catalogue directly.
//
// TABLE SHAPES ARE V3's, NOT V1's. Fees, intakes, eligibility and accreditations are
// written exactly the way data-extraction/workers/extraction-step.worker.ts writes
// them — entity row plus `extraction_course_*_assignments` junction row — because
// that is the shape the existing review and promote code reads (§1.7: reuse V3's
// shapes before inventing one). Writing a `course_id` column that those tables do
// not have would have produced rows the review console cannot see.
//
// IDEMPOTENT, and provably so: one extraction job per (source_type,
// institution_url), and a re-post replaces that job's children inside ONE
// transaction. Two identical posts leave the same rows. V1's did not — it re-created
// businesses whenever the payload had no website, and its delete-then-recreate of
// fees/intakes/eligibility ran unwrapped, so a mid-way failure left a course with its
// old rows deleted and its new ones missing.

import type { Knex } from "knex";

import { masterKnex } from "../../../core/db/master-pool.js";
import { SUPERADMIN_SCHEMA as S } from "../../superadmin/consts.js";
import type { IngestCourseInput, IngestInstitutionInput } from "../schemas/ingest.schema.js";

/** Marks jobs created by this webhook, so the review console can tell them apart. */
export const INGEST_SOURCE_TYPE = "cross_app_webhook";

/**
 * Landing status.
 *
 * "review" is an existing member of JOB_STATUSES and of PROMOTABLE_JOB_STATUSES
 * (data-extraction/schemas/jobs.schema.ts), which is exactly the semantics wanted:
 * visible in the review queue, promotable once a human approves, live nowhere yet.
 */
export const INGEST_STATUS = "review";

/** extraction_course_fees.currency is NOT NULL; this is the table's own default. */
const DEFAULT_FEE_CURRENCY = "AUD";

export interface IngestSummary {
  job_id: string;
  job_created: boolean;
  courses: number;
  campuses: number;
  fees: number;
  intakes: number;
  eligibility: number;
  accreditations: number;
}

/** extraction_courses stores weeks; the payload sends a value plus a unit. */
export function durationWeeks(course: Pick<IngestCourseInput, "duration_value" | "duration_unit">): number | null {
  if (course.duration_value == null) return null;
  switch (course.duration_unit) {
    case "days":
      return Math.max(1, Math.round(course.duration_value / 7));
    case "weeks":
      return course.duration_value;
    case "years":
      return course.duration_value * 52;
    case "months":
    default:
      // extraction's own convention elsewhere: a month is 4 weeks, not 4.345.
      return course.duration_value * 4;
  }
}

/** V1/V3 vocabularies differ by one word: V1's "all" is V3's "both". */
export function studentType(applicableTo: string | undefined): string {
  if (!applicableTo || applicableTo === "all") return "both";
  return applicableTo;
}

/**
 * Total of one fee block's items, as an exact 2-decimal string.
 *
 * Summed in BigInt fixed point rather than with `+` on numbers: this figure lands in
 * `numeric` and then on a price page, and 0.1 + 0.2 is the classic way for a total
 * to end in ...0000004. Returns null when the block carries no items at all, which
 * is different from a total of 0.
 */
export function feeTotal(fee: {
  installments: Array<{ items: Array<{ amount: number | string }> }>;
}): string | null {
  let cents = 0n;
  let seen = false;
  for (const installment of fee.installments) {
    for (const item of installment.items) {
      const raw = typeof item.amount === "number" ? item.amount.toString() : item.amount;
      const negative = raw.startsWith("-");
      const [whole, frac = ""] = (negative ? raw.slice(1) : raw).split(".");
      const scaled = BigInt(whole + (frac + "00").slice(0, 2));
      cents += negative ? -scaled : scaled;
      seen = true;
    }
  }
  if (!seen) return null;

  const negative = cents < 0n;
  const digits = (negative ? -cents : cents).toString().padStart(3, "0");
  return `${negative ? "-" : ""}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

async function findJob(trx: Knex.Transaction, website: string): Promise<{ id: string } | undefined> {
  return trx(`${S}.extraction_jobs`)
    .select("id")
    .where({ source_type: INGEST_SOURCE_TYPE, institution_url: website })
    .orderBy("created_at", "desc")
    .first<{ id: string } | undefined>();
}

/** Children rebuilt from every payload, newest-wins. Junctions cascade from their parents. */
async function clearJobChildren(trx: Knex.Transaction, jobId: string): Promise<void> {
  await trx(`${S}.extraction_institution_overview`).where({ job_id: jobId }).del();
  await trx(`${S}.extraction_campuses`).where({ job_id: jobId }).del();
  await trx(`${S}.extraction_course_fees`).where({ job_id: jobId }).del();
  await trx(`${S}.extraction_intakes`).where({ job_id: jobId }).del();
  await trx(`${S}.extraction_eligibility_requirements`).where({ job_id: jobId }).del();
  // Last: the assignment rows FK to courses ON DELETE CASCADE, so courses go after
  // the entities they point at have already gone.
  await trx(`${S}.extraction_courses`).where({ job_id: jobId }).del();
}

export async function ingest(payload: IngestInstitutionInput): Promise<IngestSummary> {
  const { institution, campuses, courses } = payload;

  return masterKnex.transaction(async (trx) => {
    const existing = await findJob(trx, institution.website);

    let jobId: string;
    if (existing) {
      jobId = existing.id;
      await trx(`${S}.extraction_jobs`).where({ id: jobId }).update({
        institution_name: institution.name,
        status: INGEST_STATUS,
        courses_extracted: courses.length,
        updated_at: trx.fn.now(),
      });
      await clearJobChildren(trx, jobId);
    } else {
      const [row] = await trx(`${S}.extraction_jobs`)
        .insert({
          institution_name: institution.name,
          institution_url: institution.website,
          status: INGEST_STATUS,
          source_type: INGEST_SOURCE_TYPE,
          courses_extracted: courses.length,
        })
        .returning(["id"]);
      jobId = String((row as { id: string }).id);
    }

    await trx(`${S}.extraction_institution_overview`).insert({
      job_id: jobId,
      name: institution.name,
      website: institution.website,
      email: institution.email ?? null,
      phone: institution.phone ?? null,
      address: institution.address ?? null,
      city: institution.city ?? null,
      state: institution.state ?? null,
      country: institution.country ?? null,
      zip_code: institution.postcode ?? null,
      description: institution.description ?? null,
      logo_url: institution.logo_url ?? null,
      source_url: institution.website,
      facebook_url: institution.facebook_url ?? null,
      instagram_url: institution.instagram_url ?? null,
      linkedin_url: institution.linkedin_url ?? null,
      twitter_url: institution.twitter_url ?? null,
      youtube_url: institution.youtube_url ?? null,
    });

    const summary: IngestSummary = {
      job_id: jobId,
      job_created: !existing,
      courses: 0,
      campuses: 0,
      fees: 0,
      intakes: 0,
      eligibility: 0,
      accreditations: 0,
    };

    const campusIdByName = new Map<string, string>();
    for (const campus of campuses) {
      const [row] = await trx(`${S}.extraction_campuses`)
        .insert({
          job_id: jobId,
          name: campus.name,
          address: campus.address ?? null,
          city: campus.city ?? null,
          state: campus.state ?? null,
          country: campus.country ?? null,
          postcode: campus.postcode ?? null,
          email: campus.email ?? null,
          phone: campus.phone ?? null,
          map_link: campus.map_link ?? null,
          source_url: institution.website,
        })
        .returning(["id"]);
      campusIdByName.set(campus.name, String((row as { id: string }).id));
      summary.campuses += 1;
    }

    for (const course of courses) {
      const [inserted] = await trx(`${S}.extraction_courses`)
        .insert({
          job_id: jobId,
          name: course.name,
          degree_level: course.degree_level ?? null,
          subject_area: course.subject_area ?? null,
          duration_weeks: durationWeeks(course),
          study_mode: course.study_mode ?? null,
          description: course.description ?? null,
          brochure_url: course.brochure_url ?? null,
          image_url: course.image_url ?? null,
          source_url: course.source_url ?? institution.website,
          // Nothing arriving over a webhook is verified by arriving.
          verification_status: "unverified",
        })
        .returning(["id"]);
      const courseId = String((inserted as { id: string }).id);
      summary.courses += 1;

      // Course-level fee totals, split the way extraction_courses splits them.
      let domesticTotal: string | null = null;
      let internationalTotal: string | null = null;

      for (const fee of course.fees) {
        const total = feeTotal(fee);
        const type = studentType(fee.applicable_to);
        const [feeRow] = await trx(`${S}.extraction_course_fees`)
          .insert({
            job_id: jobId,
            name: fee.name ?? "Tuition",
            student_type: type,
            period_type: fee.period ?? "Per Year",
            currency: fee.currency ?? DEFAULT_FEE_CURRENCY,
            total_amount: total ?? 0,
            installments: JSON.stringify(fee.installments),
          })
          .returning(["id"]);
        await trx(`${S}.extraction_course_fee_assignments`).insert({
          job_id: jobId,
          course_id: courseId,
          course_fee_id: String((feeRow as { id: string }).id),
        });
        summary.fees += 1;

        if (total !== null) {
          if (type === "domestic" || type === "both") domesticTotal ??= total;
          if (type === "international" || type === "both") internationalTotal ??= total;
        }
      }

      if (domesticTotal !== null || internationalTotal !== null) {
        await trx(`${S}.extraction_courses`)
          .where({ id: courseId })
          .update({
            domestic_fee_total: domesticTotal,
            domestic_currency: course.fees[0]?.currency ?? null,
            international_fee_total: internationalTotal,
            international_currency: course.fees[0]?.currency ?? null,
            updated_at: trx.fn.now(),
          });
      }

      for (const intake of course.intakes) {
        const [intakeRow] = await trx(`${S}.extraction_intakes`)
          .insert({
            job_id: jobId,
            course_id: courseId,
            intake_name: intake.intake_name ?? null,
            start_date: intake.start_date ?? null,
            end_date: intake.end_date ?? null,
            admission_deadline: intake.admission_deadline ?? null,
            orientation_date: intake.orientation_date ?? null,
            intake_month: intake.intake_month ?? null,
            intake_year: intake.intake_year ?? null,
          })
          .returning(["id"]);
        await trx(`${S}.extraction_course_intake_assignments`).insert({
          job_id: jobId,
          course_id: courseId,
          intake_id: String((intakeRow as { id: string }).id),
        });
        summary.intakes += 1;
      }

      for (const elig of course.eligibility) {
        const [reqRow] = await trx(`${S}.extraction_eligibility_requirements`)
          .insert({
            job_id: jobId,
            name: elig.name ?? null,
            applicable_to: studentType(elig.applicable_to),
            min_degree_level: elig.min_degree_level ?? null,
            min_score_percent: elig.min_score_percent ?? null,
            min_score_grade: elig.min_score_grade ?? null,
            description: elig.description ?? null,
            language_tests: JSON.stringify(elig.language_tests),
            academic_tests: JSON.stringify(elig.academic_tests),
          })
          .returning(["id"]);
        await trx(`${S}.extraction_course_eligibility_assignments`).insert({
          job_id: jobId,
          course_id: courseId,
          eligibility_requirement_id: String((reqRow as { id: string }).id),
        });
        summary.eligibility += 1;
      }

      for (const acc of course.accreditations) {
        // Case-insensitive find-or-create by name, matching extraction-step.worker.ts.
        // extraction_accreditations is shared reference data, so it is NOT cleared
        // between posts — only the assignment rows are, and those cascade with the
        // course.
        const found = await trx(`${S}.extraction_accreditations`)
          .select("id")
          .whereRaw("LOWER(name) = LOWER(?)", [acc.name])
          .first<{ id: string } | undefined>();

        let accreditationId: string;
        if (found) {
          accreditationId = found.id;
          await trx(`${S}.extraction_accreditations`).where({ id: accreditationId }).update({
            issuing_organization: acc.issuing_organization ?? null,
            website: acc.website ?? null,
            updated_at: trx.fn.now(),
          });
        } else {
          const [row] = await trx(`${S}.extraction_accreditations`)
            .insert({
              name: acc.name,
              issuing_organization: acc.issuing_organization ?? null,
              website: acc.website ?? null,
            })
            .returning(["id"]);
          accreditationId = String((row as { id: string }).id);
        }

        await trx(`${S}.extraction_course_accreditation_assignments`).insert({
          job_id: jobId,
          course_id: courseId,
          extraction_accreditation_id: accreditationId,
        });
        summary.accreditations += 1;
      }

      // Link every campus the payload named to every course, which is the only
      // relationship the payload actually carries.
      for (const [name, campusId] of campusIdByName) {
        await trx(`${S}.extraction_course_campuses`).insert({
          job_id: jobId,
          course_id: courseId,
          campus_id: campusId,
          campus_name: name,
        });
      }
    }

    return summary;
  });
}
