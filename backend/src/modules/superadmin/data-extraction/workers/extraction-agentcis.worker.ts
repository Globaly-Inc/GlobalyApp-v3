// Worker — consumes "extraction_agentcis" queue.
// Fetches an institution from AgentCIS by ID, then stages it via lib/agentcis-staging.ts.
//
// Run with: npm run job:extraction-agentcis

import "dotenv/config";
import { queueService } from "../../../../shared/queue/queueService.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { masterKnex } from "../../../../core/db/master-pool.js";
import { EXTRACTION_QUEUES } from "../shared/queues.js";
import { SUPERADMIN_SCHEMA as S } from "../../consts.js";
import { agentcisBaseUrl, fetchAgentcisSearchPage } from "../lib/agentcis-client.js";
import { stageAgentcisInstitution } from "../lib/agentcis-staging.js";

const logger = createChildLogger("extraction-agentcis-worker");

const PAGE_SIZE = 50;

async function fetchInstitutionById(id: string): Promise<Record<string, unknown> | null> {
  if (!agentcisBaseUrl()) return null;

  // Strategy 1: filter by id
  try {
    const params = new URLSearchParams();
    params.set("filter[id]", id);
    params.set("include", "branches,products,country,city");
    params.set("page[size]", "5");
    const data = await fetchAgentcisSearchPage(params);
    const match = data.find((d) => String(d.id) === id) || data[0];
    if (match) return match;
  } catch (e) {
    logger.warn("Filter fetch failed", { id, error: (e as Error).message });
  }

  // Strategy 2: paginate up to 5 pages
  for (let page = 1; page <= 5; page++) {
    let data: Record<string, unknown>[];
    try {
      const params = new URLSearchParams();
      params.set("page[number]", String(page));
      params.set("page[size]", String(PAGE_SIZE));
      params.set("include", "branches,products");
      data = await fetchAgentcisSearchPage(params);
    } catch {
      break;
    }
    if (!data.length) break;
    const match = data.find((d) => String(d.id) === id);
    if (match) return match;
    if (data.length < PAGE_SIZE) break;
  }

  return null;
}

async function recordFailedJob(institutionId: string, message: string): Promise<void> {
  await masterKnex(`${S}.extraction_jobs`).insert({
    institution_name: `AgentCIS #${institutionId}`,
    institution_url: `https://agentcis.com/institution/${institutionId}`,
    status: "failed",
    source_type: "agentcis",
    aggregator_name: "AgentCIS",
    error_message: message,
    pipeline_progress: JSON.stringify({ phase: "failed", error: message, agentcis_id: institutionId }),
    processing_heartbeat_at: masterKnex.fn.now(),
  });
}

await queueService.consume(EXTRACTION_QUEUES.AGENTCIS, async (msg) => {
  let institutionId: string;
  try {
    ({ institutionId } = JSON.parse(msg!.content.toString()));
  } catch {
    logger.error("Malformed queue message, discarding", { raw: msg?.content.toString().slice(0, 200) });
    return;
  }
  logger.info("Received AgentCIS import", { institutionId });

  if (!agentcisBaseUrl()) {
    logger.warn("AGENTCIS_BASE_URL not configured — skipping", { institutionId });
    return;
  }

  try {
    const inst = await fetchInstitutionById(institutionId);
    if (!inst) {
      logger.warn("Institution not found in AgentCIS", { institutionId });
      await recordFailedJob(institutionId, `Institution id=${institutionId} not found in AgentCIS`);
      return;
    }

    const jobId = await stageAgentcisInstitution(inst, institutionId);
    logger.info("AgentCIS import complete", { institutionId, jobId });
  } catch (e) {
    const msg = (e as Error).message;
    logger.error("AgentCIS import failed", { institutionId, error: msg });
    await recordFailedJob(institutionId, msg);
  }
});

logger.info(`AgentCIS import worker started — consuming "${EXTRACTION_QUEUES.AGENTCIS}" queue`);
