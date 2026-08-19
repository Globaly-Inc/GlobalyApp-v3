/**
 * Import the V2 extraction pipeline + AI knowledge data into V3.
 *
 *   npm run import:v2 -- --source "postgres://user:pass@host:5432/globaly_v2_import" [flags]
 *
 * Flags:
 *   --enqueue          Publish the run to the IMPORT_V2 queue instead of running inline
 *                      (the import-v2 worker picks it up — npm run job:import-v2).
 *   --dry-run          Report what would move, write nothing. Always run this first.
 *   --only a,b         Restrict to table groups: reference, jobs, staged, junctions, ops, knowledge
 *   --tables a,b       Restrict to specific table names
 *   --batch 500        Rows per insert (default 500)
 *   --admin-id 1       Owner id substituted for V2's auth.users uuids (default 1)
 *   --source-schema s  Schema the dump restored into (default public)
 *
 * Core logic lives in src/modules/superadmin/data-extraction/lib/import-v2.ts,
 * shared with the LavinMQ worker.
 */

import "dotenv/config";
import { masterKnex } from "../src/core/db/master-pool.js";
import { queueService } from "../src/shared/queue/queueService.js";
import { EXTRACTION_QUEUES } from "../src/modules/superadmin/data-extraction/shared/queues.js";
import { runImport, type ImportOptions } from "../src/modules/superadmin/data-extraction/lib/import-v2.js";

function parseArgs(argv: string[]): ImportOptions & { enqueue: boolean } {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  const source = get("--source") ?? process.env.V2_DATABASE_URL;
  if (!source) {
    console.error("Missing --source (or V2_DATABASE_URL). Point it at the restored V2 dump.");
    process.exit(1);
  }
  const csv = (v: string | undefined) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : null);
  return {
    source,
    enqueue: argv.includes("--enqueue"),
    dryRun: argv.includes("--dry-run"),
    only: csv(get("--only")),
    tables: csv(get("--tables")),
    batch: Number(get("--batch") ?? 500),
    adminId: Number(get("--admin-id") ?? 1),
    sourceSchema: get("--source-schema") ?? "public",
  };
}

async function main() {
  const { enqueue, ...options } = parseArgs(process.argv.slice(2));

  if (enqueue) {
    await queueService.publish(EXTRACTION_QUEUES.IMPORT_V2, options);
    console.log(`Import run published to ${EXTRACTION_QUEUES.IMPORT_V2} — watch the import-v2 worker logs.`);
    await queueService.close();
    return;
  }

  const result = await runImport(options);

  console.log(`\n  ${"table".padEnd(46)}${"rows".padStart(8)}${"written".padStart(9)}  notes`);
  console.log(`  ${"-".repeat(46)}${"-".padStart(8, "-")}${"-".padStart(9, "-")}  ${"-".repeat(20)}`);
  for (const t of result.perTable) {
    console.log(`  ${t.table.padEnd(46)}${String(t.read ?? "—").padStart(8)}${String(t.written ?? "—").padStart(9)}  ${t.notes}`);
  }
  console.log(`\n  read ${result.totalRead}, written ${result.totalWritten}`);
  if (result.missing.length) console.log(`\n  not present in source (${result.missing.length}): ${result.missing.join(", ")}`);
  if (result.warnings.length) {
    console.log("\n  warnings:");
    result.warnings.forEach((w) => console.log(`    - ${w}`));
  }
  if (options.dryRun) console.log("\n  DRY RUN — re-run without --dry-run to write.");
}

main()
  .then(async () => {
    await masterKnex.destroy();
  })
  .catch(async (e) => {
    console.error("Import failed:", e);
    await masterKnex.destroy().catch(() => {});
    process.exit(1);
  });
