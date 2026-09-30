// Picks JEV_PAGE_GATE_MIN and JEV_URL_CLASSIFY_MIN from our own data before they are switched on. Read-only: samples
// completed queue rows whose outcome is known (extracted_data.courses_found), reads each page's
// stored snapshot (never a live fetch), asks Jev, and prints for each threshold how many zero-yield
// pages would have skipped the model and how many productive pages would have been lost.
//
// Usage: TYPESAFE_API_KEY=… node --import tsx scripts/eval-jev-page-gate.ts [--per-class 150] [--days 60]
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
  const cats = await jevCategorise(all, excerpts, t);
  const rate = (rows: typeof scored) => rows.length ? `${((100 * rows.filter((r) => cats.get(r.url) === "course").length) / rows.length).toFixed(1)}%` : "-";
  console.log(`${t.toFixed(2).padStart(8)} | ${rate(pos).padStart(19)} | ${rate(neg).padStart(20)}`);
}

await masterKnex.destroy();
process.exit(0);
