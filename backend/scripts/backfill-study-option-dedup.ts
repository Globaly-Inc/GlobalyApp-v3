/**
 * Collapse duplicate extraction_study_options rows within a job onto ONE shared row per distinct
 * (study_mode, study_load, duration_value, duration_unit) tuple — the sharing upsertStudyOption
 * (staging-writer.ts) now enforces at write time. Repairs data staged before that fix.
 *
 *   node --import tsx scripts/backfill-study-option-dedup.ts --job <id> [--apply]
 *   node --import tsx scripts/backfill-study-option-dedup.ts --all [--apply]
 *
 * No model call, no scrape — pure DB dedup, free and repeatable.
 */
import "dotenv/config";
import { masterKnex } from "../src/core/db/master-pool.js";

const S = "superadmin";
const OPTIONS = `${S}.extraction_study_options`;
const ASSIGNMENTS = `${S}.extraction_course_study_option_assignments`;

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const all = args.includes("--all");
const jobIdx = args.indexOf("--job");
const jobId = jobIdx > -1 ? args[jobIdx + 1] : null;

if (!all && (!jobId || jobId.startsWith("--"))) {
  console.error("usage: backfill-study-option-dedup.ts (--job <id> | --all) [--apply]");
  process.exit(2);
}

interface OptionRow {
  id: string;
  name: string | null;
  study_mode: string | null;
  study_load: string | null;
  duration_value: number | null;
  duration_unit: string | null;
  created_at: string;
}

function signature(o: OptionRow): string {
  return [o.study_mode ?? "", o.study_load ?? "", o.duration_value ?? "", o.duration_unit ?? ""].join("|");
}

async function dedupJob(targetJobId: string): Promise<{ groups: number; dropped: number }> {
  const rows: OptionRow[] = await masterKnex(OPTIONS)
    .where({ job_id: targetJobId })
    .orderBy("created_at", "asc")
    .select("id", "name", "study_mode", "study_load", "duration_value", "duration_unit", "created_at");

  const buckets = new Map<string, OptionRow[]>();
  for (const r of rows) {
    const key = signature(r);
    buckets.set(key, [...(buckets.get(key) ?? []), r]);
  }

  let groups = 0, dropped = 0;
  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue;
    const [keep, ...dupes] = bucket; // earliest-created survives
    groups++;
    dropped += dupes.length;

    const durationLabel = keep.duration_value != null
      ? `${keep.duration_value} ${keep.duration_unit ?? ""}`.trim()
      : (keep.duration_unit ?? "no duration");
    const label = `${keep.study_mode ?? "no mode"} / ${keep.study_load ?? "no load"} / ${durationLabel}`;
    console.log(`  ${apply ? "MERGE" : "would merge"} ${bucket.length} rows -> 1  ("${label}")`);

    if (!apply) continue;

    // Fill the survivor's blank name from a copy before anything is deleted; never overwrite one
    // it already has — the same rule upsertStudyOption applies going forward.
    if (keep.name == null) {
      const donor = dupes.find((d) => d.name != null);
      if (donor) {
        await masterKnex(OPTIONS).where({ id: keep.id }).update({ name: donor.name, updated_at: masterKnex.fn.now() });
      }
    }

    // Repoint every course onto the survivor FIRST — a copy's assignment rows cascade away with
    // it, so deleting before this would lose the course links entirely.
    for (const dup of dupes) {
      const courseIds: string[] = await masterKnex(ASSIGNMENTS).where({ study_option_id: dup.id }).pluck("course_id");
      for (const courseId of courseIds) {
        await masterKnex(ASSIGNMENTS)
          .insert({ job_id: targetJobId, course_id: courseId, study_option_id: keep.id })
          .onConflict(["course_id", "study_option_id"]).ignore();
      }
    }
    await masterKnex(OPTIONS).whereIn("id", dupes.map((d) => d.id)).delete();
  }
  return { groups, dropped };
}

async function main() {
  const jobs: string[] = all
    ? await masterKnex(OPTIONS).distinct("job_id").pluck("job_id")
    : [jobId as string];

  let totalGroups = 0, totalDropped = 0;
  for (const j of jobs) {
    const { groups, dropped } = await dedupJob(j);
    if (groups > 0) {
      console.log(`job ${j}: ${groups} duplicate groups, ${dropped} rows ${apply ? "removed" : "would be removed"}`);
      totalGroups += groups;
      totalDropped += dropped;
    }
  }

  console.log(`\ntotal: ${totalGroups} duplicate groups, ${totalDropped} rows ${apply ? "removed" : "would be removed"}`);
  if (!apply) console.log("\nDRY RUN — pass --apply to write.");
  await masterKnex.destroy();
}

main().catch((err) => { console.error(err); process.exit(1); });
