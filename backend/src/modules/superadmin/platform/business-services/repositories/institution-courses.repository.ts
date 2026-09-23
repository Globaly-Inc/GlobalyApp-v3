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
  const row = await masterKnex("service_categories").whereNull("deleted_at").where({ id, is_active: true }).first("id", "slug");
  if (!row) throw new NotFoundError("Service category not found");
  return row as { id: number; slug: string };
}

// The Academic/Short Courses list-tab split reads extraction_courses.course_category (an enum,
// separate from service_category_id) — whichever category the user actually picked must be
// reflected there too, or a course filed under the "Short Courses" service_category still shows
// up under the Academic Courses tab (course_category left at its "academic" default). Only the
// real "courses" category counts as academic — every OTHER category (Short Courses, or any other
// non-course service category the editor offers) is a non-course offering, so it defaults to
// short_course rather than mislabeling it as an academic course.
function courseCategoryForSlug(slug: string): "academic" | "short_course" {
  return slug === "courses" ? "academic" : "short_course";
}

const STUDENT_TYPE_LABEL: Record<string, string> = { domestic: "Domestic", international: "International" };

// The list's "Price" is really the Fees tab (extraction_course_fees, junctioned via
// extraction_course_fee_assignments) — domestic_fee_total/international_fee_total are a legacy
// single-value column nothing writes to anymore now that fees are managed there, so a course
// added or edited through the Fees tab always showed a blank price without this. Sums the
// installments WITHIN each fee row (a fee's own total_amount already covers that), grouped by
// (student_type, currency) — a domestic fee and an international fee are different amounts for
// different audiences, so they're never added together into one number; only fees that are
// genuinely the same audience/currency (e.g. tuition + application fee, both domestic AUD) sum.
// A "both" fee (applies to every student) is folded INTO each specific audience's total below —
// it's not a third, separate amount nobody actually pays on its own once a domestic- or
// international-only fee also exists. Grouped by period_type too ("Per Year" vs "One Time" etc) —
// a one-time application fee and a per-year tuition fee are not the same kind of money, so they're
// never summed into one figure; each period gets its own labelled amount.
export async function getFeePricesForCourses(jobId: string, courseIds: string[]) {
  const map = new Map<string, string>();
  if (courseIds.length === 0) return map;
  const rows = await masterKnex(`${S}.extraction_course_fee_assignments as a`)
    .join(`${S}.extraction_course_fees as f`, "f.id", "a.course_fee_id")
    .where("a.job_id", jobId)
    .whereIn("a.course_id", courseIds)
    .whereNotNull("f.total_amount")
    .select("a.course_id", "f.total_amount", "f.currency", "f.student_type", "f.period_type")
    // Deterministic row order — the totals below are built by iterating these rows in order, so
    // an unordered result set could silently reshuffle which amount lands first in the label,
    // moving a course in the Fee-sorted list even though nothing about its fees changed.
    .orderBy(["f.period_type", "f.student_type", "f.currency"]);
  const totalsByCourse = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const period = r.period_type ?? "";
    const groupKey = `${period}|${r.student_type ?? "both"}|${r.currency ?? ""}`;
    const byGroup = totalsByCourse.get(r.course_id) ?? new Map<string, number>();
    byGroup.set(groupKey, (byGroup.get(groupKey) ?? 0) + Number(r.total_amount));
    totalsByCourse.set(r.course_id, byGroup);
  }
  for (const [courseId, byGroup] of totalsByCourse) {
    const periods = new Set([...byGroup.keys()].map((k) => k.split("|")[0]));
    const multiPeriod = periods.size > 1;
    const parts: string[] = [];
    for (const period of periods) {
      const inPeriod = new Map([...byGroup].filter(([k]) => k.startsWith(`${period}|`)));
      const audiences = new Set([...inPeriod.keys()].map((k) => k.split("|")[1]));
      const hasSpecificAudience = audiences.has("domestic") || audiences.has("international");
      const suffix = multiPeriod && period ? ` (${period})` : "";
      if (!hasSpecificAudience) {
        // Only "both" fees (or only one currency/audience) — nothing to fold in, show as-is.
        for (const [groupKey, total] of inPeriod) {
          parts.push(`${groupKey.split("|")[2]} ${total.toLocaleString()}${suffix}`.trim());
        }
        continue;
      }
      const currencies = new Set([...inPeriod.keys()].map((k) => k.split("|")[2]));
      for (const currency of currencies) {
        const both = inPeriod.get(`${period}|both|${currency}`) ?? 0;
        for (const audience of ["domestic", "international"] as const) {
          const specific = inPeriod.get(`${period}|${audience}|${currency}`);
          if (specific == null && both === 0) continue;
          const total = (specific ?? 0) + both;
          parts.push(`${STUDENT_TYPE_LABEL[audience]}: ${currency} ${total.toLocaleString()}${suffix}`.trim());
        }
      }
    }
    map.set(courseId, parts.join(" · "));
  }
  return map;
}

async function courseToService(c: {
  id: string; name: string; description: string | null; subject_area: string | null;
  domestic_fee_total: string | null; international_fee_total: string | null; created_at: string;
  service_category_id?: number | null; public_visibility?: Record<string, boolean> | null;
  is_published?: boolean;
}, feePrice?: string) {
  return {
    id: c.id,
    service_category_id: c.service_category_id ?? (await coursesCategoryId()),
    name: c.name,
    description: c.description,
    price: feePrice ?? c.international_fee_total ?? c.domestic_fee_total,
    // Real column now (migration 20260925_003) — draft until the owner publishes it.
    is_published: c.is_published ?? false,
    public_visibility: c.public_visibility ?? {},
    created_at: c.created_at,
    category_name: c.subject_area,
  };
}

export async function listServices(_institutionId: number, jobId: string) {
  const rows = await coursesRepo.listCoursesByJob(jobId, 10000, 0, {}, "newest");
  const prices = await getFeePricesForCourses(jobId, rows.map((r) => r.id));
  return Promise.all(rows.map((r) => courseToService(r, prices.get(r.id))));
}

export async function searchServices(_institutionId: number, jobId: string, limit: number, offset: number, search?: string) {
  const [rows, total] = await Promise.all([
    coursesRepo.listCoursesByJob(jobId, limit, offset, { search }, "recently_updated"),
    coursesRepo.countCoursesByJob(jobId, { search }),
  ]);
  const prices = await getFeePricesForCourses(jobId, rows.map((r) => r.id));
  return { rows: await Promise.all(rows.map((r) => courseToService(r, prices.get(r.id)))), total };
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
  const prices = await getFeePricesForCourses(jobId, [serviceId]);
  return courseToService(course, prices.get(serviceId));
}

export async function createService(_institutionId: number, jobId: string, data: Record<string, unknown>, adminId?: number) {
  const { price, ...rest } = data;
  const category = typeof rest.service_category_id === "number" ? await requireActiveCategory(rest.service_category_id) : null;
  const row = await coursesRepo.insertCourse({
    // Falls back to "academic" only when no category was picked at all (shouldn't happen —
    // service_category_id is required on create — but keeps a NULL row from being invisible
    // under both list tabs rather than one).
    course_category: category ? courseCategoryForSlug(category.slug) : "academic",
    ...rest,
    job_id: jobId,
    // A new course has no pre-existing domestic/international split to preserve, so the one
    // "Price" field sets both — the public course page reads them as two separate prices, and
    // leaving domestic null left a brand-new course showing no price at all for domestic students.
    domestic_fee_total: price ?? null,
    international_fee_total: price ?? null,
    // Draft by default — matches a plain business's own services, which never auto-published
    // either. The owner publishes explicitly once the listing is actually ready.
    is_published: false,
    created_by_platform_user_id: adminId ?? null,
  });
  return getService(_institutionId, jobId, row.id);
}

export async function updateService(institutionId: number, jobId: string, serviceId: string, data: Record<string, unknown>, adminId: number) {
  const course = await requireCourse(jobId, serviceId);
  // service_category_id is a real column now (migration 20260921_004) — every institution service
  // category lives in this same table, so changing it is a plain column update, not a cross-table
  // move. is_published and public_visibility are also real columns now (migrations 20260925_002/003).
  const { price, is_published, public_visibility, ...rest } = data;
  const category = typeof rest.service_category_id === "number" ? await requireActiveCategory(rest.service_category_id) : null;
  // The single "Price" control only ever edits whichever column courseToService actually
  // displayed (international, falling back to domestic) — never the other one. Writing both
  // would silently collapse a course that legitimately has different domestic/international
  // fees (e.g. from extraction data) down to one shared amount the moment either is touched.
  const priceColumn = course.international_fee_total != null ? "international_fee_total" : "domestic_fee_total";
  const patch = {
    ...rest,
    ...("price" in data ? { [priceColumn]: price ?? null } : {}),
    // Keep course_category in lockstep whenever the category actually changes — see
    // courseCategoryForSlug's comment for why the list-tab split depends on this.
    ...(category ? { course_category: courseCategoryForSlug(category.slug) } : {}),
    ...(is_published !== undefined ? { is_published } : {}),
    ...(public_visibility !== undefined ? { public_visibility: JSON.stringify(public_visibility) } : {}),
  };
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
