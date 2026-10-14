/**
 * "Do not extract a course from wherever you find it."
 *
 * Reported live on heraldcollege.edu.np: a marketing post at /bit-cybersecurity-in-nepal carries an
 * FAQ block naming BSc (Hons) Computing, BSc CSIT, BCA and BIM — none of which the college runs —
 * and those became staged courses. Two independent links let that happen, one per half of this file:
 *
 *   1. url_classify showed the model the same site header for every URL, so a marketing post was
 *      filed as a course page on the strength of its slug alone (and a real course page was missed).
 *   2. Nothing stopped the course prompt mining an FAQ answer once a page was queued, and
 *      classifyEntity waved every result through on "award_in_name" — which an FAQ answer has too.
 *
 * Fixture is the real first 1,800 characters of five live pages (tests/fixtures/…json).
 * Run: node --import tsx tests/course-mention-not-offered.ts
 */

process.env.DB_USERNAME = process.env.DB_USERNAME || "x";
process.env.DB_PASSWORD = process.env.DB_PASSWORD || "x";
process.env.DB_NAME = process.env.DB_NAME || "x";
process.env.JWT_SECRET = process.env.JWT_SECRET || "x";

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}

async function main() {
  const { EXCERPT_CHARS } = await import("../src/modules/superadmin/data-extraction/lib/pipeline-steps.js");
  const { sharedPrefix, pageExcerpt } = await import("../src/modules/superadmin/data-extraction/lib/html-utils.js");
  const { classifyEntity } = await import("../src/modules/superadmin/data-extraction/lib/entity-classifier.js");
  const { courseExtractionPrompt } = await import("../src/modules/superadmin/data-extraction/lib/extraction-prompts.js");

  // ── 1. The classifier excerpt must be the page, not the site ──────────────
  const fixture: Record<string, string> = JSON.parse(
    readFileSync(fileURLToPath(new URL("./fixtures/site-boilerplate-excerpt.json", import.meta.url)), "utf8"),
  );
  const urls = Object.keys(fixture);
  const pages = urls.map((u) => fixture[u]);

  // The defect, stated as a measurement: raw slicing gave every page the same 300 characters.
  const raw = pages.map((md) => md.slice(0, EXCERPT_CHARS).replace(/\s+/g, " ").trim());
  assert(new Set(raw).size === 1, "fixture reproduces the defect: raw excerpts are identical across all 5 pages");

  const boilerplate = sharedPrefix(pages);
  assert(boilerplate.length > EXCERPT_CHARS, `site header (${boilerplate.length} chars) is longer than the excerpt budget`);

  const fixed = new Map(urls.map((u) => [u, pageExcerpt(fixture[u], boilerplate, EXCERPT_CHARS)]));
  assert(new Set(fixed.values()).size === urls.length, "every page now gets a different excerpt");

  // Each excerpt must carry what the page itself is, which is the whole point of showing one.
  const says = (url: string, needle: string) => (fixed.get(url) ?? "").toLowerCase().includes(needle.toLowerCase());
  assert(says("https://heraldcollege.edu.np/bit-cybersecurity-in-nepal", "June 12, 2026"),
    "marketing post's excerpt carries its publication date, not the nav");
  assert(says("https://heraldcollege.edu.np/bachelors-in-computer-science", "Bachelors of Science Hons. Full Time"),
    "course page's excerpt carries its qualification");
  assert(says("https://heraldcollege.edu.np/herald-cup-2025", "Herald Cup 2025"),
    "event page's excerpt carries its event name");
  // The same fix in the other direction: looksLikeCourseUrl returns false for this REAL course
  // page (its path reads "-master", not "/master"), so the model pass is all that stands between
  // it and being filed as "other".
  assert(says("https://heraldcollege.edu.np/international-master-of-business-administration", "International Masters of Business Administration"),
    "a real course page the URL heuristic misses is now recognisable from its excerpt");

  assert(pageExcerpt("x".repeat(50), "", EXCERPT_CHARS).length === 50, "no boilerplate: the page is excerpted unchanged");
  assert(sharedPrefix(["abc", "abd"]) === "", "two pages are too few to tell boilerplate from a shared template");
  assert(pageExcerpt("![logo](http://x/y.png) Real text here", "", EXCERPT_CHARS) === "Real text here", "images are dropped from an excerpt");
  // A header that varies by one byte per page must still shed up to the divergence point —
  // startsWith-or-nothing silently reverted such pages to the nav excerpt.
  assert(pageExcerpt("NAV NAV [active] Real content", "NAV NAV [home] etc etc", EXCERPT_CHARS) === "active] Real content",
    "a page diverging mid-header sheds the shared part, not nothing");

  // ── 2. A programme the page only TALKS ABOUT is not a course ──────────────
  const ctx = {
    coursesOnPage: 8,
    jobUnitCodes: new Set<string>(),
    jobUnitNames: new Set<string>(),
    sourceUrl: "https://heraldcollege.edu.np/bit-cybersecurity-in-nepal",
  };

  // The live case: an FAQ answer naming a degree the college does not run. It states an award, so
  // every pre-existing signal said "course".
  const faq = classifyEntity(
    { name: "BSc (Hons) Computing", entity_type: "course", evidence: ["award_in_name", "mentioned_only_in_prose"] },
    ctx,
  );
  assert(faq.verdict === "drop" && faq.reason === "mentioned_not_offered",
    `FAQ-only mention is dropped (got ${faq.verdict}/${faq.reason})`);

  // Same shape, no award word — must not reach a different verdict by accident.
  const bare = classifyEntity({ name: "BCA", entity_type: "course", evidence: ["mentioned_only_in_prose"] }, ctx);
  assert(bare.verdict === "drop" && bare.reason === "mentioned_not_offered", "an unqualified passing mention is dropped too");

  // Regressions: the mention flag must only bite when the page does nothing else with the degree.
  const owned = classifyEntity(
    { name: "BSc (Hons) Cyber Security", entity_type: "course", evidence: ["award_in_name", "own_detail_page", "mentioned_only_in_prose"] },
    { ...ctx, coursesOnPage: 1, sourceUrl: "https://heraldcollege.edu.np/bachelors-in-cyber-security" },
  );
  assert(owned.verdict === "course", `a course whose own page this is survives the flag (got ${owned.verdict}/${owned.reason})`);

  const priced = classifyEntity(
    { name: "International MBA", entity_type: "course", evidence: ["fees_stated", "mentioned_only_in_prose"] },
    ctx,
  );
  assert(priced.verdict === "course", `a mention the page prices survives the flag (got ${priced.verdict}/${priced.reason})`);

  // Untouched: an ordinary listing entry carries no mention flag and must behave exactly as before.
  const listed = classifyEntity(
    { name: "Bachelors in International Business Management", entity_type: "course", evidence: ["award_in_name"] },
    ctx,
  );
  assert(listed.verdict === "course" && listed.reason === "award_in_name", "an ordinary course-list entry is unaffected");

  const unit = classifyEntity(
    { name: "4CS015 Fundamentals of Computing", entity_type: "module", evidence: ["unit_code", "credit_points"] },
    { ...ctx, coursesOnPage: 1 },
  );
  assert(unit.verdict === "module", "unit classification is unaffected");

  // A curriculum unit the model ALSO tags as prose-mentioned ("modules covered include…") is still
  // a unit — dropping it would silently delete curriculum data the module branches know how to store.
  const proseUnit = classifyEntity(
    { name: "4CS015 Fundamentals of Computing", entity_type: "module", evidence: ["unit_code", "mentioned_only_in_prose"] },
    { ...ctx, coursesOnPage: 1 },
  );
  assert(proseUnit.verdict === "module", `a prose-mentioned unit is reclassified, not dropped (got ${proseUnit.verdict}/${proseUnit.reason})`);

  // ── 2b. The listing decision is never the raw model count ─────────────────
  // The page worker records courses_found on its queue row BEFORE writing rows, and
  // pageWasAListing reads it while concurrent merges decide source_url upgrades. Raw, a detail
  // page returning one course plus a dropped mention counted 2 — a "listing" for its whole
  // processing window, letting a concurrent merge trade the course's detail link away.
  const { preliminaryCourseCount } = await import("../src/modules/superadmin/data-extraction/lib/entity-classifier.js");
  const detailUrl = "https://heraldcollege.edu.np/bachelors-in-cyber-security";
  assert(preliminaryCourseCount([
    { name: "BSc (Hons) Cyber Security", entity_type: "course", evidence: ["own_detail_page", "award_in_name"] },
    { name: "BSc (Hons) Computing", entity_type: "course", evidence: ["award_in_name", "mentioned_only_in_prose"] },
  ], detailUrl) === 1, "a detail page plus a dropped mention counts 1, not 2");
  assert(preliminaryCourseCount([
    { name: "BSc (Hons) Cyber Security", entity_type: "course", evidence: ["own_detail_page"] },
    { name: "4CS015 Fundamentals of Computing", entity_type: "module", evidence: ["unit_code"] },
  ], detailUrl) === 1, "a detail page plus its module counts 1, not 2");
  assert(preliminaryCourseCount([
    { name: "BSc (Hons) Computer Science", entity_type: "course", evidence: ["award_in_name"] },
    { name: "BSc (Hons) Cyber Security", entity_type: "course", evidence: ["award_in_name"] },
  ], "https://heraldcollege.edu.np/our-courses") === 2, "a real two-course listing still counts 2");
  assert(preliminaryCourseCount([], detailUrl) === 0, "no courses counts 0");

  // ── 3. The prompt asks for the flag and says when to set it ───────────────
  const prompt = courseExtractionPrompt("https://heraldcollege.edu.np/bit-cybersecurity-in-nepal", "FAQs ...");
  assert(prompt.includes("mentioned_only_in_prose"), "prompt offers the mentioned_only_in_prose evidence value");
  assert(/QUALIFICATION THIS PAGE ONLY TALKS ABOUT IS NOT A COURSE THIS INSTITUTION OFFERS/.test(prompt),
    "prompt carries the named-not-offered rule");
  assert(/is NOT evidence that it is offered here/.test(prompt),
    "prompt states that an award in the name does not prove the course is offered");

  // The category description the URL classifier and Jev both read. Verified live before shipping:
  // with the NOT clause, 3/3 lite-tier runs filed the Herald marketing post as "other" while
  // keeping every real course page; without it, the same model with the same excerpts said
  // "course" every time.
  const { SITE_URL_CATEGORY_DESCRIPTIONS } = await import("../src/modules/superadmin/data-extraction/lib/url-categories.js");
  assert(/NOT a blog\/news\/marketing article ABOUT degrees/.test(SITE_URL_CATEGORY_DESCRIPTIONS.course),
    "course category description excludes articles about degrees");

  // ── 4. One programme, two spellings: tier 2d flags the cross-field pair ───
  // Seen live on heraldcollege.edu.np: "BSc (Hons) International Business Management" (its own
  // page) parses to subject "science" + specialisation "IBM", while a blog guide's colloquial
  // "Bachelors in International Business Management" parses to subject "IBM" + no specialisation.
  // Same qualifier, same discipline, zero field overlap — every tier whiffed and the pair was
  // inserted silently, splitting one real programme into "hons" and "normal" rows.
  const { parseCourseName } = await import("../src/modules/superadmin/data-extraction/lib/course-name.js");
  const { resolveCourse } = await import("../src/modules/superadmin/data-extraction/lib/course-resolver.js");
  const rowFor = (name: string, id = "existing", url: string | null = null) => {
    const p = parseCourseName(name);
    return { id, job_id: "j", institution_key: null, name_key: p.key, qualifier_norm: p.qualifier,
      subject_norm: p.subject, specialisation_norm: p.specialisation, variant_flags: p.flags,
      course_code: p.code, canonical_url: url };
  };
  const resolve = (incoming: string, existing: string) =>
    resolveCourse({ jobId: "j", parsed: parseCourseName(incoming), canonicalUrl: null }, [rowFor(existing)]);

  const bareIn = resolve("Bachelors in International Business Management", "BSc (Hons) International Business Management");
  assert(bareIn.outcome === "possible_duplicate" && bareIn.tier === "2d",
    `colloquial name vs its qualified programme is flagged (got ${bareIn.outcome}/${bareIn.tier})`);
  const specificIn = resolve("BSc (Hons) International Business Management", "Bachelors in International Business Management");
  assert(specificIn.outcome === "possible_duplicate" && specificIn.tier === "2d",
    `same pair, arrival order reversed, still flagged (got ${specificIn.outcome}/${specificIn.tier})`);

  // Non-regressions around 2d:
  const distinct = resolve("Bachelors in Information Technology", "BSc (Hons) International Business Management");
  assert(distinct.outcome === "new", `different disciplines stay new (got ${distinct.outcome}/${distinct.tier})`);
  const qualDiffers = resolve("Masters in International Business Management", "BSc (Hons) International Business Management");
  assert(qualDiffers.outcome === "new", `a master's vs a bachelor's is never flagged (got ${qualDiffers.outcome}/${qualDiffers.tier})`);
  // Cross-field match only through an UMBRELLA subject (science/arts): "business administration" is
  // a real discipline, so an MBA's Finance concentration beside a genuine Masters in Finance is two
  // programmes, not a duplicate pair.
  const mbaTrack = resolve("Master of Business Administration (Finance)", "Masters in Finance");
  assert(mbaTrack.outcome === "new", `an MBA concentration vs a standalone masters stays new (got ${mbaTrack.outcome}/${mbaTrack.tier})`);
  const identical = resolve("BSc (Hons) International Business Management", "BSc (Hons) International Business Management");
  assert(identical.outcome === "identical" && identical.tier === "1", "exact same name still merges at tier 1");
  const bothBare = resolve("Bachelor of Information Technology", "Bachelor of Information Technology");
  assert(bothBare.outcome === "identical", "two bare spellings of one name still merge at tier 1");

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
