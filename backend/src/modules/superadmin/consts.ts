export const SUPERADMIN_SCHEMA = "superadmin";

/**
 * Only an approved course reaches students — public pages, search counts and facets, the AI
 * counsellor and the embed widget. 'confirmed' is what Approve / bulk approve write — by a platform
 * admin OR the org's own owner (POST /services/approve, canApproveCourses: a product decision, the
 * owner vouches for their own catalog); 'manual' is a course an admin created by hand. Everything
 * else ('unverified' and 'pending' imports, owner-added courses, the auto-verifier's
 * 'verified'/'mismatch', rejected 'flagged') waits for approval — except business-portal
 * extractions, which skip it for now (SELF_SERVICE_SKIPS_APPROVAL).
 */
export const APPROVED_COURSE_STATUSES = ["confirmed", "manual"] as const;

/**
 * ponytail: for now a course from a BUSINESS-PORTAL extraction (an owner's self-service job, see
 * SELF_SERVICE_SOURCE_TYPES) needs no approval — it's public once published on a published
 * institution; only a rejected ('flagged') one stays hidden. Superadmin-extracted courses still need
 * approving. Flip to false to make business-portal courses go through approval again.
 */
export const SELF_SERVICE_SKIPS_APPROVAL = true;

/** Whether a course counts as approved; `sourceType` is its job's extraction_jobs.source_type. */
export const isApprovedCourse = (status: string | null | undefined, sourceType: string | null | undefined) =>
  (APPROVED_COURSE_STATUSES as readonly string[]).includes(status ?? "") ||
  (SELF_SERVICE_SKIPS_APPROVAL && status !== "flagged" && (SELF_SERVICE_SOURCE_TYPES as readonly string[]).includes(sourceType ?? ""));

/** SQL twin of isApprovedCourse for a course table alias (reads its job's source_type). */
export const approvedCourseSql = (alias: string) => {
  const approved = `${alias}.verification_status in (${APPROVED_COURSE_STATUSES.map((s) => `'${s}'`).join(", ")})`;
  if (!SELF_SERVICE_SKIPS_APPROVAL) return approved;
  return `(${approved} or (coalesce(${alias}.verification_status, 'unverified') <> 'flagged' and exists (
    select 1 from ${SUPERADMIN_SCHEMA}.extraction_jobs sj where sj.id = ${alias}.job_id
      and sj.source_type in (${SELF_SERVICE_SOURCE_TYPES.map((t) => `'${t}'`).join(", ")}))))`;
};

/**
 * A job whose approved courses may be public: promoted by a superadmin ("exported"), or the
 * owner's own self-service extraction — which never goes through Promote, and whose courses are
 * instead approved one by one (owner or admin, see POST /services/approve). Course-level
 * approval + publish + a published institution still gate every course on top of this.
 */
export const SELF_SERVICE_SOURCE_TYPES = ["institution_self_service", "business_self_service"] as const;
export const publicJobSql = (alias: string) =>
  `(${alias}.status = 'exported' or ${alias}.source_type in (${SELF_SERVICE_SOURCE_TYPES.map((t) => `'${t}'`).join(", ")}))`;

export const ADMIN_ROLES = ["super_admin", "admin", "data_admin", "moderator"] as const;

export const ALLOWED_ROLES = ["super_admin", "data_admin"] as const;

export const ROLE_DISPLAY: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  data_admin: "Data Admin",
  moderator: "Moderator",
};
