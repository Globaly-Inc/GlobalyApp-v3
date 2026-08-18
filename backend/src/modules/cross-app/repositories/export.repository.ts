// The outbound GlobalyAI feed's reads.
//
// Source is `catalog_services` — V3's live catalog projection — filtered through the
// SAME publish predicate the public catalog uses (`is_published AND deleted_at IS
// NULL`, see modules/search/repositories/catalog.repository.ts `liveScope`). The feed
// is an external consumer, so it must never see more than a visitor to the website
// does. Explicit column lists throughout; no `select *`.
//
// Institutions are polymorphic in V3 (`owner_org_type` is 'business' | 'institution',
// two separate tables with their own serial ids) where V1 had one `businesses` table
// keyed by uuid. The feed therefore carries `org_type` alongside `id` — a consumer
// cannot dedupe on a bare integer that means two different things.
//
// V1's export-courses fetched a page of institutions and then ALL their courses with
// `.limit(2000)` and no cursor, so an institution catalogue past 2000 rows was
// silently truncated with `next_page: null`. Here COURSES are the paged entity and
// institutions are derived from the page, so nothing is silently dropped (§1.6:
// legacy bugs are not the spec).

import { masterKnex } from "../../../core/db/master-pool.js";

const T = "catalog_services";

export interface ExportCourseRow {
  service_id: string;
  owner_org_type: string;
  owner_org_id: number;
  name: string;
  slug: string | null;
  description: string | null;
  overview: string | null;
  tags: string[] | null;
  service_category_id: number | null;
  degree_level_id: number | null;
  area_of_study_id: number | null;
  study_mode: string[] | null;
  duration_value: number | null;
  duration_unit: string | null;
  min_fee: string | null;
  max_fee: string | null;
  fee_currency: string | null;
  intake_months: number[] | null;
  next_intake_date: Date | null;
  image_url: string | null;
  brochure_url: string | null;
  is_featured: boolean;
  created_at: Date;
  updated_at: Date;
}

const COURSE_COLUMNS = [
  `${T}.service_id`,
  `${T}.owner_org_type`,
  `${T}.owner_org_id`,
  `${T}.name`,
  `${T}.slug`,
  `${T}.description`,
  `${T}.overview`,
  `${T}.tags`,
  `${T}.service_category_id`,
  `${T}.degree_level_id`,
  `${T}.area_of_study_id`,
  `${T}.study_mode`,
  `${T}.duration_value`,
  `${T}.duration_unit`,
  `${T}.min_fee`,
  `${T}.max_fee`,
  `${T}.fee_currency`,
  `${T}.intake_months`,
  `${T}.next_intake_date`,
  `${T}.image_url`,
  `${T}.brochure_url`,
  `${T}.is_featured`,
  `${T}.created_at`,
  `${T}.updated_at`,
] as const;

export interface ExportOrgRow {
  org_type: "business" | "institution";
  id: number;
  name: string;
  description: string | null;
  logo_url: string | null;
  website: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  status: string;
  verified_at: Date | null;
  updated_at: Date;
}

export interface ExportPageQuery {
  /** ISO timestamp — only rows updated at or after this. Incremental sync. */
  since?: string;
  limit: number;
  offset: number;
}

/** The publish predicate. One place, so a leak test has one thing to point at. */
function liveCourses(since?: string) {
  const q = masterKnex(T).where(`${T}.is_published`, true).whereNull(`${T}.deleted_at`);
  if (since) q.where(`${T}.updated_at`, ">=", since);
  return q;
}

export async function listCourses(query: ExportPageQuery): Promise<ExportCourseRow[]> {
  return liveCourses(query.since)
    .select(COURSE_COLUMNS)
    .orderBy(`${T}.updated_at`, "desc")
    .orderBy(`${T}.service_id`, "asc")
    .limit(query.limit)
    .offset(query.offset) as unknown as Promise<ExportCourseRow[]>;
}

export async function countCourses(since?: string): Promise<number> {
  const row = await liveCourses(since).count<{ count: string }[]>({ count: "*" });
  return Number(row[0]?.count ?? 0);
}

/**
 * The orgs owning a given page of courses, from whichever table each lives in.
 *
 * Two targeted queries rather than a polymorphic join: `owner_org_id` cannot be a
 * foreign key to two tables, so a join would need a union anyway, and this keeps the
 * column lists per-table honest (`businesses.business_name` vs
 * `institutions.institution_name`).
 */
export async function listOrgsForCourses(courses: ExportCourseRow[]): Promise<ExportOrgRow[]> {
  const businessIds = [
    ...new Set(courses.filter((c) => c.owner_org_type === "business").map((c) => c.owner_org_id)),
  ];
  const institutionIds = [
    ...new Set(courses.filter((c) => c.owner_org_type === "institution").map((c) => c.owner_org_id)),
  ];

  const out: ExportOrgRow[] = [];

  if (businessIds.length) {
    const rows = await masterKnex("businesses")
      .select(
        "id",
        "business_name as name",
        "description",
        "logo_url",
        "website",
        "city",
        "state",
        "status",
        "verified_at",
        "updated_at",
        "country_id",
      )
      .leftJoin("countries", "countries.id", "businesses.country_id")
      .select("countries.name as country")
      .whereIn("businesses.id", businessIds)
      .whereNull("businesses.deleted_at");
    for (const r of rows as Array<Record<string, unknown>>) {
      out.push({ org_type: "business", ...(r as object) } as ExportOrgRow);
    }
  }

  if (institutionIds.length) {
    const rows = await masterKnex("institutions")
      .select(
        "institutions.id",
        "institutions.institution_name as name",
        "institutions.description",
        "institutions.logo_url",
        "institutions.website",
        "institutions.city",
        "institutions.state",
        "institutions.status",
        "institutions.verified_at",
        "institutions.updated_at",
      )
      .leftJoin("countries", "countries.id", "institutions.country_id")
      .select("countries.name as country")
      .whereIn("institutions.id", institutionIds)
      .whereNull("institutions.deleted_at");
    for (const r of rows as Array<Record<string, unknown>>) {
      out.push({ org_type: "institution", ...(r as object) } as ExportOrgRow);
    }
  }

  return out;
}
