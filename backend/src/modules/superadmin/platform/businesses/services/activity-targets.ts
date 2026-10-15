// Names for the Activity tab: log entries store ids (service_id, branch_id) so a later rename
// still reads right — resolved here, in one query per table, when the tab loads.

import type { Knex } from "knex";
import { masterKnex } from "../../../../../core/db/master-pool.js";
import { SUPERADMIN_SCHEMA as S } from "../../../consts.js";

type Row = { details: Record<string, unknown> | string | null };

const UUID = /^[0-9a-f-]{36}$/i;

const idsOf = (rows: Row[], key: string) =>
  [...new Set(rows.map((r) => (r.details as Record<string, unknown> | null)?.[key]).filter((v): v is string => typeof v === "string" && UUID.test(v)))];

async function names(query: Knex.QueryBuilder | null): Promise<Map<string, string>> {
  if (!query) return new Map();
  const found: { id: string; name: string | null }[] = await query.catch(() => []);
  return new Map(found.map((r) => [String(r.id), r.name ?? ""]));
}

/** Adds `target` (the course/service or branch name) to each row that names one. `tenantDb`: the
 *  org's own schema (branches; and services for a business). Institutions' courses live centrally. */
export async function withActivityTargets<T extends Row>(rows: T[], kind: "business" | "institution", tenantDb?: Knex) {
  const parsed = rows.map((r) => ({ ...r, details: typeof r.details === "string" ? JSON.parse(r.details) : (r.details ?? {}) }));
  const serviceIds = idsOf(parsed, "service_id");
  const branchIds = idsOf(parsed, "branch_id");
  const [services, branches] = await Promise.all([
    names(!serviceIds.length ? null : kind === "institution"
      ? masterKnex(`${S}.extraction_courses`).whereIn("id", serviceIds).select("id", "name")
      // Tenant tables key on a serial `id`; the public (logged) identifier is `uuid`.
      : tenantDb ? tenantDb("business_services").whereIn("uuid", serviceIds).select("uuid as id", "name") : null),
    names(branchIds.length && tenantDb ? tenantDb("business_branches").whereIn("uuid", branchIds).select("uuid as id", "name") : null),
  ]);
  return parsed.map((r) => {
    const d = r.details as Record<string, unknown>;
    const id = (d.service_id ?? d.branch_id) as string | undefined;
    const target = (d.service_name as string | undefined) ?? (d.name as string | undefined)
      ?? (id ? services.get(id) ?? branches.get(id) : undefined);
    return { ...r, target: target ?? null };
  });
}
