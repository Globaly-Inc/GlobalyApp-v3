// Per-product DB writes for AgentCIS staging (course + campus links + fees + intakes +
// study options + eligibility) — split out of agentcis-staging.ts to stay under this
// module's 300-line-per-file convention. Pairs with the pure mapping functions in
// agentcis-product-mappers.ts.

import { masterKnex } from "../../../../core/db/master-pool.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import { coerceLabel, mapDegreeLevel } from "./agentcis-mappers.js";
import { extractIntakes, extractStudyOptions, extractEligibility } from "./agentcis-product-mappers.js";

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
  const dLevel = mapDegreeLevel(p.degree_level || p.qualification_type);

  const [course] = await masterKnex(`${S}.extraction_courses`)
    .insert({
      job_id: jobId,
      name: cName,
      short_name: (p.short_name as string) || null,
      degree_level: dLevel,
      subject_area: (p.subject_area as string) || (p.field_of_study as string) || null,
      description: (p.description as string) || null,
      awarding_institution: (p.awarding_institution as string) || institutionName,
      source_url: (p.url as string) || (p.product_url as string) || website,
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

  // Fees — simplified: store each fee item as a course fee row
  const rawFees = (p.fees ?? p.fee_items ?? p.fee ?? []) as unknown[];
  const feeArr = Array.isArray(rawFees) ? rawFees : rawFees ? [rawFees] : [];
  for (const fg of feeArr) {
    if (!fg || typeof fg !== "object") continue;
    const feeObj = fg as Record<string, unknown>;
    const amount = Number(feeObj.amount ?? feeObj.fee_amount ?? feeObj.total ?? feeObj.value ?? 0);
    if (!amount) continue;

    const [feeRow] = await masterKnex(`${S}.extraction_course_fees`)
      .insert({
        job_id: jobId,
        name: coerceLabel(feeObj.name || feeObj.fee_type || feeObj.type) || "Tuition Fee",
        student_type: String(feeObj.student_type ?? feeObj.applicable_to ?? "international").toLowerCase(),
        period_type: coerceLabel(feeObj.period_type || feeObj.period) || "total",
        currency: String(feeObj.currency ?? (p.currency as string) ?? "AUD").toUpperCase(),
        total_amount: Math.round(amount),
      })
      .returning("id");

    await masterKnex(`${S}.extraction_course_fee_assignments`)
      .insert({ job_id: jobId, course_id: courseId, course_fee_id: feeRow.id })
      .onConflict(["course_id", "course_fee_id"]).ignore();
    counters.fees_extracted++;
  }

  // Intakes
  const rawIntakes = extractIntakes(p);
  for (const ik of rawIntakes) {
    const [intakeRow] = await masterKnex(`${S}.extraction_intakes`)
      .insert({
        job_id: jobId,
        course_id: courseId,
        intake_name: ik.intake_name,
        intake_month: ik.intake_month,
        intake_year: ik.intake_year,
        start_date: ik.start_date,
        end_date: ik.end_date,
        admission_deadline: ik.admission_deadline,
      })
      .returning("id");

    await masterKnex(`${S}.extraction_course_intake_assignments`)
      .insert({ job_id: jobId, course_id: courseId, intake_id: intakeRow.id })
      .onConflict(["course_id", "intake_id"]).ignore();
    counters.intakes_extracted++;
  }

  // Study options — mode + duration
  const studyOptions = extractStudyOptions(p);
  for (const opt of studyOptions) {
    const [soRow] = await masterKnex(`${S}.extraction_study_options`)
      .insert({
        job_id: jobId,
        study_mode: opt.study_mode,
        study_load: opt.study_load,
        duration_value: opt.duration_value,
        duration_unit: opt.duration_unit,
      })
      .returning("id");

    await masterKnex(`${S}.extraction_course_study_option_assignments`)
      .insert({ job_id: jobId, course_id: courseId, study_option_id: soRow.id })
      .onConflict(["course_id", "study_option_id"]).ignore();
  }

  // Eligibility
  const elig = extractEligibility(p);
  if (elig) {
    const [eligRow] = await masterKnex(`${S}.extraction_eligibility_requirements`)
      .insert({
        job_id: jobId,
        name: "Entry Requirements",
        applicable_to: "international",
        min_degree_level: elig.min_degree_level,
        min_score_percent: elig.min_score_percent,
        description: elig.description,
      })
      .returning("id");

    await masterKnex(`${S}.extraction_course_eligibility_assignments`)
      .insert({
        job_id: jobId,
        course_id: courseId,
        eligibility_requirement_id: eligRow.id,
      })
      .onConflict(["course_id", "eligibility_requirement_id"]).ignore();
  }

  counters.courses_extracted++;
}
