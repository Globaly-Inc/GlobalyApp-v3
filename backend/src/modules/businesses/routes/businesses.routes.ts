// Business routes — registration (any authenticated user) + profile management (business context required).

import type { FastifyInstance } from "fastify";
import {
  BusinessRegisterSchema, BusinessProfilePatchSchema, BusinessSearchQuerySchema, ClaimAcceptSchema, ClaimRequestByEmailSchema,
  AiAssistSchema, StartExtractionSchema, SiteUrlsQuerySchema, SiteUrlSnapshotQuerySchema, SiteUrlSnapshotUpdateSchema,
  SiteUrlRefreshSchema,
} from "../schemas/businesses.schema.js";
import { requireBusinessContext, requireBusinessOrInstitutionContext } from "../../../core/plugins/auth.plugin.js";
import * as service from "../services/businesses.service.js";

export async function businessRoutes(app: FastifyInstance) {
  app.post("/claim/accept", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const { token, first_name, last_name } = ClaimAcceptSchema.parse(req.body);
    const result = await service.acceptClaim(token, { first_name, last_name });
    return reply.send(result);
  });

  // Self-serve: triggered from the registration page when the email matches an unclaimed pre-seeded business.
  app.post("/claim/request", {
    config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
  }, async (req, reply) => {
    const { email } = ClaimRequestByEmailSchema.parse(req.body);
    await service.requestClaimByEmail(email);
    return reply.send({ message: "If a business profile matches, we've sent a claim link to that email." });
  });

  // Auth-required: Register business (any platform user can create a business)
  app.post("/register", {
    config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
  }, async (req, reply) => {
    const input = BusinessRegisterSchema.parse(req.body);
    const result = await service.registerBusiness(Number(req.auth.sub), input);
    return reply.status(201).send(result);
  });

  app.get("/search", { preHandler: requireBusinessOrInstitutionContext }, async (req, reply) => {
    const { search, limit, include_institutions, for_partner_link } = BusinessSearchQuerySchema.parse(req.query);
    const result = await service.searchBusinesses(req.auth, search, limit, include_institutions, for_partner_link);
    return reply.send(result);
  });

  // Business context required: Get business profile
  app.get("/me", { preHandler: requireBusinessContext }, async (req, reply) => {
    const result = await service.getProfile(req.auth.orgId!);
    return reply.send(result);
  });

  // Business context required: Update business profile
  app.patch("/me", { preHandler: requireBusinessContext }, async (req, reply) => {
    const data = BusinessProfilePatchSchema.parse(req.body);
    const result = await service.updateProfile(req.auth.orgId!, data);
    return reply.send(result);
  });

  app.post("/me/start-extraction", {
    preHandler: requireBusinessContext,
    config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
  }, async (req, reply) => {
    const input = StartExtractionSchema.parse(req.body);
    const result = await service.startExtraction(req.auth.orgId!, Number(req.auth.sub), input);
    return reply.status(201).send(result);
  });

  app.get("/me/extraction-status", { preHandler: requireBusinessContext }, async (req, reply) => {
    const result = await service.getExtractionStatus(req.auth.orgId!);
    return reply.send(result);
  });

  app.get("/me/extraction-site-urls", { preHandler: requireBusinessContext }, async (req, reply) => {
    const query = SiteUrlsQuerySchema.parse(req.query);
    const result = await service.getExtractionSiteUrls(req.auth.orgId!, query);
    return reply.send(result);
  });

  app.get("/me/extraction-site-urls/snapshot", {
    preHandler: requireBusinessContext,
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const query = SiteUrlSnapshotQuerySchema.parse(req.query);
    const result = await service.getExtractionSiteUrlSnapshot(req.auth.orgId!, query);
    return reply.send(result);
  });

  app.patch("/me/extraction-site-urls/snapshot", {
    preHandler: requireBusinessContext,
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const input = SiteUrlSnapshotUpdateSchema.parse(req.body);
    const result = await service.updateExtractionSiteUrlSnapshot(req.auth.orgId!, input, Number(req.auth.sub));
    return reply.send(result);
  });

  // Synchronous, not queued — capped at 10 URLs (SiteUrlRefreshSchema) so this stays inside a
  // normal request timeout instead of needing the pipeline's batch/queue machinery.
  app.post("/me/extraction-site-urls/refresh", {
    preHandler: requireBusinessContext,
    config: { rateLimit: { max: 5, timeWindow: "5 minutes" } },
  }, async (req, reply) => {
    const input = SiteUrlRefreshSchema.parse(req.body);
    const result = await service.refreshExtractionSiteUrls(req.auth.orgId!, input, Number(req.auth.sub));
    return reply.send(result);
  });

  app.get("/me/onboarding", { preHandler: requireBusinessContext }, async (req, reply) => {
    const result = await service.getOnboardingProgress(req.auth.orgId!);
    return reply.send(result);
  });

  app.post("/me/onboarding/review-courses", { preHandler: requireBusinessContext }, async (req, reply) => {
    const result = await service.markOnboardingCoursesReviewed(req.auth.orgId!);
    return reply.send(result);
  });

  app.get("/me/widget-analytics", { preHandler: requireBusinessContext }, async (req, reply) => {
    const result = await service.getMyWidgetAnalytics(req.auth.orgId!);
    return reply.send(result);
  });

  // Business context required: AI-assisted profile copy — a draft to review, not to publish verbatim.
  app.post("/me/ai-assist", {
    preHandler: requireBusinessContext,
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    const input = AiAssistSchema.parse(req.body);
    const result = await service.generateProfileText(input);
    return reply.send(result);
  });
}
