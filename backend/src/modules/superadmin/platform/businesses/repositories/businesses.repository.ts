// Repository for admin-managed business listings — CRUD, members, activity.

import type { Knex } from "knex";
import { masterKnex } from "../../../../../core/db/master-pool.js";
import { getKnex } from "../../../../../core/db/pool-manager.js";
import { SUPERADMIN_SCHEMA as S } from "../../../consts.js";

const now = () => masterKnex.fn.now();

function businessListQuery() {
  return masterKnex("businesses as b")
    .leftJoin("platform_users as owner", "owner.id", "b.owner_id")
    .leftJoin("business_categories as cat", "cat.id", "b.business_category_id")
    .leftJoin("countries as c", "c.id", "b.country_id")
    .whereNull("b.deleted_at");
}

function applyBusinessFilters<T extends ReturnType<typeof businessListQuery>>(
  q: T,
  search?: string,
  status?: string,
  category?: number,
  categorySlug?: string,
) {
  if (search) {
    q.where((b) =>
      b.whereILike("b.business_name", `%${search}%`)
        .orWhereILike("b.email", `%${search}%`)
        .orWhereILike("b.subdomain", `%${search}%`),
    );
  }
  if (status) q.where({ "b.status": status });
  if (category) q.where({ "b.business_category_id": category });
  if (categorySlug) q.where({ "cat.slug": categorySlug });
  return q;
}

export async function listBusinesses(
  limit: number, offset: number, search?: string, status?: string, category?: number, categorySlug?: string,
) {
  const q = applyBusinessFilters(businessListQuery(), search, status, category, categorySlug)
    .select(
      "b.id", "b.business_name", "b.subdomain", "b.business_type", "b.business_category_id",
      "b.email", "b.phone", "b.status", "b.claim_status", "b.is_published", "b.country_id", "b.city",
      "b.logo_url", "b.account_status", "b.created_at",
      "b.owner_id", "b.schema_name", "b.profile_views",
      masterKnex.raw("b.owner_id IS NULL as is_unclaimed"),
      "cat.name as category_name",
      "c.name as country_name",
      "owner.first_name as owner_first_name", "owner.last_name as owner_last_name", "owner.email as owner_email",
    )
    .orderBy("b.created_at", "desc")
    .limit(limit).offset(offset);
  const rows = await q;

  await Promise.all(
    rows.map(async (row: any) => {
      try {
        const tenantDb = await getKnex(row.id, row.schema_name);
        const [[{ count: branchCount }], [{ count: serviceCount }]] = await Promise.all([
          tenantDb("business_branches").whereNull("deleted_at").count("* as count"),
          tenantDb("business_services").whereNull("deleted_at").count("* as count"),
        ]);
        row.branch_count = Number(branchCount);
        row.service_count = Number(serviceCount);
      } catch {
        row.branch_count = 0;
        row.service_count = 0;
      }
    }),
  );

  // Every row says which table it came from, so a click can be routed to the right screen.
  return rows.map((row: any) => ({ ...row, kind: "business" as const }));
}

export async function countBusinesses(search?: string, status?: string, category?: number, categorySlug?: string) {
  const q = applyBusinessFilters(businessListQuery(), search, status, category, categorySlug).count("b.id as count");
  const [row] = await q;
  return Number(row.count);
}

// ── Institutions in the same list ──
// Institutions are the same kind of thing as businesses; they live in their own table only so
// one table doesn't hold everything. So they are read into the SAME row shape and rendered by
// the same card. `kind` is what tells them apart — every row carries it, so a caller can route
// a click to the right detail screen.

/** The 'institutions' business category. Institutions have no category column of their own — they
 *  ARE that category — so it is reported as a constant to keep the row shape identical. */
const INSTITUTION_CATEGORY_SLUG = "institutions";

function institutionListQuery() {
  return masterKnex("institutions as i")
    .leftJoin("platform_users as owner", "owner.id", "i.platform_user_id")
    .leftJoin("countries as c", "c.id", "i.country_id")
    .whereNull("i.deleted_at");
}

function applyInstitutionFilters<T extends ReturnType<typeof institutionListQuery>>(
  q: T,
  search?: string,
  status?: string,
) {
  if (search) {
    q.where((b) =>
      b.whereILike("i.institution_name", `%${search}%`)
        .orWhereILike("i.email", `%${search}%`)
        .orWhereILike("i.subdomain", `%${search}%`),
    );
  }
  if (status) q.where({ "i.status": status });
  return q;
}

export async function listInstitutions(limit: number, offset: number, search?: string, status?: string) {
  const category = await masterKnex("business_categories")
    .where({ slug: INSTITUTION_CATEGORY_SLUG })
    .first("id", "name");

  const rows = await applyInstitutionFilters(institutionListQuery(), search, status)
    .select(
      "i.id",
      // Aliased into the business column names so one row type and one card serve both.
      "i.institution_name as business_name",
      "i.subdomain",
      "i.institution_type as business_type",
      "i.email", "i.phone", "i.status", "i.claim_status", "i.is_published", "i.country_id", "i.city",
      "i.logo_url", "i.account_status", "i.created_at",
      "i.platform_user_id as owner_id", "i.schema_name", "i.source_job_id",
      masterKnex.raw("i.platform_user_id IS NULL as is_unclaimed"),
      masterKnex.raw("?::int as business_category_id", [category?.id ?? null]),
      masterKnex.raw("?::text as category_name", [category?.name ?? "Institutions"]),
      "c.name as country_name",
      "owner.first_name as owner_first_name", "owner.last_name as owner_last_name", "owner.email as owner_email",
    )
    .orderBy("i.created_at", "desc")
    .limit(limit).offset(offset);

  // institutions have no profile_views/branches/services tables of their own — "services" and
  // "branches" borrow the source extraction job's course/campus counts instead, so a promoted
  // institution shows real numbers rather than a permanent, meaningless zero.
  const jobIds = rows.map((r: any) => r.source_job_id).filter(Boolean);
  const [courseCounts, campusCounts] = jobIds.length
    ? await Promise.all([
        masterKnex(`${S}.extraction_jobs`).whereIn("id", jobIds).select("id", "courses_extracted"),
        masterKnex(`${S}.extraction_campuses`).whereIn("job_id", jobIds).groupBy("job_id").select("job_id").count("id as count"),
      ])
    : [[], []];
  const courseCountByJob = new Map(courseCounts.map((r: any) => [r.id, Number(r.courses_extracted) || 0]));
  const campusCountByJob = new Map(campusCounts.map((r: any) => [r.job_id, Number(r.count)]));

  return rows.map((row: any) => ({
    ...row,
    kind: "institution" as const,
    // institutions.status starts at 'pending', which is not one of the business status values
    // the shared card knows — STATUS_LABELS['pending'] is undefined, so the badge rendered
    // blank. Mapped onto the shared vocabulary; every other value already matches.
    status: row.status === "pending" ? "unverified" : row.status,
    profile_views: 0,
    branch_count: campusCountByJob.get(row.source_job_id) ?? 0,
    service_count: courseCountByJob.get(row.source_job_id) ?? 0,
  }));
}

export async function countInstitutions(search?: string, status?: string) {
  const [row] = await applyInstitutionFilters(institutionListQuery(), search, status).count("i.id as count");
  return Number(row.count);
}

export async function findInstitutionDetail(id: number) {
  const category = await masterKnex("business_categories").where({ slug: INSTITUTION_CATEGORY_SLUG }).first("id", "name");
  const row = await institutionListQuery()
    .where("i.id", id)
    .select(
      "i.id",
      // Aliased into the business column names, same as institutionListQuery, so one detail
      // type serves both — see InstitutionDetail on the frontend.
      "i.institution_name as business_name",
      "i.subdomain",
      "i.institution_type as business_type",
      "i.description", "i.website",
      "i.email", "i.phone", "i.status", "i.claim_status", "i.is_published",
      "i.country_id", "i.state", "i.city", "i.address", "i.postcode",
      "i.logo_url", "i.cover_url",
      "i.linkedin_url", "i.facebook_url", "i.instagram_url", "i.twitter_url", "i.youtube_url", "i.whatsapp_url",
      "i.gallery_images", "i.video_urls",
      "i.account_status", "i.created_at", "i.updated_at", "i.verified_at",
      "i.platform_user_id as owner_id", "i.schema_name", "i.source_job_id",
      masterKnex.raw("i.platform_user_id IS NULL as is_unclaimed"),
      masterKnex.raw("?::int as business_category_id", [category?.id ?? null]),
      masterKnex.raw("?::text as category_name", [category?.name ?? "Institutions"]),
      "c.name as country_name",
      "owner.first_name as owner_first_name", "owner.last_name as owner_last_name", "owner.email as owner_email",
    )
    .first();
  if (!row) return row;

  // Same borrowed-from-the-source-job counts as listInstitutions, so the detail page agrees
  // with the list card instead of omitting the fields entirely.
  let branch_count = 0;
  let service_count = 0;
  if (row.source_job_id) {
    const [job, [{ count }]] = await Promise.all([
      masterKnex(`${S}.extraction_jobs`).where({ id: row.source_job_id }).first("courses_extracted"),
      masterKnex(`${S}.extraction_campuses`).where({ job_id: row.source_job_id }).count("id as count"),
    ]);
    service_count = Number(job?.courses_extracted) || 0;
    branch_count = Number(count) || 0;
  }

  // Same status-vocabulary mapping as listInstitutions.
  return { ...row, status: row.status === "pending" ? "unverified" : row.status, branch_count, service_count };
}

export async function listInstitutionMembers(
  institutionId: number, schemaName: string,
  opts: { search?: string; limit: number; offset: number },
) {
  const db = await getKnex(institutionId, schemaName);
  const base = () => {
    const q = db("members as m").whereNull("m.deleted_at");
    if (opts.search) {
      q.where((qb) => {
        qb.whereILike("m.first_name", `%${opts.search}%`)
          .orWhereILike("m.last_name", `%${opts.search}%`)
          .orWhereILike("m.email", `%${opts.search}%`);
      });
    }
    return q;
  };
  const [{ count }] = await base().count<{ count: string }[]>("m.id as count");
  const rows = await base()
    .select("m.id", "m.platform_user_id", "m.is_owner", "m.account_status", "m.role", "m.created_at")
    .orderBy("m.is_owner", "desc")
    .orderBy("m.created_at")
    .limit(opts.limit)
    .offset(opts.offset);
  const total = Number(count);
  if (rows.length === 0) return { rows: [], total };
  const userIds = rows.map((r) => r.platform_user_id);
  const users = await masterKnex("platform_users").whereIn("id", userIds).select("id", "first_name", "last_name", "email", "phone", "photo_url");
  const byId = new Map(users.map((u) => [u.id, u]));
  return {
    rows: rows.map((r) => ({
      id: r.id,
      platform_user_id: r.platform_user_id,
      is_owner: r.is_owner,
      account_status: r.account_status,
      admin_point_of_contact: false,
      created_at: r.created_at,
      role_name: r.role,
      role_display_name: null,
      user: byId.get(r.platform_user_id) ?? null,
    })),
    total,
  };
}

export async function findInstitutionById(id: number) {
  return masterKnex("institutions").where({ id }).whereNull("deleted_at").first();
}

/** Category id -> slug, so the list can decide which table a category filter means. */
export async function findCategorySlugById(id: number): Promise<string | undefined> {
  const row = await masterKnex("business_categories").where({ id }).first("slug");
  return row?.slug;
}

export async function findBusinessById(id: number) {
  return masterKnex("businesses").where({ id }).whereNull("deleted_at").first();
}

export async function findBusinessDetail(id: number) {
  const row = await businessListQuery()
    .where("b.id", id)
    .select(
      "b.*",
      masterKnex.raw("b.owner_id IS NULL as is_unclaimed"),
      "cat.name as category_name",
      "c.name as country_name",
      "owner.first_name as owner_first_name", "owner.last_name as owner_last_name", "owner.email as owner_email",
    )
    .first();
  if (!row) return row;
  try {
    const tenantDb = await getKnex(row.id, row.schema_name);
    const [[{ count: branchCount }], [{ count: serviceCount }]] = await Promise.all([
      tenantDb("business_branches").whereNull("deleted_at").count("* as count"),
      tenantDb("business_services").whereNull("deleted_at").count("* as count"),
    ]);
    row.branch_count = Number(branchCount);
    row.service_count = Number(serviceCount);
  } catch {
    row.branch_count = 0;
    row.service_count = 0;
  }
  return row;
}

export async function insertBusiness(data: Record<string, unknown>, db: Knex = masterKnex) {
  const [row] = await db("businesses").insert(data).returning("*");
  return row;
}

export async function updateBusiness(id: number, data: Record<string, unknown>) {
  const [row] = await masterKnex("businesses").where({ id }).update({ ...data, updated_at: now() }).returning("*");
  return row;
}

export async function deleteBusiness(id: number) {
  return masterKnex("businesses").where({ id }).update({ deleted_at: masterKnex.fn.now() });
}

export async function listBusinessMembers(
  businessId: number, schemaName: string,
  opts: { pointOfContact?: boolean; search?: string; limit: number; offset: number },
) {
  const db = await getKnex(businessId, schemaName);
  const base = () => {
    const q = db("agents as a").whereNull("a.deleted_at");
    if (opts.pointOfContact) q.where("a.admin_point_of_contact", true);
    if (opts.search) {
      q.where((qb) => {
        qb.whereILike("a.first_name", `%${opts.search}%`)
          .orWhereILike("a.last_name", `%${opts.search}%`)
          .orWhereILike("a.email", `%${opts.search}%`);
      });
    }
    return q;
  };
  const [{ count }] = await base().count<{ count: string }[]>("a.id as count");
  const rows = await base()
    .leftJoin("roles as r", "r.id", "a.role_id")
    .select(
      "a.id", "a.platform_user_id", "a.is_owner", "a.account_status", "a.admin_point_of_contact", "a.created_at",
      "r.name as role_name", "r.display_name as role_display_name",
    )
    .orderBy("a.is_owner", "desc")
    .orderBy("a.created_at")
    .limit(opts.limit)
    .offset(opts.offset);
  const total = Number(count);
  if (rows.length === 0) return { rows, total };
  const userIds = rows.map((r) => r.platform_user_id);
  const users = await masterKnex("platform_users").whereIn("id", userIds).select("id", "first_name", "last_name", "email", "phone", "photo_url");
  const byId = new Map(users.map((u) => [u.id, u]));
  return { rows: rows.map((r) => ({ ...r, user: byId.get(r.platform_user_id) ?? null })), total };
}

export async function listBusinessActivity(businessId: number, limit: number, offset: number) {
  const base = () =>
    masterKnex(`${S}.admin_audit_logs as l`).whereRaw("(l.details->>'business_id')::int = ?", [businessId]);
  const [{ count }] = await base().count<{ count: string }[]>("l.id as count");
  const rows = await base()
    .leftJoin(`${S}.admin_users as au`, "au.id", "l.admin_id")
    .leftJoin("platform_users as u", "u.id", "au.platform_user_id")
    .select("l.id", "l.action", "l.details", "l.created_at", "u.first_name as admin_first_name", "u.last_name as admin_last_name")
    .orderBy("l.created_at", "desc")
    .limit(limit)
    .offset(offset);
  return { rows, total: Number(count) };
}
