// Institution "services" repository — most institution services are courses, and courses already
// have a home: the extraction_courses family in the superadmin schema (job-scoped by the
// institution's own source_job_id). Institutions can also offer non-course services (e.g. Short
// Courses) — extraction_courses.service_category_id (migration 20260921_004) records the pick;
// rows outside the "courses" category simply leave every course-only column (degree_level,
// duration_weeks, fees/intakes/eligibility/etc.) unused. No institution-only tenant tables exist
// for this feature — see business-services.service.ts's "Institution twins" section.
//
// Shaped to mirror business-services.repository.ts's exports (get/list/search/create/update/delete
// + fees/intakes/eligibility/study-options/study-units/accreditations) so the service layer above
// can stay call-compatible, but every row here lives in superadmin.extraction_* instead of a
// per-tenant schema.

import { masterKnex } from "../../../../../core/db/master-pool.js";
import { NotFoundError } from "../../../../../shared/errors.js";
import { SUPERADMIN_SCHEMA as S } from "../../../consts.js";
import * as coursesRepo from "../../../data-extraction/repositories/courses.repository.js";

const COURSES = `${S}.extraction_courses`;

// Fallback for rows written before service_category_id existed (migration 20260921_004
// backfilled them, but a defensive default keeps a null row from showing as uncategorized).
// Cached: the id never changes within a process, and this is read on every list/get.
let coursesCategoryIdCache: number | null | undefined;
async function coursesCategoryId(): Promise<number | null> {
  if (coursesCategoryIdCache === undefined) {
    const row = await masterKnex("service_categories").whereNull("deleted_at").where({ slug: "courses" }).first("id");
    coursesCategoryIdCache = row?.id ?? null;
  }
  return coursesCategoryIdCache ?? null;
}

// service_category_id has no FK (extraction_courses is superadmin-schema, service_categories is
// globalyapp-schema — cross-schema FKs aren't used elsewhere in this codebase either), and the
// zod schema only checks "positive integer". Without this, an arbitrary/inactive id saves
// successfully, leaving the row pointing at a category the frontend can never resolve schema_fields
// or an icon/name for.
async function requireActiveCategory(id: number) {
  const row = await masterKnex("service_categories").whereNull("deleted_at").where({ id, is_active: true }).first("id");
  if (!row) throw new NotFoundError("Service category not found");
}

async function courseToService(c: {
  id: string; name: string; description: string | null; subject_area: string | null;
  domestic_fee_total: string | null; international_fee_total: string | null; created_at: string;
  service_category_id?: number | null;
}) {
  return {
    id: c.id,
    service_category_id: c.service_category_id ?? (await coursesCategoryId()),
    name: c.name,
    description: c.description,
    price: c.international_fee_total ?? c.domestic_fee_total,
    // extraction_courses has no publish/visibility flags — every course an institution can see
    // via this admin is already live. ponytail: fixed true/{} until per-course visibility is asked for.
    is_published: true,
    public_visibility: {} as Record<string, boolean>,
    created_at: c.created_at,
    category_name: c.subject_area,
  };
}

export async function listServices(_institutionId: number, jobId: string) {
  const rows = await coursesRepo.listCoursesByJob(jobId, 10000, 0, {}, "newest");
  return Promise.all(rows.map(courseToService));
}

export async function searchServices(_institutionId: number, jobId: string, limit: number, offset: number, search?: string) {
  const [rows, total] = await Promise.all([
    coursesRepo.listCoursesByJob(jobId, limit, offset, { search }, "recently_updated"),
    coursesRepo.countCoursesByJob(jobId, { search }),
  ]);
  return { rows: await Promise.all(rows.map(courseToService)), total };
}

// getServiceListExtras (degree_level/area_of_study/duration "table" columns) — extraction_courses
// already carries degree_level and duration_weeks directly on the row, no join needed.
export async function getServiceListExtras(_institutionId: number, jobId: string, serviceIds: string[]) {
  if (serviceIds.length === 0) return { fieldValues: [], durations: [] };
  const rows = await masterKnex(COURSES)
    .whereIn("id", serviceIds)
    .select("id", "degree_level", "subject_area", "duration_weeks");
  return {
    fieldValues: rows.flatMap((r) => [
      ...(r.degree_level ? [{ service_id: r.id, key: "degree_level", value: r.degree_level }] : []),
      ...(r.subject_area ? [{ service_id: r.id, key: "area_of_study", value: r.subject_area }] : []),
    ]),
    durations: rows.filter((r) => r.duration_weeks != null).map((r) => ({
      service_id: r.id, duration_value: r.duration_weeks, duration_unit: "weeks",
    })),
  };
}

async function requireCourse(jobId: string, serviceId: string) {
  const course = await coursesRepo.findCourseById(serviceId);
  if (!course || course.job_id !== jobId) throw new NotFoundError("Service not found");
  return course;
}

export async function getService(_institutionId: number, jobId: string, serviceId: string) {
  const course = await coursesRepo.findCourseById(serviceId);
  if (!course || course.job_id !== jobId) return undefined;
  return courseToService(course);
}

export async function createService(_institutionId: number, jobId: string, data: Record<string, unknown>, adminId?: number) {
  const { price, ...rest } = data;
  if (typeof rest.service_category_id === "number") await requireActiveCategory(rest.service_category_id);
  const row = await coursesRepo.insertCourse({
    ...rest,
    job_id: jobId,
    international_fee_total: price ?? null,
    created_by_platform_user_id: adminId ?? null,
  });
  return getService(_institutionId, jobId, row.id);
}

export async function updateService(institutionId: number, jobId: string, serviceId: string, data: Record<string, unknown>, adminId: number) {
  await requireCourse(jobId, serviceId);
  // service_category_id is a real column now (migration 20260921_004) — every institution service
  // category lives in this same table, so changing it is a plain column update, not a cross-table
  // move. is_published/public_visibility still have no backing column (see courseToService).
  const { price, is_published: _p, public_visibility: _v, ...rest } = data;
  if (typeof rest.service_category_id === "number") await requireActiveCategory(rest.service_category_id);
  const patch = "price" in data ? { ...rest, international_fee_total: price ?? null } : rest;
  await coursesRepo.updateCourse(serviceId, patch, adminId);
  return getService(institutionId, jobId, serviceId);
}

export async function deleteService(_institutionId: number, jobId: string, serviceId: string) {
  await requireCourse(jobId, serviceId);
  return coursesRepo.deleteCourse(serviceId);
}

// ─── Field values (degree_level / area_of_study) ────────────────────────────
// business_services uses a dynamic schema_field_values table storing the catalog id directly;
// extraction_courses has these as plain display-text columns instead (like a scraped course's
// subject_area, which is already free text such as "Business"), so the id the frontend's Combobox
// sends has to be resolved to its catalog name before it's stored here — otherwise the raw id
// ends up on screen everywhere this text is shown (services list, category_name, course summary).
// getServiceFieldValues reverses the lookup (name -> id) so the edit form's Combobox — which
// matches options by id, not name — still preselects correctly.

const LOOKUP_TABLE = { degree_level: "degree_levels", area_of_study: "areas_of_study" } as const;

async function lookupName(table: "degree_levels" | "areas_of_study", id: number): Promise<string | null> {
  const row = await masterKnex(table).where({ id }).whereNull("deleted_at").first("name");
  return row?.name ?? null;
}

async function lookupId(table: "degree_levels" | "areas_of_study", name: string): Promise<number | null> {
  const row = await masterKnex(table).where({ name }).whereNull("deleted_at").first("id");
  return row?.id ?? null;
}

export async function getServiceFieldValues(_institutionId: number, jobId: string, serviceId: string) {
  const course = await requireCourse(jobId, serviceId);
  const [degreeLevelId, areaOfStudyId] = await Promise.all([
    course.degree_level ? lookupId("degree_levels", course.degree_level) : null,
    course.subject_area ? lookupId("areas_of_study", course.subject_area) : null,
  ]);
  return [
    ...(degreeLevelId != null ? [{ key: "degree_level" as const, value: degreeLevelId }] : []),
    ...(areaOfStudyId != null ? [{ key: "area_of_study" as const, value: areaOfStudyId }] : []),
  ];
}

export async function upsertServiceFieldValues(
  _institutionId: number,
  jobId: string,
  serviceId: string,
  values: { key: "degree_level" | "area_of_study"; value: unknown }[],
) {
  await requireCourse(jobId, serviceId);
  const patch: Record<string, unknown> = {};
  for (const { key, value } of values) {
    const column = key === "degree_level" ? "degree_level" : "subject_area";
    if (value == null || value === "") {
      patch[column] = null;
      continue;
    }
    const id = Number(value);
    patch[column] = Number.isFinite(id) ? await lookupName(LOOKUP_TABLE[key], id) : String(value);
  }
  if (Object.keys(patch).length > 0) await masterKnex(COURSES).where({ id: serviceId }).update(patch);
  return getServiceFieldValues(_institutionId, jobId, serviceId);
}

// ─── Shared junction helper ──────────────────────────────────────────────────
// Fees, eligibility requirements, study options and study units are job-scoped, reusable rows
// that can be linked to MULTIPLE courses through an `extraction_course_*_assignments` junction
// table (see data-extraction/CLAUDE.md — intakes/fees/eligibility are shared, upserted rows, not
// course-private). The institution editor's create/update/delete route through the junction, but
// must not assume the row it's touching belongs only to the course in the URL: `courseId` always
// gets checked against `jobId` before writing, and update/remove detach-and-fork off a shared row
// instead of mutating or deleting it out from under another course.

function jsonStringified<T extends Record<string, unknown>>(data: T, jsonFields: string[]) {
  const out: Record<string, unknown> = { ...data };
  for (const f of jsonFields) if (f in out) out[f] = JSON.stringify(out[f]);
  return out;
}

function junctionedResource(mainTable: string, assignTable: string, assignFk: string, jsonFields: string[] = []) {
  const T_MAIN = `${S}.${mainTable}`;
  const T_ASSIGN = `${S}.${assignTable}`;
  return {
    async list(_institutionId: number, jobId: string, courseId: string) {
      return masterKnex(T_ASSIGN)
        .join(T_MAIN, `${T_ASSIGN}.${assignFk}`, `${T_MAIN}.id`)
        .where({ [`${T_ASSIGN}.job_id`]: jobId, [`${T_ASSIGN}.course_id`]: courseId })
        .select(`${T_MAIN}.*`)
        .orderBy(`${T_MAIN}.created_at`, "asc");
    },
    async create(_institutionId: number, jobId: string, courseId: string, data: Record<string, unknown>) {
      await requireCourse(jobId, courseId);
      const [row] = await masterKnex(T_MAIN).insert({ ...jsonStringified(data, jsonFields), job_id: jobId }).returning("*");
      await masterKnex(T_ASSIGN).insert({ job_id: jobId, course_id: courseId, [assignFk]: row.id });
      return row;
    },
    async update(_institutionId: number, jobId: string, courseId: string, rowId: string, data: Record<string, unknown>) {
      const patched = { ...jsonStringified(data, jsonFields), updated_at: masterKnex.fn.now() };
      return masterKnex.transaction(async (trx) => {
        // Lock every assignment row for this shared resource so a concurrent update can't fork
        // twice (or fork while another request is still deciding "shared or not") for the same rowId.
        const links = await trx(T_ASSIGN).where({ job_id: jobId, [assignFk]: rowId }).forUpdate();
        const owned = links.find((l) => l.course_id === courseId);
        if (!owned) throw new NotFoundError("Not found");
        const otherLinks = links.some((l) => l.course_id !== courseId);
        if (!otherLinks) {
          const [row] = await trx(T_MAIN).where({ id: rowId }).update(patched).returning("*");
          if (!row) throw new NotFoundError("Not found");
          return row;
        }
        // Shared with another course — fork a private copy instead of editing everyone's row.
        const original = await trx(T_MAIN).where({ id: rowId }).first();
        const { id: _id, created_at: _c, updated_at: _u, ...base } = original;
        const [forked] = await trx(T_MAIN).insert({ ...base, ...patched }).returning("*");
        await trx(T_ASSIGN).where({ job_id: jobId, course_id: courseId, [assignFk]: rowId }).update({ [assignFk]: forked.id });
        return forked;
      });
    },
    async remove(_institutionId: number, jobId: string, courseId: string, rowId: string) {
      const deleted = await masterKnex(T_ASSIGN).where({ job_id: jobId, course_id: courseId, [assignFk]: rowId }).delete();
      if (!deleted) throw new NotFoundError("Not found");
      const stillLinked = await masterKnex(T_ASSIGN).where({ [assignFk]: rowId }).first();
      if (!stillLinked) await masterKnex(T_MAIN).where({ id: rowId }).delete();
    },
  };
}

const feesResource = junctionedResource("extraction_course_fees", "extraction_course_fee_assignments", "course_fee_id", ["installments"]);
const eligibilityResource = junctionedResource(
  "extraction_eligibility_requirements", "extraction_course_eligibility_assignments", "eligibility_requirement_id",
  ["academic_tests", "language_tests"],
);
const studyOptionsResource = junctionedResource("extraction_study_options", "extraction_course_study_option_assignments", "study_option_id");
const studyUnitsResource = junctionedResource("extraction_study_units", "extraction_course_study_unit_assignments", "study_unit_id");
// extraction_intakes also carries a direct (nullable) course_id, but the public course page
// deliberately reads intakes ONLY through this junction — a re-extraction can leave stale rows
// still pointing at the course via that direct column (see search/repositories/courses.repository.ts's
// COURSE_INTAKES comment) — so writing only the direct column, as this used to, left admin-added
// intakes invisible on the public page. Junction-backed like every other course sub-resource fixes it.
const intakesResource = junctionedResource("extraction_intakes", "extraction_course_intake_assignments", "intake_id");

export const listServiceFees = feesResource.list;
export const createServiceFee = feesResource.create;
export const updateServiceFee = feesResource.update;
export const deleteServiceFee = feesResource.remove;

export const listServiceEligibility = eligibilityResource.list;
export const createServiceEligibility = eligibilityResource.create;
export const updateServiceEligibility = eligibilityResource.update;
export const deleteServiceEligibility = eligibilityResource.remove;

export const listServiceStudyOptions = studyOptionsResource.list;
export const createServiceStudyOption = studyOptionsResource.create;
export const updateServiceStudyOption = studyOptionsResource.update;
export const deleteServiceStudyOption = studyOptionsResource.remove;

export const listServiceStudyUnits = studyUnitsResource.list;
export const createServiceStudyUnit = studyUnitsResource.create;
export const updateServiceStudyUnit = studyUnitsResource.update;
export const deleteServiceStudyUnit = studyUnitsResource.remove;

// ─── Intakes ─────────────────────────────────────────────────────────────────

export const listServiceIntakes = intakesResource.list;
export const createServiceIntake = intakesResource.create;
export const updateServiceIntake = intakesResource.update;
export const deleteServiceIntake = intakesResource.remove;

// ─── Accreditations ──────────────────────────────────────────────────────────
// Links through to the global `public.accreditations` catalog via
// extraction_course_accreditation_assignments.accreditation_id — the same integer ids the
// business twin's service_accreditations.accreditation_id uses. (The junction also has an
// extraction_accreditation_id uuid column for the scraper's own job-scoped accreditation catalog
// — unrelated, and not used by this admin-authored path.)

const ACCRED_ASSIGN = `${S}.extraction_course_accreditation_assignments`;

export async function listServiceAccreditations(_institutionId: number, jobId: string, courseId: string) {
  return masterKnex(ACCRED_ASSIGN)
    .where({ job_id: jobId, course_id: courseId })
    .orderBy("created_at", "asc");
}

export async function createServiceAccreditation(_institutionId: number, jobId: string, courseId: string, accreditationId: number) {
  await requireCourse(jobId, courseId);
  const [row] = await masterKnex(ACCRED_ASSIGN)
    .insert({ job_id: jobId, course_id: courseId, accreditation_id: accreditationId })
    .returning("*");
  return row;
}

export async function deleteServiceAccreditation(_institutionId: number, jobId: string, courseId: string, rowId: string) {
  const deleted = await masterKnex(ACCRED_ASSIGN).where({ id: rowId, job_id: jobId, course_id: courseId }).delete();
  if (!deleted) throw new NotFoundError("Accreditation not found");
}

/** Course Details' "Awarded by" field is a single-pick view onto this same accreditation list,
 * distinguished from any other link by `is_awarded_by` (there's no separate column for it on
 * extraction_courses, unlike degree_level/subject_area). Setting it moves the flag rather than
 * adding another link, and clearing it removes the flag (not the underlying accreditation link,
 * which may still belong on the course's general accreditation list). */
export async function setAwardedBy(jobId: string, courseId: string, accreditationId: number | null) {
  await masterKnex.transaction(async (trx) => {
    // courseId is a uuid — hash it into the bigint key pg_advisory_xact_lock needs — and serialize
    // per course, not globally, so two courses' saves never block each other. A row lock alone
    // isn't enough here: the "clear old flag, then find-or-insert the new one" pair below can still
    // race with another save for the SAME course when there's no existing row yet to lock.
    await trx.raw("SELECT pg_advisory_xact_lock(hashtext(?))", [courseId]);
    await trx(ACCRED_ASSIGN).where({ job_id: jobId, course_id: courseId, is_awarded_by: true }).update({ is_awarded_by: false });
    if (accreditationId == null) return;
    const existing = await trx(ACCRED_ASSIGN).where({ job_id: jobId, course_id: courseId, accreditation_id: accreditationId }).first();
    if (existing) {
      await trx(ACCRED_ASSIGN).where({ id: existing.id }).update({ is_awarded_by: true });
    } else {
      await trx(ACCRED_ASSIGN).insert({ job_id: jobId, course_id: courseId, accreditation_id: accreditationId, is_awarded_by: true });
    }
  });
}

export async function getAwardedBy(jobId: string, courseId: string): Promise<number | null> {
  const row = await masterKnex(ACCRED_ASSIGN)
    .where({ job_id: jobId, course_id: courseId, is_awarded_by: true }).first("accreditation_id");
  return row?.accreditation_id ?? null;
}
