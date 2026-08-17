// Assignment junctions — how one reusable fee / requirement / study option is
// shared across several services in the same tenant.

import type { FastifyInstance } from "fastify";
import { requireBusinessContext } from "../../../core/plugins/auth.plugin.js";
import { SERVICE_ASSIGNMENTS, type AssignmentKey } from "../../superadmin/platform/business-services/consts.js";
import {
  ASSIGNMENT_SCHEMAS,
  AssignmentTargetParamsSchema,
  ServiceParamsSchema,
} from "../../superadmin/platform/business-services/schemas/business-services.schema.js";
import * as service from "../../superadmin/platform/business-services/services/business-services.service.js";

const guard = { preHandler: requireBusinessContext };

export async function serviceAssignmentRoutes(app: FastifyInstance) {
  for (const key of Object.keys(SERVICE_ASSIGNMENTS) as AssignmentKey[]) {
    const base = `/:id/assignments/${key}`;
    const bodySchema = ASSIGNMENT_SCHEMAS[key];

    app.get(base, guard, async (req, reply) => {
      const { id } = ServiceParamsSchema.parse(req.params);
      return reply.send(await service.listAssignments(req.db, key, id));
    });

    app.post(base, guard, async (req, reply) => {
      const { id } = ServiceParamsSchema.parse(req.params);
      const input = bodySchema.parse(req.body) as Record<string, unknown>;
      return reply.status(201).send(await service.createAssignment(req.db, key, id, input));
    });

    app.delete(`${base}/:targetId`, guard, async (req, reply) => {
      const { id, targetId } = AssignmentTargetParamsSchema.parse(req.params);
      return reply.send(await service.deleteAssignment(req.db, key, id, targetId));
    });
  }
}
