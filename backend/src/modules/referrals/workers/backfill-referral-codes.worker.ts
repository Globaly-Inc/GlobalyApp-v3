// Worker — issues referral codes for any platform_user or business that has none.
//
// This is the RECOVERY half of INV-10. issueCode never throws, so a registration can legitimately
// complete without a code (a transient DB fault, exhausted collision retries). Without this sweep the
// plan would be self-contradictory: registration cannot fail, issuance can fail, and no product
// surface is allowed to create a code — so something has to repair the gap.
//
// One-shot: process what is missing, then exit. Same shape as extraction-schedule.worker.ts.
// Run with: npm run job:referral-codes
//
// ponytail: setInterval-free one-shot like the extraction workers; a real scheduler when there are
// more jobs than cron lines.

import "dotenv/config";
import { masterKnex } from "../../../core/db/master-pool.js";
import { createChildLogger } from "../../../shared/logger.js";
import type { OwnerType } from "../../credits/credits.repository.js";
import { issueCode } from "../services/codes.service.js";
import * as repo from "../repositories/referrals.repository.js";

const logger = createChildLogger("referral-codes-worker");

const BATCH = 500;

async function repair(ownerType: OwnerType): Promise<{ repaired: number; failed: number }> {
  let repaired = 0;
  let failed = 0;

  for (;;) {
    const ids = await repo.findOwnersMissingCode(ownerType, BATCH);
    if (ids.length === 0) break;

    for (const ownerId of ids) {
      // Same idempotent path the live registration uses — ON CONFLICT DO NOTHING on the owner
      // constraint, so racing a concurrent registration cannot produce a duplicate. Running this
      // worker twice in a row is therefore a no-op the second time.
      const code = await issueCode(ownerType, ownerId);
      if (code) repaired++;
      else failed++;
    }

    // If a whole batch failed, the ids come back unchanged next pass and this would spin. Stop and let
    // the alert on the logged errors be the signal instead.
    if (repaired === 0 && failed > 0) break;
    if (ids.length < BATCH) break;
  }

  return { repaired, failed };
}

async function main() {
  const users = await repair("user");
  const businesses = await repair("business");

  logger.info("referral code reconciliation complete", {
    users_repaired: users.repaired,
    users_failed: users.failed,
    businesses_repaired: businesses.repaired,
    businesses_failed: businesses.failed,
  });

  await masterKnex.destroy();
  // Non-zero exit when anything is still missing, so a scheduler surfaces it rather than swallowing it.
  process.exit(users.failed + businesses.failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  logger.error("referral code reconciliation failed", { err: (err as Error).message });
  await masterKnex.destroy();
  process.exit(1);
});
