// Platform-admin monitoring for ambassador programs. Read-only: monitoring is
// about whether the pipeline and the money are working, not about operating a
// business's program on its behalf.
//
// This is what frontend/src/app/admin/monitoring/ambassador-programs renders.

import { masterKnex } from "../../../core/db/master-pool.js";
import {
  buildPaginatedResponse,
  paginationToOffset,
  type PaginationInput,
} from "../../../shared/pagination.js";
import type { ProgramStatus } from "../consts.js";

export interface AdminListQuery extends PaginationInput {
  status?: ProgramStatus;
  business_id?: number;
}

export async function listForAdmin(query: AdminListQuery) {
  const { limit, offset } = paginationToOffset(query);

  const base = () => {
    const q = masterKnex("ambassador_programs as p").whereNull("p.deleted_at");
    if (query.status) q.andWhere("p.status", query.status);
    if (query.business_id) q.andWhere("p.business_id", query.business_id);
    return q;
  };

  const [rows, countRow] = await Promise.all([
    base()
      .leftJoin("businesses as b", "b.id", "p.business_id")
      .orderBy("p.created_at", "desc")
      .limit(limit)
      .offset(offset)
      .select(
        "p.id",
        "p.business_id",
        "p.name",
        "p.slug",
        "p.status",
        "p.created_at",
        "b.business_name",
        masterKnex.raw(
          `(SELECT count(*) FROM ambassadors a WHERE a.program_id = p.id AND a.deleted_at IS NULL AND a.status = 'active') AS active_ambassadors`,
        ),
        masterKnex.raw(
          `(SELECT count(*) FROM ambassador_applications ap WHERE ap.program_id = p.id AND ap.status = 'pending') AS pending_applications`,
        ),
        masterKnex.raw(
          `(SELECT count(*) FROM ambassador_inquiries i WHERE i.program_id = p.id) AS total_inquiries`,
        ),
        masterKnex.raw(
          `(SELECT count(*) FROM ambassador_inquiries i WHERE i.program_id = p.id AND i.status = 'resolved') AS resolved_inquiries`,
        ),
      ),
    base().count<{ count: string }[]>({ count: "*" }).first(),
  ]);

  const data = rows.map(
    (r: Record<string, unknown>) => ({
      id: Number(r.id),
      business_id: Number(r.business_id),
      business_name: (r.business_name as string) ?? null,
      name: r.name as string,
      slug: r.slug as string,
      status: r.status as ProgramStatus,
      created_at: r.created_at as Date,
      active_ambassadors: Number(r.active_ambassadors ?? 0),
      pending_applications: Number(r.pending_applications ?? 0),
      total_inquiries: Number(r.total_inquiries ?? 0),
      resolved_inquiries: Number(r.resolved_inquiries ?? 0),
    }),
  );

  return buildPaginatedResponse(data, Number(countRow?.count ?? 0), query);
}

export async function statsForAdmin() {
  const [programs, ambassadors, inquiries, payouts, escalated] = await Promise.all([
    masterKnex("ambassador_programs").whereNull("deleted_at")
      .select(masterKnex.raw(`count(*) AS total, count(*) FILTER (WHERE status = 'active') AS active`))
      .first(),
    masterKnex("ambassadors").whereNull("deleted_at")
      .select(masterKnex.raw(`count(*) AS total, count(*) FILTER (WHERE status = 'active') AS active`))
      .first(),
    masterKnex("ambassador_inquiries")
      .select(
        masterKnex.raw(
          `count(*) AS total, count(*) FILTER (WHERE status = 'resolved') AS resolved, count(*) FILTER (WHERE created_at >= now() - interval '7 days') AS last_7_days`,
        ),
      )
      .first(),
    masterKnex("ambassador_payouts")
      .select(
        masterKnex.raw(
          `count(*) AS total, coalesce(sum(amount_minor) FILTER (WHERE status = 'completed'), 0) AS paid_minor, count(*) FILTER (WHERE status = 'failed') AS failed`,
        ),
      )
      .first(),
    masterKnex("ambassador_inquiries").where({ status: "escalated" })
      .count<{ count: string }[]>({ count: "*" }).first(),
  ]);

  const n = (v: unknown) => Number(v ?? 0);
  return {
    programs: { total: n(programs?.total), active: n(programs?.active) },
    ambassadors: { total: n(ambassadors?.total), active: n(ambassadors?.active) },
    inquiries: {
      total: n(inquiries?.total),
      resolved: n(inquiries?.resolved),
      last_7_days: n(inquiries?.last_7_days),
      escalated: n(escalated?.count),
    },
    payouts: {
      total: n(payouts?.total),
      paid_minor: n(payouts?.paid_minor),
      failed: n(payouts?.failed),
    },
  };
}
