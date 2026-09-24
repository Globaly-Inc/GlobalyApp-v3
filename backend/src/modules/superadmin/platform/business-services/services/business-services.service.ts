// Business-services service — services offered by a single business, plus their
// dynamic per-category field values.

import { masterKnex } from "../../../../../core/db/master-pool.js";
import { provisionBusinessSchema } from "../../../../../core/business/provisioner.js";
import { generateText } from "../../../../../shared/ai/gemini.js";
import * as coursesRepo from "../../../data-extraction/repositories/courses.repository.js";
import * as jobsRepo from "../../../data-extraction/repositories/jobs.repository.js";
import * as promoteRepo from "../../../data-extraction/repositories/promote.repository.js";
import * as userRepo from "../../../../platform-users/repositories/platform-users.repository.js";
import { NotFoundError } from "../../../../../shared/errors.js";
import * as platformRepo from "../../platform.repository.js";
import * as repo from "../repositories/business-services.repository.js";
import * as instRepo from "../repositories/institution-courses.repository.js";
import type {
  ServiceAccreditationInput, ServiceAiAssistInput, ServiceEligibilityInput, ServiceEligibilityPatchInput,
  ServiceFeeInput, ServiceFeePatchInput, ServiceFieldValuesInput, ServiceInput,
  ServiceIntakeInput, ServiceIntakePatchInput, ServicePatchInput,
  ServiceStudyOptionInput, ServiceStudyOptionPatchInput, ServiceStudyUnitInput, ServiceStudyUnitPatchInput,
} from "../schemas/business-services.schema.js";

/** A course scraped by the source extraction job, shaped like a real (but uneditable) service. */
function courseAsService(c: {
  id: string; name: string; subject_area: string | null; description: string | null;
  domestic_fee_total: string | null; international_fee_total: string | null; created_at: string;
}) {
  return {
    id: c.id, service_category_id: null, category_name: c.subject_area, name: c.name,
    description: c.description, price: c.international_fee_total ?? c.domestic_fee_total,
    is_published: true, public_visibility: true, created_at: c.created_at,
    degree_level: null, area_of_study: null, duration: null,
  };
}

async function requireBusiness(id: number) {
  const biz = await platformRepo.findBusinessById(id);
  if (!biz) throw new NotFoundError("Business not found");
  return biz;
}

/** Looks up an extraction course by id and confirms it was actually scraped from THIS org's own
 * source job — findCourseById alone has no org scoping, so without this check any org's numeric
 * id could be paired with any other org's extraction course uuid and pass as "belongs to me". */
async function findOwnedCourse(org: { source_job_id: string | null }, serviceId: string) {
  if (!org.source_job_id) return null;
  const course = await coursesRepo.findCourseById(serviceId);
  if (!course || course.job_id !== org.source_job_id) return null;
  return course;
}

/** A business's service page may be a read-only extraction stand-in (see courseAsService) rather
 * than a real business_services row. Lazily provisions the tenant schema if needed (same as an
 * admin adding a brand-new service already does) and, the first time any write touches this
 * serviceId, materializes a real row under that SAME uuid from the matching extraction course —
 * so every fee/intake/eligibility/etc. write the frontend already queued against this id lands
 * on a row that now actually exists, with no special-casing needed anywhere else. */
async function ensureServiceExists(
  org: { id: number; schema_name: string; schema_provisioned_at: string | null; source_job_id: string | null },
  serviceId: string,
) {
  if (!org.schema_provisioned_at) await provisionBusinessSchema(org.schema_name);
  const existing = await repo.getService(org.id, org.schema_name, serviceId);
  if (existing) return;

  const course = await findOwnedCourse(org, serviceId);
  if (!course) throw new NotFoundError("Service not found");
  await repo.materializeService(org.id, org.schema_name, serviceId, {
    name: course.name,
    description: course.description ?? null,
    price: course.international_fee_total ?? course.domestic_fee_total ?? null,
    service_category_id: null,
    is_published: false,
  });
}

/** Institution services are always extraction_courses rows under the institution's own
 * source_job_id — no tenant schema, no materializing, no stand-in vs real distinction; a course
 * row IS the real row. */
const SELF_HEALED_JOB_URL_DOMAIN = "self-service.globalyhub.invalid";

/**
 * An institution's course catalog lives in extraction_* keyed on job_id — a real institution
 * with none (created before self-service/admin-create started minting one, e.g. via the v2
 * import seeder) can't add a single course otherwise. Mints and persists one on first use
 * instead of hard-failing, mirroring onboardInstitution's own mintSelfServiceJob.
 */
async function requireInstitutionJobId(inst: { id: number; institution_name: string; subdomain: string; source_job_id: string | null }) {
  if (inst.source_job_id) return inst.source_job_id;
  const row = await jobsRepo.insertJob({
    institution_name: inst.institution_name,
    institution_url: `https://${SELF_HEALED_JOB_URL_DOMAIN}/${inst.subdomain}`,
    source_type: "self_service",
    // "exported" (not "done") — see mintSelfServiceJob's matching comment: without it the
    // institution's own courses fail the public/preview visibility check and never show, on top
    // of keeping pipeline workers off it.
    status: "exported",
    business_category_id: await promoteRepo.findCategoryIdBySlug("institutions"),
  });
  const jobId = row.id as string;
  await userRepo.updateInstitution(inst.id, { source_job_id: jobId });
  return jobId;
}

/** Merges each row with its degree_level/area_of_study names and first study-option duration —
 * the extra "table" columns the service management list/search views show. */
async function withListExtras<T extends { id: string }>(businessId: number, schemaName: string, rows: T[]) {
  if (rows.length === 0) return rows as (T & { degree_level: string | null; area_of_study: string | null; duration: string | null })[];
  const ids = rows.map((r) => r.id);
  const { fieldValues, durations } = await repo.getServiceListExtras(businessId, schemaName, ids);

  const degreeLevelIds = fieldValues.filter((v) => v.key === "degree_level").map((v) => Number(v.value));
  const areaOfStudyIds = fieldValues.filter((v) => v.key === "area_of_study").map((v) => Number(v.value));
  const [degreeLevels, areasOfStudy] = await Promise.all([
    degreeLevelIds.length ? masterKnex("degree_levels").whereIn("id", degreeLevelIds).select("id", "name") : [],
    areaOfStudyIds.length ? masterKnex("areas_of_study").whereIn("id", areaOfStudyIds).select("id", "name") : [],
  ]);
  const degreeLevelNameById = new Map(degreeLevels.map((d) => [d.id, d.name]));
  const areaOfStudyNameById = new Map(areasOfStudy.map((a) => [a.id, a.name]));

  const degreeLevelByService = new Map(
    fieldValues.filter((v) => v.key === "degree_level").map((v) => [v.service_id, degreeLevelNameById.get(Number(v.value)) ?? null]),
  );
  const areaOfStudyByService = new Map(
    fieldValues.filter((v) => v.key === "area_of_study").map((v) => [v.service_id, areaOfStudyNameById.get(Number(v.value)) ?? null]),
  );
  const durationByService = new Map(
    durations.map((d) => [d.service_id, `${d.duration_value} ${d.duration_unit}`]),
  );

  return rows.map((r) => ({
    ...r,
    degree_level: degreeLevelByService.get(r.id) ?? null,
    area_of_study: areaOfStudyByService.get(r.id) ?? null,
    duration: durationByService.get(r.id) ?? null,
  }));
}

export async function listServices(businessId: number) {
  const biz = await requireBusiness(businessId);

  // Same fallback as searchServices: an unprovisioned business has no business_services rows of
  // its own — the extraction job's scraped courses are read-only stand-ins until then. Gated on
  // schema_provisioned_at (not account_status) so a claimed-but-unprovisioned business, or a
  // provisioned-but-unclaimed one with admin-added services, doesn't fall through the wrong side.
  if (!biz.schema_provisioned_at && biz.source_job_id) {
    const rows = await coursesRepo.listCoursesByJob(biz.source_job_id, 1000, 0, {});
    return rows.map(courseAsService);
  }

  const rows = await repo.listServices(businessId, biz.schema_name);
  return withListExtras(businessId, biz.schema_name, rows);
}

export async function searchServices(businessId: number, limit: number, offset: number, search?: string) {
  const biz = await requireBusiness(businessId);

  // See listServices above for why this is gated on schema_provisioned_at.
  if (!biz.schema_provisioned_at && biz.source_job_id) {
    const [rows, total] = await Promise.all([
      coursesRepo.listCoursesByJob(biz.source_job_id, limit, offset, { search }),
      coursesRepo.countCoursesByJob(biz.source_job_id, { search }),
    ]);
    return { rows: rows.map(courseAsService), total };
  }

  const { rows, total } = await repo.searchServices(businessId, biz.schema_name, limit, offset, search);
  return { rows: await withListExtras(businessId, biz.schema_name, rows), total };
}

export async function createService(businessId: number, data: ServiceInput) {
  const biz = await requireBusiness(businessId);
  return repo.createService(businessId, biz.schema_name, data);
}

export async function updateService(businessId: number, serviceId: string, data: ServicePatchInput) {
  const biz = await requireBusiness(businessId);
  await ensureServiceExists(biz, serviceId);
  return repo.updateService(businessId, biz.schema_name, serviceId, data);
}

export async function deleteService(businessId: number, serviceId: string) {
  const biz = await requireBusiness(businessId);
  return repo.deleteService(businessId, biz.schema_name, serviceId);
}

export async function getServiceFieldValues(businessId: number, serviceId: string) {
  const biz = await requireBusiness(businessId);
  return repo.getServiceFieldValues(businessId, biz.schema_name, serviceId);
}

/** Drops any submitted value whose schema_field doesn't belong to the service's CURRENT category —
 * without this, switching category then saving a stale in-memory values object (still carrying
 * the old category's field ids) would silently write hidden values that reappear if the category
 * is switched back. `null` skips the check for a service with no category assigned. */
async function valuesForCurrentCategory(
  categoryId: number | null,
  values: ServiceFieldValuesInput["values"],
) {
  if (!categoryId || values.length === 0) return [];
  const validIds = new Set(
    (await masterKnex("schema_fields").where({ entity_id: categoryId, entity_type: "service_categories" }).select("id"))
      .map((r: { id: number }) => r.id),
  );
  return values.filter((v) => validIds.has(v.schema_field_id));
}

export async function upsertServiceFieldValues(businessId: number, serviceId: string, values: ServiceFieldValuesInput["values"]) {
  const biz = await requireBusiness(businessId);
  await ensureServiceExists(biz, serviceId);
  const service = await repo.getService(businessId, biz.schema_name, serviceId);
  const scoped = await valuesForCurrentCategory(service?.service_category_id ?? null, values);
  return repo.upsertServiceFieldValues(businessId, biz.schema_name, serviceId, scoped);
}

/** Drafts service/course copy for the caller to review/edit, not to publish verbatim. Shared by
 * businesses and institutions alike — a service's name/category is the only real signal either
 * side ever has to work with, so one org-agnostic generator covers both. */
export async function generateServiceDescription(input: ServiceAiAssistInput) {
  const system =
    "You write concise, factual service/course descriptions for education agents, institutions, and " +
    "migration/service providers listed on a study-abroad platform. No emojis, no marketing fluff, " +
    "no unverifiable superlatives — 2 to 3 sentences a real prospective student would trust.";
  const prompt = [
    `Write a description for "${input.name}"`,
    input.category_name ? ` (category: ${input.category_name})` : "",
    input.hint ? `. Additional context: ${input.hint}` : ".",
  ].join("");

  const text = await generateText({ system, prompt, maxTokens: 300 });
  return { text };
}

// ─── Service fees ────────────────────────────────────────────────────────────

export async function listServiceFees(businessId: number, serviceId: string) {
  const biz = await requireBusiness(businessId);
  return repo.listServiceFees(businessId, biz.schema_name, serviceId);
}

export async function createServiceFee(businessId: number, serviceId: string, data: ServiceFeeInput) {
  const biz = await requireBusiness(businessId);
  await ensureServiceExists(biz, serviceId);
  return repo.createServiceFee(businessId, biz.schema_name, serviceId, data);
}

export async function updateServiceFee(businessId: number, serviceId: string, feeId: number, data: ServiceFeePatchInput) {
  const biz = await requireBusiness(businessId);
  return repo.updateServiceFee(businessId, biz.schema_name, serviceId, feeId, data);
}

export async function deleteServiceFee(businessId: number, serviceId: string, feeId: number) {
  const biz = await requireBusiness(businessId);
  return repo.deleteServiceFee(businessId, biz.schema_name, serviceId, feeId);
}

// ─── Service intakes ─────────────────────────────────────────────────────────

export async function listServiceIntakes(businessId: number, serviceId: string) {
  const biz = await requireBusiness(businessId);
  return repo.listServiceIntakes(businessId, biz.schema_name, serviceId);
}

export async function createServiceIntake(businessId: number, serviceId: string, data: ServiceIntakeInput) {
  const biz = await requireBusiness(businessId);
  await ensureServiceExists(biz, serviceId);
  return repo.createServiceIntake(businessId, biz.schema_name, serviceId, data);
}

export async function updateServiceIntake(businessId: number, serviceId: string, intakeId: number, data: ServiceIntakePatchInput) {
  const biz = await requireBusiness(businessId);
  return repo.updateServiceIntake(businessId, biz.schema_name, serviceId, intakeId, data);
}

export async function deleteServiceIntake(businessId: number, serviceId: string, intakeId: number) {
  const biz = await requireBusiness(businessId);
  return repo.deleteServiceIntake(businessId, biz.schema_name, serviceId, intakeId);
}

// ─── Service eligibility requirements ───────────────────────────────────────

export async function listServiceEligibility(businessId: number, serviceId: string) {
  const biz = await requireBusiness(businessId);
  return repo.listServiceEligibility(businessId, biz.schema_name, serviceId);
}

export async function createServiceEligibility(businessId: number, serviceId: string, data: ServiceEligibilityInput) {
  const biz = await requireBusiness(businessId);
  await ensureServiceExists(biz, serviceId);
  return repo.createServiceEligibility(businessId, biz.schema_name, serviceId, data);
}

export async function updateServiceEligibility(businessId: number, serviceId: string, eligibilityId: number, data: ServiceEligibilityPatchInput) {
  const biz = await requireBusiness(businessId);
  return repo.updateServiceEligibility(businessId, biz.schema_name, serviceId, eligibilityId, data);
}

export async function deleteServiceEligibility(businessId: number, serviceId: string, eligibilityId: number) {
  const biz = await requireBusiness(businessId);
  return repo.deleteServiceEligibility(businessId, biz.schema_name, serviceId, eligibilityId);
}

// ─── Service study options ──────────────────────────────────────────────────

export async function listServiceStudyOptions(businessId: number, serviceId: string) {
  const biz = await requireBusiness(businessId);
  return repo.listServiceStudyOptions(businessId, biz.schema_name, serviceId);
}

export async function createServiceStudyOption(businessId: number, serviceId: string, data: ServiceStudyOptionInput) {
  const biz = await requireBusiness(businessId);
  await ensureServiceExists(biz, serviceId);
  return repo.createServiceStudyOption(businessId, biz.schema_name, serviceId, data);
}

export async function updateServiceStudyOption(businessId: number, serviceId: string, optionId: number, data: ServiceStudyOptionPatchInput) {
  const biz = await requireBusiness(businessId);
  return repo.updateServiceStudyOption(businessId, biz.schema_name, serviceId, optionId, data);
}

export async function deleteServiceStudyOption(businessId: number, serviceId: string, optionId: number) {
  const biz = await requireBusiness(businessId);
  return repo.deleteServiceStudyOption(businessId, biz.schema_name, serviceId, optionId);
}

// ─── Service study units ────────────────────────────────────────────────────

export async function listServiceStudyUnits(businessId: number, serviceId: string) {
  const biz = await requireBusiness(businessId);
  return repo.listServiceStudyUnits(businessId, biz.schema_name, serviceId);
}

export async function createServiceStudyUnit(businessId: number, serviceId: string, data: ServiceStudyUnitInput) {
  const biz = await requireBusiness(businessId);
  await ensureServiceExists(biz, serviceId);
  return repo.createServiceStudyUnit(businessId, biz.schema_name, serviceId, data);
}

export async function updateServiceStudyUnit(businessId: number, serviceId: string, unitId: number, data: ServiceStudyUnitPatchInput) {
  const biz = await requireBusiness(businessId);
  return repo.updateServiceStudyUnit(businessId, biz.schema_name, serviceId, unitId, data);
}

export async function deleteServiceStudyUnit(businessId: number, serviceId: string, unitId: number) {
  const biz = await requireBusiness(businessId);
  return repo.deleteServiceStudyUnit(businessId, biz.schema_name, serviceId, unitId);
}

// ─── Service accreditations ─────────────────────────────────────────────────

export async function listServiceAccreditations(businessId: number, serviceId: string) {
  const biz = await requireBusiness(businessId);
  return repo.listServiceAccreditations(businessId, biz.schema_name, serviceId);
}

export async function createServiceAccreditation(businessId: number, serviceId: string, data: ServiceAccreditationInput) {
  const biz = await requireBusiness(businessId);
  await ensureServiceExists(biz, serviceId);
  return repo.createServiceAccreditation(businessId, biz.schema_name, serviceId, data.accreditation_id);
}

export async function deleteServiceAccreditation(businessId: number, serviceId: string, rowId: number) {
  const biz = await requireBusiness(businessId);
  return repo.deleteServiceAccreditation(businessId, biz.schema_name, serviceId, rowId);
}

// ─── Service media ──────────────────────────────────────────────────────────
// Stored in the generic uploaded_files table (entity_type "service", entity_id the service uuid) —
// no tenant-schema table needed. serviceId is an independently supplied uuid, so every route needs
// to confirm it actually belongs to the org in the URL, not just that the org itself exists.

/** Read-only ownership check for GET/DELETE — mirrors ensureServiceExists' own lookup (a real
 * tenant row, or a matching extraction course) but never provisions a schema or materializes a
 * stand-in. Viewing or deleting media must not have the side effect of turning a source-backed
 * org's extraction course into a real (if unpublished) tenant service — that would make later
 * service listings read from the tenant schema instead of the extraction catalog, hiding every
 * other course the org has that was never touched. Only an actual write (upload) may materialize. */
async function requireServiceReadable(
  org: { id: number; schema_name: string; schema_provisioned_at: string | null; source_job_id: string | null },
  serviceId: string,
) {
  if (org.schema_provisioned_at) {
    const existing = await repo.getService(org.id, org.schema_name, serviceId);
    if (existing) return;
  }
  const course = await findOwnedCourse(org, serviceId);
  if (!course) throw new NotFoundError("Service not found");
}

export async function requireServiceForRead(businessId: number, serviceId: string) {
  const biz = await requireBusiness(businessId);
  await requireServiceReadable(biz, serviceId);
}

export async function requireInstitutionServiceForRead(institutionId: number, serviceId: string) {
  const inst = await requireInstitution(institutionId);
  const jobId = await requireInstitutionJobId(inst);
  const service = await instRepo.getService(institutionId, jobId, serviceId);
  if (!service) throw new NotFoundError("Service not found");
}

export async function requireServiceForUpload(businessId: number, serviceId: string) {
  const biz = await requireBusiness(businessId);
  await ensureServiceExists(biz, serviceId);
}

export async function requireInstitutionServiceForUpload(institutionId: number, serviceId: string) {
  // Uploading media doesn't materialize anything special for institutions — a course row already
  // exists or it doesn't — so this is the same check as read.
  return requireInstitutionServiceForRead(institutionId, serviceId);
}

// ─── Institution twins ──────────────────────────────────────────────────────
// An institution's own Services tab. Unlike a business, an institution's services are always
// courses, and courses already live in superadmin.extraction_courses (job-scoped by the
// institution's source_job_id) — see institution-courses.repository.ts.

async function requireInstitution(id: number) {
  const inst = await platformRepo.findInstitutionById(id);
  if (!inst) throw new NotFoundError("Institution not found");
  return inst;
}

/** Same shape as withListExtras but for instRepo's already-textual field values — no
 * id-to-name lookup needed since extraction_courses stores degree_level/subject_area as text. */
function withInstitutionListExtras<T extends { id: string }>(
  rows: T[],
  extras: { fieldValues: { service_id: string; key: string; value: unknown }[]; durations: { service_id: string; duration_value: number; duration_unit: string }[] },
) {
  const degreeLevelByService = new Map(extras.fieldValues.filter((v) => v.key === "degree_level").map((v) => [v.service_id, v.value as string]));
  const areaOfStudyByService = new Map(extras.fieldValues.filter((v) => v.key === "area_of_study").map((v) => [v.service_id, v.value as string]));
  const durationByService = new Map(extras.durations.map((d) => [d.service_id, `${d.duration_value} ${d.duration_unit}`]));
  return rows.map((r) => ({
    ...r,
    degree_level: degreeLevelByService.get(r.id) ?? null,
    area_of_study: areaOfStudyByService.get(r.id) ?? null,
    duration: durationByService.get(r.id) ?? null,
  }));
}

export async function listInstitutionServices(institutionId: number) {
  const inst = await requireInstitution(institutionId);
  const jobId = await requireInstitutionJobId(inst);
  const rows = await instRepo.listServices(institutionId, jobId);
  const extras = await instRepo.getServiceListExtras(institutionId, jobId, rows.map((r) => r.id));
  return withInstitutionListExtras(rows, extras);
}

export async function searchInstitutionServices(institutionId: number, limit: number, offset: number, search?: string) {
  const inst = await requireInstitution(institutionId);
  const jobId = await requireInstitutionJobId(inst);
  const { rows, total } = await instRepo.searchServices(institutionId, jobId, limit, offset, search);
  const extras = await instRepo.getServiceListExtras(institutionId, jobId, rows.map((r) => r.id));
  return { rows: withInstitutionListExtras(rows, extras), total };
}

export async function createInstitutionService(institutionId: number, data: ServiceInput, adminId?: number) {
  const inst = await requireInstitution(institutionId);
  const jobId = await requireInstitutionJobId(inst);
  return instRepo.createService(institutionId, jobId, data, adminId);
}

export async function updateInstitutionService(institutionId: number, serviceId: string, data: ServicePatchInput, adminId: number) {
  const inst = await requireInstitution(institutionId);
  const jobId = await requireInstitutionJobId(inst);
  return instRepo.updateService(institutionId, jobId, serviceId, data, adminId);
}

export async function deleteInstitutionService(institutionId: number, serviceId: string) {
  const inst = await requireInstitution(institutionId);
  const jobId = await requireInstitutionJobId(inst);
  return instRepo.deleteService(institutionId, jobId, serviceId);
}

/** Institutions only ever offer the "courses" service category (institution services are always
 * courses — see institution-courses.repository.ts), so the frontend's category combobox and its
 * schema_field_id-keyed course-details fields both need that one category's row. Cached per call
 * since it's read on every institution service request. */
async function coursesCategory() {
  return masterKnex("service_categories").whereNull("deleted_at").where({ slug: "courses" }).first();
}

/** Institution field values map straight onto extraction_courses.degree_level/subject_area (see
 * institution-courses.repository.ts) — schema_field_id is only used here to tell which field
 * a value belongs to, via schema_fields.key (looked up without a category, since institutions
 * don't have a service_category_id to scope it by). "awarded_by" has no text column of its own —
 * it's handled separately, through the accreditation junction (see setAwardedBy). */
async function fieldIdsToKeys(values: ServiceFieldValuesInput["values"]) {
  if (values.length === 0) return [];
  const ids = values.map((v) => v.schema_field_id);
  const fields = await masterKnex("schema_fields").whereIn("id", ids).select("id", "key");
  const keyById = new Map(fields.map((f) => [f.id, f.key]));
  return values
    .map((v) => ({ key: keyById.get(v.schema_field_id), value: v.value }))
    .filter((v): v is { key: "degree_level" | "area_of_study"; value: unknown } => v.key === "degree_level" || v.key === "area_of_study");
}

async function fieldIdToAwardedBy(values: ServiceFieldValuesInput["values"]): Promise<number | null | undefined> {
  if (values.length === 0) return undefined;
  const ids = values.map((v) => v.schema_field_id);
  const fields = await masterKnex("schema_fields").whereIn("id", ids).select("id", "key");
  const awardedByFieldId = fields.find((f) => f.key === "awarded_by")?.id;
  if (awardedByFieldId == null) return undefined;
  const entry = values.find((v) => v.schema_field_id === awardedByFieldId);
  if (!entry) return undefined;
  return entry.value == null || entry.value === "" ? null : Number(entry.value);
}

/** Reverse of fieldIdsToKeys: the frontend keys course-details fields by the "courses" category's
 * schema_field_id, so values read back from extraction_courses need to be re-tagged with that
 * category's actual field ids or they show up under `undefined` and read as empty on edit. */
async function keysToFieldIds(values: { key: string; value: unknown }[]) {
  if (values.length === 0) return [];
  const category = await coursesCategory();
  if (!category) return [];
  const fields = await masterKnex("schema_fields").where({ entity_id: category.id, entity_type: "service_categories" }).select("id", "key");
  const idByKey = new Map(fields.map((f) => [f.key, f.id]));
  return values
    .map((v) => ({ schema_field_id: idByKey.get(v.key), value: v.value }))
    .filter((v): v is { schema_field_id: number; value: unknown } => v.schema_field_id != null);
}

export async function getInstitutionServiceFieldValues(institutionId: number, serviceId: string) {
  const inst = await requireInstitution(institutionId);
  const jobId = await requireInstitutionJobId(inst);
  const [values, awardedBy] = await Promise.all([
    instRepo.getServiceFieldValues(institutionId, jobId, serviceId),
    instRepo.getAwardedBy(jobId, serviceId),
  ]);
  const withAwardedBy = awardedBy != null ? [...values, { key: "awarded_by", value: awardedBy }] : values;
  return keysToFieldIds(withAwardedBy);
}

export async function upsertInstitutionServiceFieldValues(institutionId: number, serviceId: string, values: ServiceFieldValuesInput["values"]) {
  const inst = await requireInstitution(institutionId);
  const jobId = await requireInstitutionJobId(inst);
  const [keyed, awardedBy] = await Promise.all([fieldIdsToKeys(values), fieldIdToAwardedBy(values)]);
  if (awardedBy !== undefined) await instRepo.setAwardedBy(jobId, serviceId, awardedBy);
  return instRepo.upsertServiceFieldValues(institutionId, jobId, serviceId, keyed);
}

export async function listInstitutionServiceFees(institutionId: number, serviceId: string) {
  const inst = await requireInstitution(institutionId);
  const jobId = await requireInstitutionJobId(inst);
  return instRepo.listServiceFees(institutionId, jobId, serviceId);
}

export async function createInstitutionServiceFee(institutionId: number, serviceId: string, data: ServiceFeeInput) {
  const inst = await requireInstitution(institutionId);
  const jobId = await requireInstitutionJobId(inst);
  return instRepo.createServiceFee(institutionId, jobId, serviceId, data);
}

export async function updateInstitutionServiceFee(institutionId: number, serviceId: string, feeId: string, data: ServiceFeePatchInput) {
  const inst = await requireInstitution(institutionId);
  const jobId = await requireInstitutionJobId(inst);
  return instRepo.updateServiceFee(institutionId, jobId, serviceId, feeId, data);
}

export async function deleteInstitutionServiceFee(institutionId: number, serviceId: string, feeId: string) {
  const inst = await requireInstitution(institutionId);
  const jobId = await requireInstitutionJobId(inst);
  return instRepo.deleteServiceFee(institutionId, jobId, serviceId, feeId);
}

export async function listInstitutionServiceIntakes(institutionId: number, serviceId: string) {
  const inst = await requireInstitution(institutionId);
  const jobId = await requireInstitutionJobId(inst);
  return instRepo.listServiceIntakes(institutionId, jobId, serviceId);
}

export async function createInstitutionServiceIntake(institutionId: number, serviceId: string, data: ServiceIntakeInput) {
  const inst = await requireInstitution(institutionId);
  const jobId = await requireInstitutionJobId(inst);
  return instRepo.createServiceIntake(institutionId, jobId, serviceId, data);
}

export async function updateInstitutionServiceIntake(institutionId: number, serviceId: string, intakeId: string, data: ServiceIntakePatchInput) {
  const inst = await requireInstitution(institutionId);
  const jobId = await requireInstitutionJobId(inst);
  return instRepo.updateServiceIntake(institutionId, jobId, serviceId, intakeId, data);
}

export async function deleteInstitutionServiceIntake(institutionId: number, serviceId: string, intakeId: string) {
  const inst = await requireInstitution(institutionId);
  const jobId = await requireInstitutionJobId(inst);
  return instRepo.deleteServiceIntake(institutionId, jobId, serviceId, intakeId);
}

export async function listInstitutionServiceEligibility(institutionId: number, serviceId: string) {
  const inst = await requireInstitution(institutionId);
  const jobId = await requireInstitutionJobId(inst);
  return instRepo.listServiceEligibility(institutionId, jobId, serviceId);
}

export async function createInstitutionServiceEligibility(institutionId: number, serviceId: string, data: ServiceEligibilityInput) {
  const inst = await requireInstitution(institutionId);
  const jobId = await requireInstitutionJobId(inst);
  return instRepo.createServiceEligibility(institutionId, jobId, serviceId, data);
}

export async function updateInstitutionServiceEligibility(institutionId: number, serviceId: string, eligibilityId: string, data: ServiceEligibilityPatchInput) {
  const inst = await requireInstitution(institutionId);
  const jobId = await requireInstitutionJobId(inst);
  return instRepo.updateServiceEligibility(institutionId, jobId, serviceId, eligibilityId, data);
}

export async function deleteInstitutionServiceEligibility(institutionId: number, serviceId: string, eligibilityId: string) {
  const inst = await requireInstitution(institutionId);
  const jobId = await requireInstitutionJobId(inst);
  return instRepo.deleteServiceEligibility(institutionId, jobId, serviceId, eligibilityId);
}

export async function listInstitutionServiceStudyOptions(institutionId: number, serviceId: string) {
  const inst = await requireInstitution(institutionId);
  const jobId = await requireInstitutionJobId(inst);
  return instRepo.listServiceStudyOptions(institutionId, jobId, serviceId);
}

export async function createInstitutionServiceStudyOption(institutionId: number, serviceId: string, data: ServiceStudyOptionInput) {
  const inst = await requireInstitution(institutionId);
  const jobId = await requireInstitutionJobId(inst);
  return instRepo.createServiceStudyOption(institutionId, jobId, serviceId, data);
}

export async function updateInstitutionServiceStudyOption(institutionId: number, serviceId: string, optionId: string, data: ServiceStudyOptionPatchInput) {
  const inst = await requireInstitution(institutionId);
  const jobId = await requireInstitutionJobId(inst);
  return instRepo.updateServiceStudyOption(institutionId, jobId, serviceId, optionId, data);
}

export async function deleteInstitutionServiceStudyOption(institutionId: number, serviceId: string, optionId: string) {
  const inst = await requireInstitution(institutionId);
  const jobId = await requireInstitutionJobId(inst);
  return instRepo.deleteServiceStudyOption(institutionId, jobId, serviceId, optionId);
}

export async function listInstitutionServiceStudyUnits(institutionId: number, serviceId: string) {
  const inst = await requireInstitution(institutionId);
  const jobId = await requireInstitutionJobId(inst);
  return instRepo.listServiceStudyUnits(institutionId, jobId, serviceId);
}

export async function createInstitutionServiceStudyUnit(institutionId: number, serviceId: string, data: ServiceStudyUnitInput) {
  const inst = await requireInstitution(institutionId);
  const jobId = await requireInstitutionJobId(inst);
  return instRepo.createServiceStudyUnit(institutionId, jobId, serviceId, data);
}

export async function updateInstitutionServiceStudyUnit(institutionId: number, serviceId: string, unitId: string, data: ServiceStudyUnitPatchInput) {
  const inst = await requireInstitution(institutionId);
  const jobId = await requireInstitutionJobId(inst);
  return instRepo.updateServiceStudyUnit(institutionId, jobId, serviceId, unitId, data);
}

export async function deleteInstitutionServiceStudyUnit(institutionId: number, serviceId: string, unitId: string) {
  const inst = await requireInstitution(institutionId);
  const jobId = await requireInstitutionJobId(inst);
  return instRepo.deleteServiceStudyUnit(institutionId, jobId, serviceId, unitId);
}

export async function listInstitutionServiceAccreditations(institutionId: number, serviceId: string) {
  const inst = await requireInstitution(institutionId);
  const jobId = await requireInstitutionJobId(inst);
  return instRepo.listServiceAccreditations(institutionId, jobId, serviceId);
}

export async function createInstitutionServiceAccreditation(institutionId: number, serviceId: string, accreditationId: number) {
  const inst = await requireInstitution(institutionId);
  const jobId = await requireInstitutionJobId(inst);
  return instRepo.createServiceAccreditation(institutionId, jobId, serviceId, accreditationId);
}

export async function deleteInstitutionServiceAccreditation(institutionId: number, serviceId: string, rowId: string) {
  const inst = await requireInstitution(institutionId);
  const jobId = await requireInstitutionJobId(inst);
  return instRepo.deleteServiceAccreditation(institutionId, jobId, serviceId, rowId);
}
