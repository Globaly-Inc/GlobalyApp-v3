// Per-product DB writes for AgentCIS staging (course + campus links + fees + intakes +
// study options + eligibility) — split out of agentcis-staging.ts to stay under this
// module's 300-line-per-file convention. Pairs with the pure mapping functions in
// agentcis-product-mappers.ts.

import { masterKnex } from "../../../../core/db/master-pool.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import { coerceLabel } from "./agentcis-mappers.js";
import {
  extractIntakes, extractStudyOptions, extractEligibility,
  extractCourseTaxonomy, extractEnglishTestScores, extractCourseDuration,
} from "./agentcis-product-mappers.js";
import {
  normaliseCurrency, upsertEligibility, upsertEnglishRequirement, upsertFee, upsertIntake,
  resolveCourseLookups, durationToWeeks, upsertStudyOption,
} from "./staging-writer.js";

export interface StagingCounters {
  branches_extracted: number;
  skipped_branches: number;
  courses_extracted: number;
  skipped_products: number;
  intakes_extracted: number;
  fees_extracted: number;
}

export function newStagingCounters(): StagingCounters {
  return {
    branches_extracted: 0, skipped_branches: 0,
    courses_extracted: 0, skipped_products: 0,
    intakes_extracted: 0, fees_extracted: 0,
  };
}

export async function stageProduct(
  jobId: string,
  p: Record<string, unknown>,
  cName: string,
  institutionName: string,
  website: string,
  campusMap: Record<string, string>,
  campusIds: string[],
  counters: StagingCounters,
): Promise<void> {
  const sourceUrl = (p.url as string) || (p.product_url as string) || website;

  const taxonomy = extractCourseTaxonomy(p);
  const link = await resolveCourseLookups({
    name: cName,
    degree_level: taxonomy.degreeLevelName,
    subject_area: taxonomy.subjectName,
    area_of_study: taxonomy.areaName,
  });

  const duration = extractCourseDuration(p);
  const durationWeeks = durationToWeeks(duration.value, duration.unit);

  const [course] = await masterKnex(`${S}.extraction_courses`)
    .insert({
      job_id: jobId,
      name: cName,
      short_name: (p.short_name as string) || null,
      degree_level: link.degree_level,
      degree_level_code: link.degree_level_code,
      subject_area: taxonomy.subjectName,
      subject_area_code: link.subject_area_code,
      description: (p.description as string) || null,
      awarding_institution: (p.awarding_institution as string) || institutionName,
      duration_weeks: durationWeeks,
      source_url: sourceUrl,
      verification_status: "pending",
    })
    .returning("id");

  const courseId = course.id as string;

  // Course → campus links
  const productCampusIds: string[] = [];
  const pCampuses = (p.branches || p.campuses || []) as unknown[];
  for (const pc of pCampuses) {
    let key: string | null = null;
    if (typeof pc === "number" || typeof pc === "string") key = String(pc);
    else if (pc && typeof pc === "object") {
      const o = pc as Record<string, unknown>;
      if (o.id != null) key = String(o.id);
      else {
        const n = coerceLabel(o.name);
        if (n) key = n.toLowerCase();
      }
    }
    if (key && campusMap[key]) productCampusIds.push(campusMap[key]);
  }
  const linkIds = productCampusIds.length ? productCampusIds : campusIds;
  for (const cid of linkIds) {
    await masterKnex(`${S}.extraction_course_campuses`)
      .insert({ job_id: jobId, course_id: courseId, campus_id: cid })
      .onConflict().ignore();
  }

  // Fees — through the same upsert the extraction pipeline uses, so one identical fee across two
  // products is ONE row with two assignment rows, not two copies (CLAUDE.md (h): shared write
  // behaviour lives in staging-writer, never reimplemented per writer).

  const feeGroup = p.fees as Record<string, unknown> | undefined;
  const feeItems = (feeGroup?.fee_items ?? []) as unknown[];
  const periodType = coerceLabel((feeGroup?.feeTerms as Record<string, unknown> | undefined)?.name) || "Total";
  for (const fi of feeItems) {
    if (!fi || typeof fi !== "object") continue;
    const item = fi as Record<string, unknown>;
    const amount = Number(item.amount ?? 0) || 0;
    const instalments = Number(item.instalment ?? 1) || 1;
    const total = Math.round(amount * instalments);
    if (!total) continue;

    const feeId = await upsertFee(jobId, {
      name: coerceLabel((item.fee_type as Record<string, unknown> | undefined)?.name) || "Tuition Fee",
      student_type: "international",
      period_type: periodType,
      // AgentCIS states no currency on the fee itself; the feed is AUD-denominated, and the
      // resolved code is part of upsertFee's dedup key, so it is settled before the call.
      currency: (await normaliseCurrency(coerceLabel(feeGroup?.currency ?? p.currency), jobId)) ?? "AUD",
      total_amount: total,
    });

    await masterKnex(`${S}.extraction_course_fee_assignments`)
      .insert({ job_id: jobId, course_id: courseId, course_fee_id: feeId })
      .onConflict(["course_id", "course_fee_id"]).ignore();
    counters.fees_extracted++;
  }

  // Intakes — one "Semester 1 2027" row per JOB, linked to every product offering it, via the
  // same upsertIntake the workers use (CLAUDE.md (g)). The legacy `course_id` column that this
  // used to set is left NULL: a shared intake cannot name one course, and every public read goes
  // through the assignment junction.
  for (const ik of extractIntakes(p)) {
    const intakeId = await upsertIntake(jobId, ik, sourceUrl);
    await masterKnex(`${S}.extraction_course_intake_assignments`)
      .insert({ job_id: jobId, course_id: courseId, intake_id: intakeId })
      .onConflict(["course_id", "intake_id"]).ignore();
    counters.intakes_extracted++;
  }

  // Study options — mode + duration
  const studyOptions = extractStudyOptions(p);
  for (const opt of studyOptions) {
    const optionId = await upsertStudyOption(jobId, opt);
    await masterKnex(`${S}.extraction_course_study_option_assignments`)
      .insert({ job_id: jobId, course_id: courseId, study_option_id: optionId })
      .onConflict(["course_id", "study_option_id"]).ignore();
  }

  // Eligibility — shared per job like the workers' path. Every product here gets the same generic
  // "Entry Requirements" name, so the non-contradiction check in upsertEligibility is what keeps
  // products demanding DIFFERENT thresholds on separate rows rather than the name alone.
  const elig = extractEligibility(p);
  if (elig) {
    const isPercentage = elig.score_type === "percentage";
    const eligForMatch = {
      name: "Entry Requirements",
      applicable_to: "international",
      min_degree_level: elig.min_degree_level,
      min_score_percent: isPercentage ? elig.score_value : null,
      min_score: isPercentage ? null : elig.score_value,
      score_type: elig.score_type,
      academic_tests: elig.academic_tests,
    };
    const fields = {
      ...eligForMatch,
      academic_tests: JSON.stringify(elig.academic_tests),
      source_url: sourceUrl,
    };
    const eligId = await upsertEligibility(jobId, eligForMatch, fields);
    await masterKnex(`${S}.extraction_course_eligibility_assignments`)
      .insert({
        job_id: jobId,
        course_id: courseId,
        eligibility_requirement_id: eligId,
      })
      .onConflict(["course_id", "eligibility_requirement_id"]).ignore();
  }
  for (const eng of extractEnglishTestScores(p.english_test_score)) {
    await upsertEnglishRequirement(jobId, courseId, eng, sourceUrl);
  }

  counters.courses_extracted++;
}
