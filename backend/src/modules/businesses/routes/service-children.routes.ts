// Tenant service catalog — child collections (fees, fee structures, intakes,
// eligibility), a fee structure's installments, and the schema-level reusable
// library of study options / units.
//
// Every route is generated from the frozen maps in the business-services module's
// consts.ts, so a URL segment is only ever a key lookup — it never becomes a
// table identifier.

import type { FastifyInstance } from "fastify";
import { requireBusinessContext } from "../../../core/plugins/auth.plugin.js";
import {
  SERVICE_CHILDREN,
  SERVICE_LIBRARY,
  type ChildKey,
  type LibraryKey,
} from "../../superadmin/platform/business-services/consts.js";
import {
  CHILD_SCHEMAS,
  ChildParamsSchema,
  INSTALLMENT_SCHEMAS,
  LIBRARY_SCHEMAS,
  LibraryParamsSchema,
  ServiceParamsSchema,
  StructureChildParamsSchema,
  StructureParamsSchema,
} from "../../superadmin/platform/business-services/schemas/business-services.schema.js";
import * as service from "../../superadmin/platform/business-services/services/business-services.service.js";

const guard = { preHandler: requireBusinessContext };

export async function serviceChildrenRoutes(app: FastifyInstance) {
  // ── Reusable library. Registered first for readability; find-my-way always
  //    prefers the static `/library/...` segment over `/:id` regardless of order.
  for (const key of Object.keys(SERVICE_LIBRARY) as LibraryKey[]) {
    const base = `/library/${key}`;
    const schemas = LIBRARY_SCHEMAS[key];

    app.get(base, guard, async (req, reply) => reply.send(await service.listLibrary(req.db, key)));

    app.post(base, guard, async (req, reply) => {
      const input = schemas.create.parse(req.body) as Record<string, unknown>;
      return reply.status(201).send(await service.createLibraryItem(req.db, key, input));
    });

    app.patch(`${base}/:childId`, guard, async (req, reply) => {
      const { childId } = LibraryParamsSchema.parse(req.params);
      const input = schemas.update.parse(req.body) as Record<string, unknown>;
      return reply.send(await service.updateLibraryItem(req.db, key, childId, input));
    });

    app.delete(`${base}/:childId`, guard, async (req, reply) => {
      const { childId } = LibraryParamsSchema.parse(req.params);
      return reply.send(await service.deleteLibraryItem(req.db, key, childId));
    });
  }

  // ── Per-service child collections ──
  for (const key of Object.keys(SERVICE_CHILDREN) as ChildKey[]) {
    const base = `/:id/${key}`;
    const schemas = CHILD_SCHEMAS[key];

    app.get(base, guard, async (req, reply) => {
      const { id } = ServiceParamsSchema.parse(req.params);
      return reply.send(await service.listChildren(req.db, key, id));
    });

    app.post(base, guard, async (req, reply) => {
      const { id } = ServiceParamsSchema.parse(req.params);
      const input = schemas.create.parse(req.body) as Record<string, unknown>;
      return reply.status(201).send(await service.createChild(req.db, key, id, input));
    });

    app.patch(`${base}/:childId`, guard, async (req, reply) => {
      const { id, childId } = ChildParamsSchema.parse(req.params);
      const input = schemas.update.parse(req.body) as Record<string, unknown>;
      return reply.send(await service.updateChild(req.db, key, id, childId, input));
    });

    app.delete(`${base}/:childId`, guard, async (req, reply) => {
      const { id, childId } = ChildParamsSchema.parse(req.params);
      return reply.send(await service.deleteChild(req.db, key, id, childId));
    });
  }

  // ── Fee structure installments ──
  const installments = "/:id/fee-structures/:structureId/installments";

  app.get(installments, guard, async (req, reply) => {
    const { id, structureId } = StructureParamsSchema.parse(req.params);
    return reply.send(await service.listInstallments(req.db, id, structureId));
  });

  app.post(installments, guard, async (req, reply) => {
    const { id, structureId } = StructureParamsSchema.parse(req.params);
    const input = INSTALLMENT_SCHEMAS.create.parse(req.body) as Record<string, unknown>;
    return reply.status(201).send(await service.createInstallment(req.db, id, structureId, input));
  });

  app.delete(`${installments}/:childId`, guard, async (req, reply) => {
    const { id, structureId, childId } = StructureChildParamsSchema.parse(req.params);
    return reply.send(await service.deleteInstallment(req.db, id, structureId, childId));
  });
}
