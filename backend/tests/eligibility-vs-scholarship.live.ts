/**
 * LIVE check (costs Gemini calls): does the extractor keep scholarship criteria and
 * application-process instructions OUT of a course's eligibility requirements?
 *
 *   node --import tsx tests/eligibility-vs-scholarship.live.ts [--fresh] [url ...]
 *
 * Runs BOTH extraction paths on each page — the page worker's full course prompt and the
 * step worker's per-course "eligibility" prompt — and flags any requirement row that reads as
 * scholarship / funding, application paperwork, or other non-admission content. Pages come
 * through the snapshot store, so a page already crawled costs no scrape. --fresh bypasses the
 * LLM result cache (use it after a prompt change that you want to measure, the hash changes anyway).
 */
import "dotenv/config";

const NOISE: Record<string, RegExp> = {
  scholarship: /scholar|bursar|\bgrants?\b|funding|financial (aid|support)|tuition (discount|waiver)|fee waiver|stipend|award(ed)? (of|worth)|£|\$\d/i,
  application_process: /personal statement|statement of purpose|referee|recommendation|reference letter|interview|portfolio|\bcv\b|résumé|resume|transcript|supporting document|application (fee|form|deadline|documents?|process)|how to apply|passport|deposit|submit/i,
  non_admission: /\bvisa\b|accommodation|inherent requirement|\baged? \d|citizen|residen|police|working with children|immunis|vaccin|first aid/i,
};

function flag(text: string): string[] {
  return Object.entries(NOISE).filter(([, re]) => re.test(text)).map(([k]) => k);
}

const DEFAULT_URLS = [
  "https://uel.ac.uk/undergraduate/courses/llb-hons-law-criminology",
  "https://uel.ac.uk/postgraduate/courses/ma-professional-sound-music",
  "https://www.curtin.edu.au/study/offering/course-pg-master-of-dietetics--mg-diets/",
  "https://www.curtin.edu.au/study/offering/course-ug-korean-studies-major-ba--mjru-kores/",
  "https://curtin.edu.au/study/international-students/global-scholars-program",
];

let guard: (r: { name?: string | null; description?: string | null }) => boolean = () => true;
type Req = { name?: string | null; description?: string | null; min_score?: unknown; score_type?: unknown; academic_tests?: unknown[] };

function report(label: string, reqs: Req[], english: unknown[] | undefined) {
  console.log(`  ${label}: ${reqs.length} requirement(s), ${english?.length ?? 0} english test(s)`);
  let flagged = 0;
  for (const r of reqs) {
    const text = `${r.name ?? ""} ${r.description ?? ""}`;
    const f = flag(text);
    if (f.length) flagged++;
    const kept = guard(r);
    const mark = `${kept ? (f.length ? "!! " + f.join(",") : "ok") : "DROPPED-BY-WRITER"}`;
    console.log(`    [${mark}] ${r.name ?? "(no name)"} — ${(r.description ?? "").replace(/\s+/g, " ").slice(0, 400)}`);
  }
  return { total: reqs.length, flagged };
}

async function main() {
  const args = process.argv.slice(2);
  const fresh = args.includes("--fresh");
  // --append=url1,url2 mimics the step worker's urlsForType(): every Site-Context page in the
  // "eligibility" category is appended to the course page before the eligibility prompt runs.
  const appendArg = args.find((a) => a.startsWith("--append="));
  const appendUrls = appendArg ? appendArg.slice("--append=".length).split(",").filter(Boolean) : [];
  const urls = args.filter((a) => !a.startsWith("--"));
  const targets = urls.length ? urls : DEFAULT_URLS;

  const { getPage } = await import("../src/modules/superadmin/data-extraction/lib/page-store.js");
  const { extractJson } = await import("../src/modules/superadmin/data-extraction/lib/llm-client.js");
  const { truncateMarkdown, COURSE_DATA_TEXT_CAP } = await import("../src/modules/superadmin/data-extraction/lib/html-utils.js");
  const { isAdmissionRequirement } = await import("../src/modules/superadmin/data-extraction/lib/staging-writer.js");
  guard = isAdmissionRequirement;
  const { loadLookupLists } = await import("../src/modules/superadmin/data-extraction/lib/lookup-catalog.js");
  const p = await import("../src/modules/superadmin/data-extraction/lib/extraction-prompts.js");
  const { masterKnex } = await import("../src/core/db/master-pool.js");

  const lookups = await loadLookupLists();
  const summary: Array<{ url: string; path: string; total: number; flagged: number }> = [];

  for (const url of targets) {
    console.log(`\n=== ${url}`);
    const page = await getPage(url, { onlyMainContent: true });
    const md = page.markdown ?? "";
    if (md.length < 50) { console.log("  (no content)"); continue; }
    // What the source actually says: every heading that names entry/admission or money.
    const headings = md.split("\n").filter((l) => /^#{1,4}\s/.test(l) && /entry|admission|eligib|requirement|english|scholar|fund|financ|bursar|fee|cost|apply/i.test(l));
    console.log(`  page ${md.length} chars; relevant headings:\n    ${headings.map((h) => h.trim()).join("\n    ") || "(none)"}`);

    // Path A: page worker — full course prompt
    const full = await extractJson<{ courses?: Array<{ name: string; eligibility?: Req[]; english_requirements?: unknown[] }> }>({
      system: p.COURSE_EXTRACTION_SYSTEM,
      prompt: p.courseExtractionPrompt(url, truncateMarkdown(md), null, null, lookups),
      maxTokens: 65536,
      noCache: fresh,
    });
    const courses = full.courses ?? [];
    console.log(`  [A page worker] ${courses.length} course(s)`);
    for (const c of courses) {
      console.log(`   course: ${c.name}`);
      const r = report("A", c.eligibility ?? [], c.english_requirements);
      summary.push({ url, path: `A:${c.name}`, ...r });
    }

    // Path B: step worker — per-course eligibility prompt over the same page
    let combined = md;
    for (const extra of appendUrls) {
      const ep = await getPage(extra, { onlyMainContent: true });
      if ((ep.markdown ?? "").length > 50) { combined += `\n\n---\nSource: ${extra}\n\n${ep.markdown}`; console.log(`  appended ${extra} (${ep.markdown.length} chars)`); }
      else console.log(`  append skipped (no content): ${extra}`);
    }
    const step = await extractJson<{ requirements?: Req[]; english_requirements?: unknown[] }>({
      system: p.COURSE_DATA_SYSTEM,
      prompt: p.courseDataPrompt(url, truncateMarkdown(combined, COURSE_DATA_TEXT_CAP), "eligibility", null),
      noCache: fresh,
    });
    const r = report("B step worker", step.requirements ?? [], step.english_requirements);
    summary.push({ url, path: "B", ...r });
  }

  console.log("\n=== SUMMARY (flagged / total requirement rows)");
  for (const s of summary) console.log(`  ${s.flagged}/${s.total}  ${s.path}  ${s.url}`);
  await masterKnex.destroy();
}

main().catch((e) => { console.error(e); process.exit(1); });
