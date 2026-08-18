// Business-owner ambassador management, under /api/v3/business/ambassadors
// behind requireBusinessContext.
//
// The business id comes from req.business — resolved by tenant.plugin from the
// JWT's orgId — and never from the path or body. That is the cross-tenant
// isolation story: business B's program is a 404 for business A, not a 403
// (which would confirm it exists).

import type { FastifyInstance, FastifyRequest } from "fastify";
import { requireBusinessContext } from "../../../core/plugins/auth.plugin.js";
import {
  AnalyticsQuerySchema,
  ApplicationIdParamSchema,
  ApplicationParamSchema,
  CreateProgramSchema,
  InquiryIdParamSchema,
  ListInquiriesQuerySchema,
  ListProgramsQuerySchema,
  NoteSchema,
  ProgramIdParamSchema,
  ReviewApplicationSchema,
  UpdateProgramSchema,
} from "../schemas/ambassadors.schema.js";
import * as programs from "../services/programs.service.js";
import * as engagement from "../services/engagement.service.js";

/** BusinessRecord.id is declared string in core/types.ts but the column is a
 *  serial — Number() narrows it, matching billing/routes/context.ts. */
function businessId(req: FastifyRequest): number {
  return Number(req.business!.id);
}

export async function businessAmbassadorRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireBusinessContext);

  // ── Programs ──────────────────────────────────────────────────────────────
  app.get("/programs", async (req, reply) => {
    const query = ListProgramsQuerySchema.parse(req.query);
    return reply.send(await programs.listPrograms(businessId(req), query));
  });

  app.post("/programs", async (req, reply) => {
    const body = CreateProgramSchema.parse(req.body);
    return reply
      .code(201)
      .send(await programs.createProgram(businessId(req), Number(req.auth.sub), body));
  });

  app.get("/programs/:programId", async (req, reply) => {
    const { programId } = ProgramIdParamSchema.parse(req.params);
    return reply.send(await programs.getProgram(businessId(req), programId));
  });

  app.patch("/programs/:programId", async (req, reply) => {
    const { programId } = ProgramIdParamSchema.parse(req.params);
    const body = UpdateProgramSchema.parse(req.body);
    return reply.send(await programs.updateProgram(businessId(req), programId, body));
  });

  app.delete("/programs/:programId", async (req, reply) => {
    const { programId } = ProgramIdParamSchema.parse(req.params);
    return reply.send(await programs.deleteProgram(businessId(req), programId));
  });

  // ── Applications ──────────────────────────────────────────────────────────
  app.get("/programs/:programId/applications", async (req, reply) => {
    const { programId } = ProgramIdParamSchema.parse(req.params);
    return reply.send(await programs.listApplications(businessId(req), programId));
  });

  app.patch("/programs/:programId/applications/:applicationId", async (req, reply) => {
    const { programId, applicationId } = ApplicationParamSchema.parse(req.params);
    const body = ReviewApplicationSchema.parse(req.body);
    return reply.send(
      await programs.reviewApplication(businessId(req), programId, applicationId, body),
    );
  });

  app.get("/applications/:applicationId/notes", async (req, reply) => {
    const { applicationId } = ApplicationIdParamSchema.parse(req.params);
    return reply.send(await programs.getNote(businessId(req), applicationId));
  });

  app.put("/applications/:applicationId/notes", async (req, reply) => {
    const { applicationId } = ApplicationIdParamSchema.parse(req.params);
    const { notes } = NoteSchema.parse(req.body);
    return reply.send(await programs.saveNote(businessId(req), applicationId, notes));
  });

  // ── Roster + engagement ───────────────────────────────────────────────────
  app.get("/roster", async (req, reply) => reply.send(await programs.listRoster(businessId(req))));

  app.get("/inquiries", async (req, reply) => {
    const query = ListInquiriesQuerySchema.parse(req.query);
    return reply.send(await engagement.listInquiries(businessId(req), query));
  });

  app.get("/inquiries/:inquiryId/messages", async (req, reply) => {
    const { inquiryId } = InquiryIdParamSchema.parse(req.params);
    return reply.send(await engagement.getTranscript(businessId(req), inquiryId));
  });

  app.get("/analytics", async (req, reply) => {
    const { program_id } = AnalyticsQuerySchema.parse(req.query);
    return reply.send(await engagement.analytics(businessId(req), program_id));
  });
}
