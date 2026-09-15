// Superadmin view of the coming-soon waiting list — the rows the public
// waitlist module writes into public.waitlist_registrations.
//
// Read-only: a sign-up is raw intent, editing or deleting one loses the only
// record that it happened. Lives in the platform module, so it inherits its
// super_admin / data_admin guard.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { masterKnex } from "../../../../core/db/master-pool.js";
import { PaginationSchema, paginationToOffset, buildPaginatedResponse } from "../../../../shared/pagination.js";
import { REGISTRANT_TYPES } from "../../../waitlist/schemas/waitlist.schema.js";

const WaitlistQuery = z.object({
  search: z.string().trim().max(200).optional(),
  registrant_type: z.enum(REGISTRANT_TYPES).optional(),
});

export async function adminWaitlistRoutes(app: FastifyInstance) {
  app.get("/waitlist", async (req, reply) => {
    const filters = WaitlistQuery.parse(req.query);
    const page = PaginationSchema.parse(req.query);
    const { limit, offset } = paginationToOffset(page);

    const base = () => {
      const q = masterKnex("waitlist_registrations");
      if (filters.registrant_type) q.where("registrant_type", filters.registrant_type);
      if (filters.search) {
        const term = `%${filters.search}%`;
        q.where((w) => w.whereILike("name", term).orWhereILike("email", term));
      }
      return q;
    };

    const [rows, countRow] = await Promise.all([
      base()
        .select("uuid", "name", "email", "registrant_type", "created_at")
        .orderBy("created_at", "desc")
        .limit(limit)
        .offset(offset),
      base().count<{ count: string }>({ count: "*" }).first(),
    ]);

    return reply.send(buildPaginatedResponse(rows, Number(countRow?.count ?? 0), page));
  });
}
