// Business-services service — services offered by a single business, plus their
// dynamic per-category field values.

import { masterKnex } from "../../../../../core/db/master-pool.js";
import * as coursesRepo from "../../../data-extraction/repositories/courses.repository.js";
import { NotFoundError } from "../../../../../shared/errors.js";
import * as platformRepo from "../../platform.repository.js";
import * as repo from "../repositories/business-services.repository.js";
import type { ServiceFieldValuesInput, ServiceInput, ServicePatchInput } from "../schemas/business-services.schema.js";

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
  const rows = await repo.listServices(businessId, biz.schema_name);
  return withListExtras(businessId, biz.schema_name, rows);
}

export async function searchServices(businessId: number, limit: number, offset: number, search?: string) {
  const biz = await requireBusiness(businessId);

  // Same fallback as branches: a pre-seeded business (never provisioned) has no business_services
  // rows of its own — the extraction job's scraped courses are read-only stand-ins until claimed.
  if (biz.account_status === 0 && biz.source_job_id) {
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

export async function upsertServiceFieldValues(businessId: number, serviceId: string, values: ServiceFieldValuesInput["values"]) {
  const biz = await requireBusiness(businessId);
  return repo.upsertServiceFieldValues(businessId, biz.schema_name, serviceId, values);
}
