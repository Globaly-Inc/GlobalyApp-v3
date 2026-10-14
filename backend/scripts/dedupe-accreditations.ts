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
const keyArg = process.argv[process.argv.indexOf("--key") + 1] ?? "name+org";

// Postgres computes the key, not JS: SQL trim() strips spaces only, "".trim() strips all
// whitespace, and 20261012_001's index is the SQL one. A NULL org folds to '' so two org-less
// rows of the same name stay one group.
const NAME_KEY = "lower(trim(name))";
const KEYS: Record<string, string> = {
  "name": NAME_KEY,
  "name+org": `${NAME_KEY} || '|' || coalesce(lower(trim(issuing_organization)), '')`,
};
const keySql = KEYS[keyArg];
if (!keySql) { console.error(`--key must be one of: ${Object.keys(KEYS).join(", ")}`); process.exit(1); }

const T = "superadmin.extraction_accreditations";
const A = "superadmin.extraction_course_accreditation_assignments";
const FILLABLE = ["website", "issuing_organization", "description"] as const;

type Row = { id: string; name: string; k: string } & Record<(typeof FILLABLE)[number], string | null>;

class Rollback extends Error {}

async function main() {
  const rows: Row[] = await masterKnex(T)
    .select("id", "name", ...FILLABLE)
    .select(masterKnex.raw(`${keySql} as k`))
    .orderBy([{ column: "created_at" }, { column: "id" }]);

  const groups = new Map<string, Row[]>();
  for (const r of rows) groups.set(r.k, [...(groups.get(r.k) ?? []), r]);
  const dupes = [...groups.values()].filter((g) => g.length > 1);

  let dropped = 0, repointed = 0, deleted = 0;
  if (dupes.length) {
    await masterKnex.transaction(async (trx) => {
      for (const g of dupes) {
        const keep = g[0]!;
        const ids = g.map((r) => r.id);
        const losers = ids.slice(1);

        const fill: Record<string, string> = {};
        for (const col of FILLABLE) if (!keep[col]) { const donor = g.find((r) => r[col]); if (donor) fill[col] = donor[col]!; }
        if (Object.keys(fill).length) await trx(T).where({ id: keep.id }).update(fill);

        // One assignment per course across the whole group, or repointing trips
        // unique(course_id, extraction_accreditation_id). course_id IS NULL rows never collide
        // (NULLs are distinct in a unique index), so they are left alone and repointed as-is.
        const { rowCount } = await trx.raw(
          `WITH ranked AS (
             SELECT id, row_number() OVER (
               PARTITION BY course_id
               ORDER BY (extraction_accreditation_id = ?) DESC, created_at, id
             ) AS rn
             FROM ${A} WHERE extraction_accreditation_id = ANY(?) AND course_id IS NOT NULL
           )
           DELETE FROM ${A} WHERE id IN (SELECT id FROM ranked WHERE rn > 1)`,
          [keep.id, ids],
        );
        dropped += rowCount ?? 0;
        repointed += await trx(A).whereIn("extraction_accreditation_id", losers).update({ extraction_accreditation_id: keep.id });
        deleted += await trx(T).whereIn("id", losers).del();
      }
      if (!apply) throw new Rollback();
    }).catch((e) => { if (!(e instanceof Rollback)) throw e; });
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
