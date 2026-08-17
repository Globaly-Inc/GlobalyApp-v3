// Public read-only student job listings for the search page's Jobs tab.

import { masterKnex } from "../../../core/db/master-pool.js";

export type JobSearchFilters = {
  country?: string;
  jobType?: string;
  isRemote?: boolean;
  search?: string;
};

function baseQuery({ country, jobType, isRemote, search }: JobSearchFilters) {
  const q = masterKnex("student_jobs as j")
    .leftJoin("countries as c", "c.id", "j.location_country_id")
    .leftJoin("businesses as b", "b.id", "j.business_id")
    .where("j.is_published", true)
    .whereNull("j.deleted_at");

  if (country) {
    q.where((qb) =>
      qb.whereRaw("lower(c.name) = lower(?)", [country]).orWhereRaw("lower(c.slug) = lower(?)", [country]),
    );
  }
  if (jobType) q.where("j.job_type", jobType);
  if (isRemote) q.where("j.is_remote", true);
  if (search) q.whereILike("j.title", `%${search}%`);
  return q;
}

export async function listPublicJobs(filters: JobSearchFilters, limit: number, offset: number) {
  return baseQuery(filters)
    .select(
      "j.id", "j.title", "j.description", "j.job_type",
      "j.location_city", "c.name as country_name", "j.is_remote",
      "j.pay_min", "j.pay_max", "j.pay_currency", "j.pay_unit",
      "j.closing_date", "j.created_at",
      "b.business_name as company_name_from_business", "j.company_name",
      "b.logo_url",
    )
    .orderBy("j.created_at", "desc")
    .limit(limit)
    .offset(offset);
}

export async function countPublicJobs(filters: JobSearchFilters) {
  const [row] = await baseQuery(filters).count("j.id as count");
  return Number(row.count);
}
