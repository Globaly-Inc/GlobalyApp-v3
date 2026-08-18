// Superadmin user management routes.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { NotFoundError, ForbiddenError } from "../../../../shared/errors.js";
import { paginationToOffset, buildPaginatedResponse, PaginationSchema } from "../../../../shared/pagination.js";
import { cached, invalidatePrefix } from "../../../../core/cache/dragonfly.js";
import * as repo from "../platform.repository.js";

const UserIdParam = z.object({ id: z.coerce.number().int().positive() });
const ListQuery = PaginationSchema.extend({ search: z.string().optional() });
const SuspendPatch = z.object({ is_suspended: z.boolean() });

// ponytail: 60s TTL absorbs staleness from profile edits made outside this
// module (users editing their own name/photo) — only suspend invalidates eagerly.
const USERS_CACHE_PREFIX = "sa:users:";
const USERS_CACHE_TTL_S = 60;

export async function adminUserRoutes(app: FastifyInstance) {
  // GET /users — read-through Dragonfly cache per page/search combination
  app.get("/users", async (req, reply) => {
    const { search, ...pagination } = ListQuery.parse(req.query);
    const { limit, offset } = paginationToOffset(pagination);
    const key = `${USERS_CACHE_PREFIX}${limit}:${offset}:${search ?? ""}`;
    const { rows, total } = await cached(key, USERS_CACHE_TTL_S, async () => {
      const [rows, total] = await Promise.all([
        repo.listUsers(limit, offset, search),
        repo.countUsers(search),
      ]);
      return { rows, total };
    });
    return reply.send(buildPaginatedResponse(rows, total, pagination));
  });

  // GET /users/:id
  app.get("/users/:id", async (req, reply) => {
    const { id } = UserIdParam.parse(req.params);
    const user = await repo.findUserById(id);
    if (!user) throw new NotFoundError("User not found");
    return reply.send(user);
  });

  // PATCH /users/:id/suspend
  app.patch("/users/:id/suspend", async (req, reply) => {
    const { id } = UserIdParam.parse(req.params);
    const { is_suspended } = SuspendPatch.parse(req.body);
    const user = await repo.findUserById(id);
    if (!user) throw new NotFoundError("User not found");

    // account_status: 0 = suspended, 1 = active
    const account_status = is_suspended ? 0 : 1;
    await repo.updateUser(id, { account_status });
    await invalidatePrefix(USERS_CACHE_PREFIX); // suspension must show in the list immediately
    await repo.logAdminAction(Number(req.auth.sub), is_suspended ? "USER_SUSPENDED" : "USER_UNSUSPENDED", "user", undefined, { user_id: id });
    return reply.send({ success: true, is_suspended });
  });
}
