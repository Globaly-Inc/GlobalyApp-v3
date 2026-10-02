// The multi-tab template's other tabs (branches, agents, fees, intakes, scholarships, study units,
// study options, accreditations), staged after the course rows through the same staging-writer
// upserts the scraper uses, so a fee or intake shared by several courses is one row with several
// assignment rows (CLAUDE.md (g)/(h)). Rows link to courses by the Course Names cell.

import { masterKnex } from "../../../../core/db/master-pool.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import {
  upsertCampus, upsertAgent, upsertFee, upsertIntake, upsertScholarship, upsertStudyUnit,
  upsertStudyOption, normaliseStudyMode, normaliseStudyLoad, normaliseDurationUnit, coerceMoney,
} from "./staging-writer.js";
import { repeatInstallments } from "./installment-parser.js";
import { DEFAULT_CURRENCY } from "./spreadsheet-mappers.js";
import type { SpreadsheetExtras } from "../schemas/spreadsheet-import.schema.js";

const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export type ExtrasCounts = Record<keyof SpreadsheetExtras, number>;

/** Course Names cell → course ids; blank = every course. Unknown names are skipped (the wizard warns). */
function resolver(courses: { id: string; name: string }[]) {
  const byName = new Map(courses.map((c) => [key(c.name), c.id]));
  const all = courses.map((c) => c.id);
  return (cell: string | null) => {
    if (!cell) return all;
    return cell.split(";").map((n) => byName.get(key(n))).filter((id): id is string => !!id);
  };
}

async function assign(table: string, col: string, jobId: string, courseIds: string[], entityId: string) {
  if (!courseIds.length) return;
  await masterKnex(`${S}.${table}`)
    .insert(courseIds.map((course_id) => ({ job_id: jobId, course_id, [col]: entityId })))
    .onConflict(["course_id", col]).ignore();
}

/**
 * Campuses first — before any course — so stageProduct can link each course to the branches its
 * row names. Sources: the Branches tab (full details) and every course row's Branch Names
 * (a bare name creates a campus the Branches tab can still enrich). Returns lowercased name → id.
 */
export async function stageBranches(jobId: string, branches: SpreadsheetExtras["branches"], namedByRows: string[]) {
  const map: Record<string, string> = {};
  for (const { courses: _, ...b } of branches) {
    if (!b.name) continue;
    const id = await upsertCampus(jobId, b);
    if (id) map[key(b.name)] = id;
  }
  for (const name of namedByRows) {
    if (map[key(name)]) continue;
    const id = await upsertCampus(jobId, { name });
    if (id) map[key(name)] = id;
  }
  return map;
}

/** Everything but branches (already staged by stageBranches, ahead of the courses). */
export async function stageSpreadsheetExtras(jobId: string, extras: SpreadsheetExtras): Promise<ExtrasCounts> {
  const courses = await masterKnex(`${S}.extraction_courses`).where({ job_id: jobId }).select("id", "name");
  const coursesFor = resolver(courses);
  const n = (Object.keys(extras) as (keyof SpreadsheetExtras)[]).reduce((o, k) => ({ ...o, [k]: 0 }), {} as ExtrasCounts);

  n.branches = extras.branches.filter((b) => b.name).length;

  for (const { courses: _, ...agent } of extras.agents) {
    if (!agent.name) continue;
    await upsertAgent(jobId, agent, `spreadsheet:${key(agent.name)}`);
    n.agents++;
  }

  for (const f of extras.fees) {
    const amount = coerceMoney(f.amount);
    if (!amount) continue;
    const period = f.period ?? "Total";
    const { total, installments } = repeatInstallments(amount, Number(f.installments) || 1, period);
    if (!total) continue;
    const feeId = await upsertFee(jobId, {
      name: f.name ?? "Tuition Fee",
      student_type: f.student_type ?? "both",
      period_type: period,
      currency: f.currency ?? DEFAULT_CURRENCY,
      // Amount is per period, as in the course-row layout; the fee row stores the total and one
      // installment per period at the stated rate — never a re-split of the total.
      total_amount: total,
      installments,
    });
    await assign("extraction_course_fee_assignments", "course_fee_id", jobId, coursesFor(f.courses), feeId);
    n.fees++;
  }

  for (const { courses: cell, ...i } of extras.intakes) {
    if (!i.intake_month && !i.start_date) continue;
    const intakeId = await upsertIntake(jobId, i, null);
    await assign("extraction_course_intake_assignments", "intake_id", jobId, coursesFor(cell), intakeId);
    n.intakes++;
  }

  for (const { courses: cell, ...s } of extras.scholarships) {
    const id = await upsertScholarship(jobId, s, null);
    if (!id) continue;
    await assign("extraction_course_scholarship_assignments", "scholarship_id", jobId, coursesFor(cell), id);
    n.scholarships++;
  }

  for (const { courses: cell, ...u } of extras.study_units) {
    if (!u.unit_name) continue;
    const id = await upsertStudyUnit(jobId, { ...u, unit_name: u.unit_name, credit_points: Number(u.credit_points) || null });
    await assign("extraction_course_study_unit_assignments", "study_unit_id", jobId, coursesFor(cell), id);
    n.study_units++;
  }

  for (const o of extras.study_options) {
    const mode = normaliseStudyMode(o.study_mode);
    const load = normaliseStudyLoad(o.study_load);
    if (!mode || !load) continue;
    const { id } = await upsertStudyOption(jobId, {
      study_mode: mode, study_load: load,
      duration_value: o.duration_value, duration_unit: normaliseDurationUnit(o.duration_unit),
    });
    await assign("extraction_course_study_option_assignments", "study_option_id", jobId, coursesFor(o.courses), id);
    n.study_options++;
  }

  // extraction_accreditations has no job_id — a row belongs to a job only through its course
  // assignments, so one with no linked course would be unreachable and is not written.
  for (const a of extras.accreditations) {
    const ids = coursesFor(a.courses);
    if (!a.name || !ids.length) continue;
    const existing = await masterKnex(`${S}.extraction_accreditations as ea`)
      .join(`${S}.extraction_course_accreditation_assignments as caa`, "caa.extraction_accreditation_id", "ea.id")
      .where("caa.job_id", jobId).whereRaw("lower(trim(ea.name)) = ?", [key(a.name)])
      .first("ea.id");
    const id = existing?.id ?? (await masterKnex(`${S}.extraction_accreditations`)
      .insert({ name: a.name, issuing_organization: a.issuing_organization, website: a.website, description: a.description })
      .returning("id"))[0].id;
    await assign("extraction_course_accreditation_assignments", "extraction_accreditation_id", jobId, ids, id);
    n.accreditations++;
  }

  return n;
}
