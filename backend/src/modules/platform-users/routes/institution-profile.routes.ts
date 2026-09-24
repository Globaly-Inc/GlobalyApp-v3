// Self-service institution profile routes — institution context required.
// The institution twin of businesses' GET/PATCH /businesses/me.

import type { FastifyInstance } from "fastify";
import { requireInstitutionContext } from "../../../core/plugins/auth.plugin.js";
import {
  InstitutionProfilePatchSchema, StartExtractionSchema, SiteUrlsQuerySchema, SiteUrlSnapshotQuerySchema,
  SiteUrlSnapshotUpdateSchema, SiteUrlRefreshSchema,
} from "../schemas/institution-profile.schema.js";
import * as service from "../services/institution-profile.service.js";

export async function institutionProfileRoutes(app: FastifyInstance) {
  app.get("/me", { preHandler: requireInstitutionContext }, async (req, reply) => {
    const result = await service.getMyInstitution(req.institution!);
    return reply.send(result);
  });

  app.patch("/me", { preHandler: requireInstitutionContext }, async (req, reply) => {
    const data = InstitutionProfilePatchSchema.parse(req.body);
    const result = await service.updateMyInstitution(req.institutionId, data);
    return reply.send(result);
  });

  app.post("/me/start-extraction", {
    preHandler: requireInstitutionContext,
    config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
  }, async (req, reply) => {
    const input = StartExtractionSchema.parse(req.body);
    const result = await service.startExtraction(req.institution!, Number(req.auth.sub), input);
    return reply.status(201).send(result);
  });

  app.get("/me/extraction-status", { preHandler: requireInstitutionContext }, async (req, reply) => {
    const result = await service.getExtractionStatus(req.institution!);
    return reply.send(result);
  });

  app.get("/me/extraction-site-urls", { preHandler: requireInstitutionContext }, async (req, reply) => {
    const query = SiteUrlsQuerySchema.parse(req.query);
    const result = await service.getExtractionSiteUrls(req.institution!, query);
    return reply.send(result);
  });

  app.get("/me/extraction-site-urls/snapshot", {
    preHandler: requireInstitutionContext,
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const query = SiteUrlSnapshotQuerySchema.parse(req.query);
    const result = await service.getExtractionSiteUrlSnapshot(req.institution!, query);
    return reply.send(result);
  });

  app.patch("/me/extraction-site-urls/snapshot", {
    preHandler: requireInstitutionContext,
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const input = SiteUrlSnapshotUpdateSchema.parse(req.body);
    const result = await service.updateExtractionSiteUrlSnapshot(req.institution!, input, Number(req.auth.sub));
    return reply.send(result);
  });

  app.post("/me/extraction-site-urls/refresh", {
    preHandler: requireInstitutionContext,
    config: { rateLimit: { max: 5, timeWindow: "5 minutes" } },
  }, async (req, reply) => {
    const input = SiteUrlRefreshSchema.parse(req.body);
    const result = await service.refreshExtractionSiteUrls(req.institution!, input, Number(req.auth.sub));
    return reply.send(result);
  });

  app.get("/me/onboarding", { preHandler: requireInstitutionContext }, async (req, reply) => {
    const result = await service.getOnboardingProgress(req.institution!);
    return reply.send(result);
  });

  app.post("/me/onboarding/review-courses", { preHandler: requireInstitutionContext }, async (req, reply) => {
    const result = await service.markOnboardingCoursesReviewed(req.institution!);
    return reply.send(result);
  });

  app.get("/me/widget-analytics", { preHandler: requireInstitutionContext }, async (req, reply) => {
    const result = await service.getMyWidgetAnalytics(req.institution!);
    return reply.send(result);
  });
}
