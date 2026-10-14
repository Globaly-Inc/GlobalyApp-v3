// Picks JEV_PAGE_GATE_MIN and JEV_URL_CLASSIFY_MIN from our own data before they are switched on. Read-only: samples
// completed queue rows whose outcome is known (extracted_data.courses_found), reads each page's
// stored snapshot (never a live fetch), asks Jev, and prints for each threshold how many zero-yield
// pages would have skipped the model and how many productive pages would have been lost.
//
// Usage: TYPESAFE_API_KEY=… node --import tsx scripts/eval-jev-page-gate.ts [--per-class 150] [--days 60]
//
// `--stored` instead reads the verdicts the PIPELINE already recorded (extracted_data.jev_gate.p,
// written on every page the gate scores since 2026-10-14) against that page's own courses_found.
// No Jev calls, no sampling, no key needed — and it covers every page ever extracted rather than
// a paid sample of a few hundred, so the answer gets sharper with every run instead of costing
// money each time you ask. Use the live mode above only to judge a page class the gate has not
// scored yet (it bypasses pages over 40,000 characters, which the live mode does not).
import { masterKnex } from "../src/core/db/master-pool.js";
import { config } from "../src/config.js";
import { readSnapshot } from "../src/modules/superadmin/data-extraction/lib/page-store.js";
import { programmePageProbability, JEV_MODEL } from "../src/modules/superadmin/data-extraction/lib/jev-page-gate.js";
import { jevCategorise } from "../src/modules/superadmin/data-extraction/lib/jev-url-classify.js";

const arg = (name: string, def: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : def;
};
const PER_CLASS = arg("per-class", 150);
const DAYS = arg("days", 60);
const STORED = process.argv.includes("--stored");

if (STORED) {
  // SURVIVORSHIP: a page the live gate SKIPPED was never extracted, so it has no courses_found and
  // cannot appear here. Every row below therefore scored at or above the live threshold, and a
  // candidate threshold BELOW it has no evidence at all in this data — reporting "0 productive
  // lost" there would be an artefact of who got measured, not a finding. Those rows are printed as
  // unknown, and the skipped pages are counted separately so the gate's current saving is visible.
  const { rows } = await masterKnex.raw(
    `SELECT (extracted_data->'jev_gate'->>'p')::float        AS p,
            (extracted_data->'jev_gate'->>'threshold')::float AS threshold,
            extracted_data->'jev_gate'->>'reason'             AS reason,
            (extracted_data->>'courses_found')::int           AS found,
            url
     FROM superadmin.extraction_queue
     WHERE status = 'completed' AND (extracted_data->>'courses_found') IS NOT NULL`);
  const { rows: skippedRows } = await masterKnex.raw(
    `SELECT (extracted_data->>'p')::float AS p, url
     FROM superadmin.extraction_queue
     WHERE status = 'completed' AND extracted_data->>'reason' = 'jev_not_programme'`);

  type Judged = { p: number | null; threshold: number | null; reason: string; found: number; url: string };
  const judged = rows as Judged[];
  const withP = judged.filter((r) => r.p != null);
  const byReason = new Map<string, number>();
  for (const r of judged) byReason.set(r.reason ?? "(not recorded)", (byReason.get(r.reason ?? "(not recorded)") ?? 0) + 1);
  console.log(`${judged.length} extracted pages with a known outcome; ${withP.length} carry a stored gate probability`);
  console.log(`why the rest were never judged: ${[...byReason].map(([k, v]) => `${k}=${v}`).join(", ")}`);
  console.log(`${(skippedRows as { p: number }[]).length} further pages were SKIPPED by the live gate — no outcome exists for them, by construction`);
  if (!withP.length) {
    console.log("\nNothing scored yet — this fills in as jobs run on the recording build. Use the live mode meanwhile.");
    await masterKnex.destroy();
    process.exit(0);
  }

  const pos = withP.filter((r) => r.found > 0);
  const neg = withP.filter((r) => r.found === 0);
  // The floor this data can speak below: the lowest threshold any judged page was measured against.
  // reduce, not Math.min(...spread): this reads ALL completed history with no LIMIT and is meant
  // to keep growing (one bu.edu run adds 10,007 queue rows), and a spread of that many arguments
  // is a RangeError thrown before the table ever prints.
  const liveFloor = withP.reduce((min, r) => Math.min(min, r.threshold ?? 0), Infinity);
  const lowestP = withP.reduce((min, r) => Math.min(min, r.p!), Infinity);
  console.log(`\n${pos.length} productive, ${neg.length} zero-yield — free, from the pipeline's own record`);
  console.log(`these pages ran with the gate at ${liveFloor}; the lowest probability among them is ${lowestP.toFixed(3)}`);
  console.log("\nRAISING the threshold — measured, these pages were all extracted and their yield is known:");
  console.log("threshold | zero-yield also skipped | productive lost | courses lost");
  for (const t of [0.02, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5]) {
    if (t <= lowestP) {
      console.log(`${t.toFixed(2).padStart(9)} | ${"UNKNOWN — no extracted page scored this low; nothing here can price it".padStart(18)}`);
      continue;
    }
    const saved = neg.filter((r) => r.p! < t).length;
    const lost = pos.filter((r) => r.p! < t);
    const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : "-");
    console.log(`${t.toFixed(2).padStart(9)} | ${`${saved} (${pct(saved, neg.length)})`.padStart(23)} | ${`${lost.length} (${pct(lost.length, pos.length)})`.padStart(15)} | ${lost.reduce((a, r) => a + r.found, 0)}`);
  }
  console.log("\nLOWERING it below " + liveFloor + " cannot be judged from this table: those pages were skipped,");
  console.log("never extracted, so nothing recorded what they would have yielded. Run the live mode");
  console.log("(no --stored) on an independently extracted sample to price a lower threshold.");
  console.log("\nLowest-scoring productive pages (what raising the threshold would cost):");
  for (const r of pos.sort((a, b) => a.p! - b.p!).slice(0, 10)) console.log(`  p=${r.p!.toFixed(3)}  courses=${r.found}  ${r.url}`);
  await masterKnex.destroy();
  process.exit(0);
}

if (!config.TYPESAFE_API_KEY) {
  console.error("TYPESAFE_API_KEY is not set — nothing to evaluate.");
  process.exit(1);
}

type Row = { url: string; found: number };
async function sample(productive: boolean): Promise<Row[]> {
  return masterKnex("superadmin.extraction_queue")
    .where({ status: "completed" })
    .whereRaw(`updated_at > now() - make_interval(days => ?)`, [DAYS])
    .whereRaw(`(extracted_data->>'courses_found') IS NOT NULL`)
    .whereRaw(productive ? `(extracted_data->>'courses_found')::int > 0` : `(extracted_data->>'courses_found')::int = 0`)
    .orderByRaw("random()").limit(PER_CLASS * 2)
    .select("url", masterKnex.raw(`(extracted_data->>'courses_found')::int as found`));
}

const scored: { p: number; productive: boolean; found: number; url: string }[] = [];
const excerpts = new Map<string, string>();
for (const productive of [true, false]) {
  let kept = 0;
  for (const row of await sample(productive)) {
    if (kept >= PER_CLASS) break;
    const snap = await readSnapshot(row.url);
    if (!snap?.markdown) continue;
    excerpts.set(row.url, snap.markdown.slice(0, 300));
    const p = await programmePageProbability(row.url, snap.markdown);
    if (p == null) continue;
    scored.push({ p, productive, found: row.found, url: row.url });
    kept++;
  }
}

const pos = scored.filter((s) => s.productive);
const neg = scored.filter((s) => !s.productive);
console.log(`model ${JEV_MODEL}; ${pos.length} productive pages, ${neg.length} zero-yield pages (last ${DAYS} days)\n`);
console.log("threshold | zero-yield skipped | productive lost | courses lost");
for (const t of [0.02, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5]) {
  const saved = neg.filter((s) => s.p < t).length;
  const lost = pos.filter((s) => s.p < t);
  const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : "-");
  console.log(`${t.toFixed(2).padStart(9)} | ${`${saved} (${pct(saved, neg.length)})`.padStart(18)} | ${`${lost.length} (${pct(lost.length, pos.length)})`.padStart(15)} | ${lost.reduce((a, s) => a + s.found, 0)}`);
}
console.log("\nLowest-scoring productive pages (what a threshold would cost):");
for (const s of pos.sort((a, b) => a.p - b.p).slice(0, 10)) console.log(`  p=${s.p.toFixed(3)}  courses=${s.found}  ${s.url}`);

// ── URL classifier (JEV_URL_CLASSIFY_MIN): does Jev call a productive page "course"? ──
console.log("\nURL classifier — share of pages Jev labels `course` at each confidence floor:");
console.log("min conf | productive → course | zero-yield → course");
const all = scored.map((s) => s.url);
for (const t of [0.3, 0.5, 0.6, 0.7, 0.8]) {
  const { verdicts: cats } = await jevCategorise(all, excerpts, t);
  const rate = (rows: typeof scored) => rows.length ? `${((100 * rows.filter((r) => cats.get(r.url) === "course").length) / rows.length).toFixed(1)}%` : "-";
  console.log(`${t.toFixed(2).padStart(8)} | ${rate(pos).padStart(19)} | ${rate(neg).padStart(20)}`);
}

await masterKnex.destroy();
process.exit(0);
