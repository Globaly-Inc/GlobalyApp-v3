/**
 * Jev course check + Jev URL classifier, with Jev faked. Run: npm run test:jev-checks
 */
import { _jevDeps } from "../src/modules/superadmin/data-extraction/lib/jev-client.js";
import { _courseCheckDeps, checkCourseWithJev } from "../src/modules/superadmin/data-extraction/lib/jev-course-check.js";
import { jevCategorise, jevVerdicts } from "../src/modules/superadmin/data-extraction/lib/jev-url-classify.js";
import type { ExtractedCourse } from "../src/modules/superadmin/data-extraction/lib/staging-writer.js";
import type { LookupLists } from "../src/modules/superadmin/data-extraction/lib/lookup-catalog.js";
import type { SiteUrlCategory } from "../src/modules/superadmin/data-extraction/lib/url-categories.js";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; console.error(`FAIL ${label}\n  expected ${e}\n  got      ${a}`); }
}

let asked: string[] = [];
const fake = (answer: (q: string) => unknown) => {
  _jevDeps.systemOne = (async (req: { questions: Record<string, unknown> }) => {
    asked = Object.keys(req.questions);
    return { answers: Object.fromEntries(asked.map((q) => [q, answer(q)])) };
  }) as unknown as typeof _jevDeps.systemOne;
};

const lists: LookupLists = {
  levels: [{ slug: "bachelor", name: "Bachelor" }, { slug: "master", name: "Master" }],
  areas: [{ slug: "engineering", name: "Engineering" }, { slug: "health_medicine", name: "Health and Medicine" }],
} as LookupLists;

const course = (): ExtractedCourse => ({
  name: "Electrical Engineering", degree_level: null, subject_area: null,
  fees: [
    { name: "Tuition Fee", total_amount: 16020, currency: "GBP", student_type: "international" },
    { name: "Tuition Fee", total_amount: 2000, currency: "GBP", student_type: "both" },
  ],
  intakes: [{ intake_name: "September 2027" }, { intake_name: "Application deadline 30 June" }],
  study_units: [{ unit_name: "Circuit Analysis" }, { unit_name: "Master of Business Administration" }],
} as unknown as ExtractedCourse);

// ── course check ────────────────────────────────────────────────────────────
_courseCheckDeps.dropMin = () => 0.9;
_courseCheckDeps.lookupMin = () => 0.7;
fake((q) => {
  if (q === "degree_level") return { choice: "Bachelor", confidence: 0.95 };
  if (q === "area_of_study") return { choice: "Engineering", confidence: 0.6 };
  if (q === "not_programme") return { noul: 0.05 };
  return { noul: ["fees_1", "intakes_1", "study_units_1"].includes(q) ? 0.97 : 0.1 };
});
{
  const c = course();
  const out = await checkCourseWithJev(c, "page text", lists);
  eq(c.fees?.map((f) => f.total_amount), [16020], "a fee Jev is sure is wrong is dropped, the tuition stays");
  eq(c.intakes?.map((i) => i.intake_name), ["September 2027"], "a deadline filed as an intake is dropped");
  eq(c.study_units?.map((u) => u.unit_name), ["Circuit Analysis"], "a programme filed as a unit is dropped");
  eq(out?.dropped.map((d) => d.list), ["fees", "intakes", "study_units"], "every drop is reported");
  eq(c.degree_level, "Bachelor", "an unlinked level is linked from the real list");
  eq(asked.includes("area_of_study"), false, "an area the name already resolves (Engineering) is not asked");
  eq(out?.flagged, false, "a programme is not flagged");
}

{
  // A name no resolver can place, so both lookups are asked.
  fake((q) => (q === "degree_level" ? { choice: "Master", confidence: 0.6 } : q === "area_of_study" ? { choice: "Engineering", confidence: 0.9 } : { noul: 0.1 }));
  const c = { name: "Programme 7B", degree_level: null } as unknown as ExtractedCourse;
  await checkCourseWithJev(c, "page text", lists);
  eq([asked.includes("degree_level"), asked.includes("area_of_study")], [true, true], "unlinked level and area are both asked");
  eq([c.degree_level, c.area_of_study], [null, "Engineering"], "a lookup pick under JEV_LOOKUP_MIN is not applied; one above is");
}

fake((q) => (q === "not_programme" ? { noul: 0.95 } : q.includes("_") && !q.startsWith("degree") && !q.startsWith("area") ? { noul: 0.1 } : { choice: "none", confidence: 0.99 }));
{
  const c = course();
  const out = await checkCourseWithJev(c, "page text", lists);
  eq([out?.flagged, c.fees?.length], [true, 2], "not-a-programme is flagged for review, nothing is deleted for it");
  eq(c.degree_level, null, "'none' links nothing");
}

{
  fake(() => ({ noul: 0.1 }));
  const c = { ...course(), degree_level: "Bachelor", area_of_study: "Engineering" } as ExtractedCourse;
  await checkCourseWithJev(c, "page text", lists);
  eq(asked.includes("degree_level") || asked.includes("area_of_study"), false, "a lookup that already links is not asked");
}

_courseCheckDeps.dropMin = () => null;
_courseCheckDeps.lookupMin = () => null;
let calls = 0;
_jevDeps.systemOne = (async () => { calls++; return { answers: {} }; }) as unknown as typeof _jevDeps.systemOne;
eq([await checkCourseWithJev(course(), "page", lists), calls], [null, 0], "off → no call");

_courseCheckDeps.dropMin = () => 0.9;
_jevDeps.systemOne = (async () => { throw new Error("429"); }) as unknown as typeof _jevDeps.systemOne;
{
  const c = course();
  eq([await checkCourseWithJev(c, "page", lists), c.fees?.length], [null, 2], "Jev failure → course stored unchecked");
}

// ── URL classifier ──────────────────────────────────────────────────────────
{
  const urls = ["https://x.edu/programs/nursing", "https://researchguides.x.edu/nur334", "https://x.edu/about", "https://x.edu/campus-life/scholarships"];
  fake((q) => ({ p0: { choice: "course", confidence: 0.9 }, p1: { choice: "other", confidence: 0.95 }, p2: { choice: "about_us", confidence: 0.4 }, p3: { choice: "scholarships", confidence: 0.9 } } as Record<string, unknown>)[q]);
  const jev = await jevCategorise(urls, new Map(), 0.6);
  eq([...jev], [[urls[0], "course"], [urls[1], "other"], [urls[3], "scholarships"]], "only confident answers are kept");
  const isCourse = (u: string) => /programs|nur\d/.test(u);
  const heuristic = (u: string): SiteUrlCategory | null => (u.endsWith("/about") ? "about_us" : null);
  const v = jevVerdicts(urls, jev, new Map([["https://x.edu/apply", "eligibility" as SiteUrlCategory]]), isCourse, heuristic);
  eq(v.get(urls[1]), { category: "other", source: "jev" }, "Jev overrules a heuristic 'course' it is sure is not one");
  eq(v.get(urls[2]), { category: "about_us", source: "heuristic" }, "an unconfident URL keeps the heuristic verdict");
  eq(v.get("https://x.edu/apply"), { category: "eligibility", source: "guided" }, "guided always wins, even off the list");

  _jevDeps.systemOne = (async () => { throw new Error("500"); }) as unknown as typeof _jevDeps.systemOne;
  eq((await jevCategorise(urls, new Map(), 0.6)).size, 0, "a failed batch returns nothing (heuristics take over)");
}

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
