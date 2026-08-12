// Analytics service — platform-wide metrics for superadmin dashboard.

import { masterKnex } from "../../../core/db/master-pool.js";
import { SUPERADMIN_SCHEMA as S } from "../consts.js";

// ─── Date helpers ──────────────────────────────────────────────────────────

function windowStart(preset: string): Date {
  const days = preset === "last7" ? 7 : preset === "last90" ? 90 : 30;
  return new Date(Date.now() - days * 86_400_000);
}

function weekAgo(): Date {
  return new Date(Date.now() - 7 * 86_400_000);
}

// ─── Counts helper ─────────────────────────────────────────────────────────

interface FeatureCount {
  key: string;
  label: string;
  count: number;
  last_week: number;
}

async function countTable(
  table: string,
  key: string,
  label: string,
  schema?: string,
): Promise<FeatureCount> {
  const t = schema ? `${schema}.${table}` : table;
  const [all] = await masterKnex(t).count("* as count");
  const [lw] = await masterKnex(t).where("created_at", ">=", weekAgo()).count("* as count");
  return { key, label, count: Number(all.count), last_week: Number(lw.count) };
}

// ─── Overview (admin dashboard stat cards) ────────────────────────────────

export async function getOverviewStats() {
  const [businesses, platformUsers, activeExtractions] = await Promise.all([
    masterKnex("businesses").count("* as count").first(),
    masterKnex("platform_users").count("* as count").first(),
    masterKnex(`${S}.extraction_jobs`).whereIn("status", ["pending", "processing"]).count("* as count").first(),
  ]);

  return {
    businesses: Number(businesses?.count ?? 0),
    platform_users: Number(platformUsers?.count ?? 0),
    active_extractions: Number(activeExtractions?.count ?? 0),
    // ponytail: no scholarships table yet — wire this up once that feature lands
    scholarships_listed: 0,
  };
}

// ─── Dashboard ─────────────────────────────────────────────────────────────

export async function getDashboard(preset: string) {
  const start = windowStart(preset);

  // ── Summary counts (parallel) ──
  const [
    totalUsers,
    totalBusinesses,
    activeBusinesses,
    totalInstitutions,
    totalAdmins,
    totalExtractionJobs,
  ] = await Promise.all([
    masterKnex("platform_users").count("* as count").first(),
    masterKnex("businesses").count("* as count").first(),
    masterKnex("businesses").where({ account_status: 1 }).count("* as count").first(),
    masterKnex("institutions").count("* as count").first(),
    masterKnex(`${S}.admin_users`).count("* as count").first(),
    masterKnex(`${S}.extraction_jobs`).count("* as count").first(),
  ]);

  const summary = {
    total_users: Number(totalUsers?.count ?? 0),
    total_businesses: Number(totalBusinesses?.count ?? 0),
    active_businesses: Number(activeBusinesses?.count ?? 0),
    total_institutions: Number(totalInstitutions?.count ?? 0),
    total_admins: Number(totalAdmins?.count ?? 0),
    total_extraction_jobs: Number(totalExtractionJobs?.count ?? 0),
  };

  // ── Feature usage (sequential — single pg client, safe) ──
  const feature_usage: FeatureCount[] = [];

  const features: [string, string, string, string?][] = [
    ["platform_user_profiles", "profiles", "User Profiles"],
    ["platform_user_qualifications", "qualifications", "Qualifications"],
    ["platform_user_language_tests", "language_tests", "Language Tests"],
    ["platform_user_work_experiences", "work_experiences", "Work Experiences"],
    ["uploaded_files", "files", "Uploaded Files"],
    ["businesses", "businesses", "Businesses"],
    ["institutions", "institutions", "Institutions"],
    ["extraction_jobs", "extraction_jobs", "Extraction Jobs", S],
    ["extraction_courses", "extracted_courses", "Extracted Courses", S],
  ];

  for (const [table, key, label, schema] of features) {
    feature_usage.push(await countTable(table, key, label, schema));
  }

  // ── Growth timelines (raw created_at for client-side charting) ──
  const [usersGrowth, businessesGrowth, institutionsGrowth] = await Promise.all([
    masterKnex("platform_users")
      .select(masterKnex.raw("date_trunc('day', created_at) as day"))
      .count("* as count")
      .where("created_at", ">=", start)
      .groupByRaw("date_trunc('day', created_at)")
      .orderBy("day"),
    masterKnex("businesses")
      .select(masterKnex.raw("date_trunc('day', created_at) as day"))
      .count("* as count")
      .where("created_at", ">=", start)
      .groupByRaw("date_trunc('day', created_at)")
      .orderBy("day"),
    masterKnex("institutions")
      .select(masterKnex.raw("date_trunc('day', created_at) as day"))
      .count("* as count")
      .where("created_at", ">=", start)
      .groupByRaw("date_trunc('day', created_at)")
      .orderBy("day"),
  ]);

  const growth = {
    users: usersGrowth.map((r: any) => ({ day: r.day, count: Number(r.count) })),
    businesses: businessesGrowth.map((r: any) => ({ day: r.day, count: Number(r.count) })),
    institutions: institutionsGrowth.map((r: any) => ({ day: r.day, count: Number(r.count) })),
  };

  // ── User breakdown — from is_personal_account / is_business_account flags ──
  const [personalUsers, businessUsers, uncategorizedUsers] = await Promise.all([
    masterKnex("platform_users").where({ is_personal_account: true }).whereNull("deleted_at").count("* as count").first(),
    masterKnex("platform_users").where({ is_business_account: true }).whereNull("deleted_at").count("* as count").first(),
    masterKnex("platform_users").where({ is_personal_account: false, is_business_account: false }).whereNull("deleted_at").count("* as count").first(),
  ]);

  const user_breakdown = {
    by_category: [
      { category: "personal", count: Number(personalUsers?.count ?? 0) },
      { category: "business", count: Number(businessUsers?.count ?? 0) },
      { category: "uncategorized", count: Number(uncategorizedUsers?.count ?? 0) },
    ],
  };

  // ── Extraction pipeline stats ──
  const extractionByStatus = await masterKnex(`${S}.extraction_jobs`)
    .select("status")
    .count("* as count")
    .groupBy("status");

  const extraction = {
    by_status: extractionByStatus.map((r: any) => ({
      status: r.status,
      count: Number(r.count),
    })),
  };

  // ── Recent signups ──
  const recent_signups = await masterKnex("platform_users")
    .select("id", "uuid", "first_name", "last_name", "email", "created_at")
    .whereNull("deleted_at")
    .orderBy("created_at", "desc")
    .limit(10);

  return {
    preset,
    generated_at: new Date().toISOString(),
    summary,
    feature_usage,
    growth,
    user_breakdown,
    extraction,
    recent_signups,
  };
}
