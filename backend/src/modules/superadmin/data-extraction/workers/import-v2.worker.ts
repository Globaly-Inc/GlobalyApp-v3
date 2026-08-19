// Worker — runs V2 → V3 imports from the IMPORT_V2 queue.
// Message payload: ImportOptions (source optional — falls back to V2_DATABASE_URL).
// Enqueue with: npm run import:v2 -- --enqueue [flags]
// Run with: npm run job:import-v2

import "dotenv/config";
import { queueService } from "../../../../shared/queue/queueService.js";
import { createChildLogger } from "../../../../shared/logger.js";
import { EXTRACTION_QUEUES } from "../shared/queues.js";
import { runImport, type ImportOptions } from "../lib/import-v2.js";

const logger = createChildLogger("import-v2-worker");

await queueService.consume(EXTRACTION_QUEUES.IMPORT_V2, async (msg) => {
  if (!msg) return;
  const payload = JSON.parse(msg.content.toString()) as Partial<ImportOptions>;

  const source = payload.source ?? process.env.V2_DATABASE_URL;
  if (!source) throw new Error("Import message missing source and V2_DATABASE_URL is not set");

  const result = await runImport({ ...payload, source });
  logger.info("Import run finished", {
    read: result.totalRead,
    written: result.totalWritten,
    missing: result.missing,
    warnings: result.warnings,
  });
});

logger.info(`Import-v2 worker started — consuming "${EXTRACTION_QUEUES.IMPORT_V2}" queue`);
