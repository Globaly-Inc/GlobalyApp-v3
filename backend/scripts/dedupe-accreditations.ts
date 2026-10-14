/**
 * Merge duplicate rows in superadmin.extraction_accreditations. Dry run by default.
 *
 *   node --import tsx scripts/dedupe-accreditations.ts                dry run — groups + counts
 *   node --import tsx scripts/dedupe-accreditations.ts --apply        writes
 *   node --import tsx scripts/dedupe-accreditations.ts --key name     name only
 *
 * --key name+org (default) merges rows agreeing on BOTH name and issuing organization.
 * --key name merges on lower(trim(name)) alone — the key 20261012_001's unique index is built on,
 * so only that run guarantees `npm run migrate:superadmin` gets past it.
 *
 * Oldest row in the group survives and the later ones are deleted; the survivor's blank
 * website/issuing_organization/description are filled from them, and every
 * extraction_course_accreditation_assignments row pointing at a deleted id is repointed first.
 */
import "dotenv/config";
import { masterKnex } from "../src/core/db/master-pool.js";

const apply = process.argv.includes("--apply");
// `indexOf` returns -1 when the flag is absent, and argv[-1 + 1] is the node binary — truthy, so
// the `??` default never fired and BOTH documented runs above died on "invalid key" before
// doing anything. Index first, same guard every other backfill script in here uses. A bare
// `--key` with no value stays an error rather than silently becoming the default.
const keyIdx = process.argv.indexOf("--key");
const keyArg = keyIdx === -1 ? "name+org" : process.argv[keyIdx + 1] ?? "";

// Postgres computes the key, not JS: SQL trim() strips spaces only, "".trim() strips all
// whitespace, and 20261012_001's index is the SQL one. A NULL org folds to '' so two org-less
// rows of the same name stay one group.
const NAME_KEY = "lower(trim(name))";
const KEYS: Record<string, string> = {
  "name": NAME_KEY,
  // A structured pair, not a joined string: with a plain '|' separator, name "A|B" + org "C" and
  // name "A" + org "B|C" both key to a|b|c, and this script DELETES the rows it decides are the
  // same (Greptile). No row carries a pipe today — this is the guard, not a repair.
  "name+org": `json_build_array(${NAME_KEY}, coalesce(lower(trim(issuing_organization)), ''))::text`,
};
const keySql = KEYS[keyArg];
if (!keySql) { console.error(`--key must be one of: ${Object.keys(KEYS).join(", ")}`); process.exit(1); }

const T = "superadmin.extraction_accreditations";
const A = "superadmin.extraction_course_accreditation_assignments";
const FILLABLE = ["website", "issuing_organization", "description"] as const;

type Row = { id: string; name: string; k: string } & Record<(typeof FILLABLE)[number], string | null>;

class Rollback extends Error {}
class Conflict extends Error {}

async function main() {
  let dupes: Row[][] = [];
  let dropped = 0, repointed = 0, deleted = 0;
  const conflicts: string[] = [];

  await masterKnex.transaction(async (trx) => {
    // Everything, the READ included, happens under this lock. Without it the donor fill below
    // writes back a snapshot taken before the transaction: an admin who fills a blank website in
    // between has it overwritten by the donor's value. Worse on the assignment side — the FK is
    // ON DELETE CASCADE, so a link added to a loser after the repoint is not an error when that
    // loser is deleted, it is silently cascaded away (Greptile).
    //
    // SHARE ROW EXCLUSIVE blocks writers on these two tables and still lets everything else READ,
    // which is what a short cleanup wants. lock_timeout so a long extraction transaction makes
    // this script fail in 30s instead of queueing behind it and holding the pipeline open.
    await trx.raw("SET LOCAL lock_timeout = '30s'");
    await trx.raw(`LOCK TABLE ${T}, ${A} IN SHARE ROW EXCLUSIVE MODE`);

    const rows: Row[] = await trx(T)
      .select("id", "name", ...FILLABLE)
      .select(trx.raw(`${keySql} as k`))
      .orderBy([{ column: "created_at" }, { column: "id" }]);

    const groups = new Map<string, Row[]>();
    for (const r of rows) groups.set(r.k, [...(groups.get(r.k) ?? []), r]);
    dupes = [...groups.values()].filter((g) => g.length > 1);

    for (const g of dupes) {
      const keep = g[0]!;
      const ids = g.map((r) => r.id);
      const losers = ids.slice(1);

      const fill: Record<string, string> = {};
      for (const col of FILLABLE) if (!keep[col]) { const donor = g.find((r) => r[col]); if (donor) fill[col] = donor[col]!; }
      if (Object.keys(fill).length) await trx(T).where({ id: keep.id }).update(fill);

      // An assignment row is not just a pointer — it carries `accreditation_id` (the course's
      // mapping into the lookup library) and `is_awarded_by`. The DELETE below keeps ONE row per
      // course and drops the rest, so anything held only by a dropped row goes with it. Two
      // passes before it: refuse outright when two rows disagree on the library mapping, then
      // roll what survives onto the keeper.
      //
      // Disagreement is not ours to settle — picking one mapping would silently rewrite a
      // curated choice — so it aborts the whole run, --apply included, and names the courses.
      const clash: { rows: Array<{ course_id: string; ids: number[] }> } = await trx.raw(
        `SELECT course_id, array_agg(DISTINCT accreditation_id ORDER BY accreditation_id) AS ids
           FROM ${A}
          WHERE extraction_accreditation_id = ANY(?) AND course_id IS NOT NULL
            AND accreditation_id IS NOT NULL
          GROUP BY course_id HAVING count(DISTINCT accreditation_id) > 1`,
        [ids],
      );
      for (const c of clash.rows) conflicts.push(`  course ${c.course_id} maps to ${c.ids.join(" and ")} under ${keep.name}`);

      // Delete and salvage in ONE step, and merge onto the survivor only AFTER — never before.
      // `idx_eca_awarded_by_per_course` is UNIQUE (course_id) WHERE is_awarded_by, so setting the
      // survivor's flag while the donor row still carries it is a unique violation that aborts the
      // whole run. The donor has to be gone first, which means its values come back out of the
      // DELETE rather than being read before it.
      //
      // One assignment per course across the whole group, or the repoint below trips
      // unique(course_id, extraction_accreditation_id). course_id IS NULL rows never collide
      // (NULLs are distinct in a unique index), so they are left alone and repointed as-is.
      const gone: { rowCount: number | null; rows: Array<{ course_id: string; accreditation_id: number | null; is_awarded_by: boolean }> } =
        await trx.raw(
          `WITH ranked AS (
             SELECT id, row_number() OVER (
               PARTITION BY course_id
               ORDER BY (extraction_accreditation_id = ?) DESC, created_at, id
             ) AS rn
             FROM ${A} WHERE extraction_accreditation_id = ANY(?) AND course_id IS NOT NULL
           )
           DELETE FROM ${A} WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
           RETURNING course_id, accreditation_id, is_awarded_by`,
          [keep.id, ids],
        );
      dropped += gone.rowCount ?? 0;

      // What the dropped rows held, folded onto the one row left for that course. `is_awarded_by`
      // is OR-ed — awarded-by on any duplicate means the course is awarded by the body they all
      // are. A NULL mapping takes the dropped one, unambiguous because the clash check above
      // already aborted on two different mappings. Exactly one row per course survives among
      // `ids`, so this WHERE names it without needing its id.
      const salvage = new Map<string, { awarded: boolean; mapped: number | null }>();
      for (const r of gone.rows) {
        const prev = salvage.get(r.course_id) ?? { awarded: false, mapped: null };
        salvage.set(r.course_id, { awarded: prev.awarded || r.is_awarded_by, mapped: prev.mapped ?? r.accreditation_id });
      }
      for (const [courseId, v] of salvage) {
        if (!v.awarded && v.mapped == null) continue;
        await trx.raw(
          `UPDATE ${A}
              SET is_awarded_by = is_awarded_by OR ?,
                  accreditation_id = coalesce(accreditation_id, ?)
            WHERE course_id = ? AND extraction_accreditation_id = ANY(?)`,
          [v.awarded, v.mapped, courseId, ids],
        );
      }
      repointed += await trx(A).whereIn("extraction_accreditation_id", losers).update({ extraction_accreditation_id: keep.id });
      deleted += await trx(T).whereIn("id", losers).del();
    }
    // After every group, so one run names every clash instead of one per invocation. Throwing
    // rolls back the whole transaction — nothing is written even with --apply.
    if (conflicts.length) throw new Conflict();
    if (!apply) throw new Rollback();
  // Both are our own signals to roll back, not failures: the report below is the output.
  }).catch((e) => { if (!(e instanceof Rollback) && !(e instanceof Conflict)) throw e; });

  if (conflicts.length) {
    console.error(`\nRefusing to merge: ${conflicts.length} course(s) disagree on the lookup-library mapping.`);
    console.error("Nothing was written. Resolve these by hand, then re-run:\n" + conflicts.join("\n"));
    process.exitCode = 1;
    return;
  }

  const verb = apply ? "" : "would be ";
  console.log(`\n${dupes.length} duplicate groups under ${keyArg}.`);
  for (const g of dupes.slice(0, 25)) console.log(`  ${g[0]!.k}  <-  ${g.map((r) => JSON.stringify(r.name)).join(", ")}`);
  if (dupes.length > 25) console.log(`  ...and ${dupes.length - 25} more`);
  console.log(`\n${deleted} accreditation rows ${verb}deleted`);
  console.log(`${repointed} assignments ${verb}repointed, ${dropped} duplicate assignments ${verb}dropped`);
  if (!apply) console.log("\nDry run — pass --apply to write.");

  // name+org leaves same-name/different-org rows behind, and those still break the index.
  const left = await masterKnex
    .count<{ count: string }>("* as count")
    .from(masterKnex(T).select(masterKnex.raw(`${NAME_KEY} as k`)).groupByRaw(NAME_KEY).havingRaw("count(*) > 1").as("d"))
    .first();
  const n = Number(left?.count ?? 0);
  if (n) console.log(`\n${n} lower(trim(name)) collisions remain${apply ? "" : " (nothing was written)"} — migrate:superadmin needs --key name --apply.`);
  else console.log("\nNo lower(trim(name)) collisions — migrate:superadmin will build the index.");
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => masterKnex.destroy());
