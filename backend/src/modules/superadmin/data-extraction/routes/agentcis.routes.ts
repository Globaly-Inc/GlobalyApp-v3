// AgentCIS search + import routes.

import type { FastifyInstance } from "fastify";
import { AgentcisSearchSchema, AgentcisImportSchema, AgentcisBulkCrawlSchema } from "../schemas/agentcis.schema.js";
import * as service from "../services/agentcis.service.js";

export async function agentcisRoutes(app: FastifyInstance) {
  const adminId = (req: any) => Number(req.auth.sub);

  // POST /agentcis/search
  app.post("/agentcis/search", async (req, reply) => {
    const { query } = AgentcisSearchSchema.parse(req.body);
    const results = await service.searchAgentCIS(query);
    return reply.send({ results });
  });

  // POST /agentcis/import
  app.post("/agentcis/import", async (req, reply) => {
    const { institution_ids } = AgentcisImportSchema.parse(req.body);
    const { jobCount } = await service.importAgentCIS(institution_ids, adminId(req));
    return reply.status(202).send({ dispatched: true, job_count: jobCount });
  });

  // POST /agentcis/bulk-crawl — legacy V1 action: scan a page range of the unfiltered
  // listing and queue everything found, for when search-by-name isn't the goal.
  app.post("/agentcis/bulk-crawl", async (req, reply) => {
    const { start_page, max_pages } = AgentcisBulkCrawlSchema.parse(req.body);
    const { jobCount, pagesScanned } = await service.bulkCrawlAgentCIS(start_page, max_pages, adminId(req));
    return reply.status(202).send({ dispatched: true, job_count: jobCount, pages_scanned: pagesScanned });
  });
}
