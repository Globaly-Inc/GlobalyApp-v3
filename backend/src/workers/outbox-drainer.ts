// Outbox drainer — polls each business's job_outbox table and dispatches jobs.
// Strategy A: each business DB has its own job_outbox table.
// ponytail: swap to LavinMQ consumer when throughput demands it.

import { masterKnex } from "../core/db/master-pool.js";
import { getKnex } from "../core/db/pool-manager.js";
import { schemaName } from "../core/db/knex.js";
import { createChildLogger } from "../shared/logger.js";

const logger = createChildLogger("outbox-drainer");

async function drainLoop() {
  const businesses = await masterKnex("businesses")
    .select("id", "schema_name")
    .where("account_status", 1);

  for (const b of businesses) {
    const db = await getKnex(b.id, schemaName(b.schema_name));

    const jobs = await db
      .raw(
        `DELETE FROM job_outbox
         WHERE id IN (SELECT id FROM job_outbox ORDER BY created_at LIMIT 20 FOR UPDATE SKIP LOCKED)
         RETURNING *`,
      )
      .then((r: { rows: unknown[] }) => r.rows);

    for (const job of jobs) {
      await dispatch(job, b.id);
    }
  }
}

async function dispatch(job: unknown, businessId: string) {
  // ponytail: implement job dispatch logic per job type
  logger.info(`Processing job for business ${businessId}`, { job });
}

// Poll every 5s
setInterval(drainLoop, 5_000);
