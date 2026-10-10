// Worker — consumes "extraction_spreadsheet". Each message is one institution (sheet tab) whose
// rows the admin already mapped; the job row was created by the import endpoint.
//
// Run with: npm run job:extraction-spreadsheet

import "dotenv/config";
import { queueService } from "../../../../shared/queue/queueService.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { EXTRACTION_QUEUES } from "../shared/queues.js";
import { stageSpreadsheetInstitution } from "../lib/spreadsheet-staging.js";
import type { SpreadsheetImportInput } from "../schemas/spreadsheet-import.schema.js";

const logger = createChildLogger("extraction-spreadsheet-worker");

await queueService.consume(EXTRACTION_QUEUES.SPREADSHEET, async (msg) => {
  let payload: { jobId: string; website: string; input: SpreadsheetImportInput };
  try {
    payload = JSON.parse(msg!.content.toString());
  } catch {
    logger.error("Malformed queue message, discarding", { raw: msg?.content.toString().slice(0, 200) });
    return;
  }
  logger.info("Received spreadsheet import", { jobId: payload.jobId, rows: payload.input.rows.length });
  await stageSpreadsheetInstitution(payload.jobId, payload.input, payload.website);
  logger.info("Spreadsheet import complete", { jobId: payload.jobId });
});

logger.info(`Spreadsheet import worker started — consuming "${EXTRACTION_QUEUES.SPREADSHEET}" queue`);
