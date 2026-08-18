// Service-vertical service — list, review and promote for the eight V3-only
// verticals. Mirrors immigration.service.ts: the repository does the queries, this
// layer shapes the response and writes the audit row.

import { NotFoundError } from "../../../../shared/errors.js";
import { logAudit } from "../shared/audit.js";
import { SERVICE_VERTICALS, type VerticalSpec } from "../lib/service-verticals.js";
import * as repo from "../repositories/service-verticals.repository.js";

/** What the admin tabs need: one entry per vertical with its review backlog. */
export async function listVerticals() {
  const verticals = await Promise.all(
    SERVICE_VERTICALS.map(async (spec) => ({
      slug: spec.slug,
      label: spec.label,
      counts: await repo.countByStatus(spec),
    })),
  );
  return { verticals };
}

export async function listRows(spec: VerticalSpec, opts: { status?: string; limit: number }) {
  return {
    vertical: { slug: spec.slug, label: spec.label, type_column: spec.typeColumn },
    rows: await repo.listRows(spec, opts),
  };
}

export async function discardRow(spec: VerticalSpec, id: string, adminId: number) {
  const found = await repo.updateStatus(spec, id, "discarded");
  if (!found) throw new NotFoundError(`${spec.label} row not found`);
  await logAudit(adminId, "SERVICE_VERTICAL_DISCARD", {
    entityType: spec.table,
    entityId: id,
    details: { vertical: spec.slug },
  });
  return { updated: true };
}

export async function promoteRow(
  spec: VerticalSpec,
  id: string,
  orgType: repo.OrgType,
  orgId: number,
  adminId: number,
) {
  const result = await repo.promote(spec, id, orgType, orgId);
  await logAudit(adminId, "SERVICE_VERTICAL_PROMOTE", {
    entityType: spec.table,
    entityId: id,
    details: { vertical: spec.slug, ...result },
  });
  return result;
}
