// Audit-log repository — reads superadmin.admin_audit_logs and public.audit_logs.
//
// The two tables record the same idea with different columns, so both are projected
// onto one row shape and UNION ALL-ed. Only these two tables exist; nothing here
// invents a third.

import type { Knex } from "knex";
import { masterKnex } from "../../../../core/db/master-pool.js";
import type { AuditLogQuery, AuditSource } from "../schemas/audit-logs.schema.js";

export interface AuditLogRow {
  id: string;
  source: AuditSource;
  actor_id: number | null;
  actor_name: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  created_at: Date;
}

export type AuditLogFilters = Omit<AuditLogQuery, "page" | "limit">;

/** `first last`, or null when the actor row is gone (deleted user, system action). */
const ACTOR_NAME = `nullif(trim(concat_ws(' ', u.first_name, u.last_name)), '') as actor_name`;

function selectFor(source: AuditSource): Knex.Raw[] {
  const ipAddress = source === "platform" ? "l.ip_address" : "null::text as ip_address";
  return [
    masterKnex.raw("l.id"),
    masterKnex.raw("?::text as source", [source]),
    masterKnex.raw(source === "admin" ? "a.platform_user_id as actor_id" : "l.platform_user_id as actor_id"),
    masterKnex.raw(ACTOR_NAME),
    masterKnex.raw("u.email as actor_email"),
    masterKnex.raw("l.action"),
    masterKnex.raw("l.entity_type"),
    masterKnex.raw("l.entity_id::text as entity_id"),
    masterKnex.raw("l.details"),
    masterKnex.raw(ipAddress),
    masterKnex.raw("l.created_at"),
  ];
}

/** Joined, filtered, unselected — reused by both the page query and the count. */
function base(source: AuditSource, filters: AuditLogFilters): Knex.QueryBuilder {
  const query =
    source === "admin"
      ? masterKnex("superadmin.admin_audit_logs as l")
          .leftJoin("superadmin.admin_users as a", "a.id", "l.admin_id")
          .leftJoin("platform_users as u", "u.id", "a.platform_user_id")
      : masterKnex("audit_logs as l").leftJoin("platform_users as u", "u.id", "l.platform_user_id");

  if (filters.actor_id !== undefined) {
    query.where(source === "admin" ? "a.platform_user_id" : "l.platform_user_id", filters.actor_id);
  }
  if (filters.action) query.where("l.action", filters.action);
  if (filters.entity_type) query.where("l.entity_type", filters.entity_type);
  if (filters.from) query.where("l.created_at", ">=", filters.from);
  if (filters.to) query.where("l.created_at", "<=", filters.to);

  return query;
}

const requestedSources = (filters: AuditLogFilters): AuditSource[] =>
  filters.source ? [filters.source] : ["admin", "platform"];

export async function listAuditLogs(
  filters: AuditLogFilters,
  limit: number,
  offset: number,
): Promise<AuditLogRow[]> {
  const [head, ...rest] = requestedSources(filters).map((s) => base(s, filters).select(selectFor(s)));
  const unioned = rest.length > 0 ? head.unionAll(rest, true) : head;

  return masterKnex
    .select("*")
    .from(unioned.as("logs"))
    // id breaks ties so page boundaries stay stable when timestamps collide.
    .orderBy([
      { column: "created_at", order: "desc" },
      { column: "id", order: "desc" },
    ])
    .limit(limit)
    .offset(offset);
}

export async function countAuditLogs(filters: AuditLogFilters): Promise<number> {
  const counts = await Promise.all(
    requestedSources(filters).map(async (s) => {
      const row = await base(s, filters).count<{ count: string }[]>({ count: "*" });
      return Number(row[0]?.count ?? 0);
    }),
  );
  return counts.reduce((sum, n) => sum + n, 0);
}

/** Ids are UUIDs in both tables, so the id alone identifies the row. */
export async function findAuditLogById(id: string): Promise<AuditLogRow | undefined> {
  for (const source of ["admin", "platform"] as const) {
    const row = await base(source, {}).select(selectFor(source)).where("l.id", id).first();
    if (row) return row as AuditLogRow;
  }
  return undefined;
}
