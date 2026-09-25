/**
 * Course entity classifier + resolver against the labelled fixture. Pure functions, no database.
 *
 * Run: node --import tsx tests/course-entity-resolution.ts
 *
 * Every case is a pair from one institution (unless institution_b differs) with an expected
 * outcome. The false-merge count is the gate: any `identical` verdict on a pair not labelled
 * identical fails the run outright.
 */
import { readFileSync } from "node:fs";
import { parseCourseName, institutionKey, canonicalCourseUrl } from "../src/modules/superadmin/data-extraction/lib/course-name.js";
import { resolveCourse, type CandidateRow } from "../src/modules/superadmin/data-extraction/lib/course-resolver.js";
import { classifyEntity } from "../src/modules/superadmin/data-extraction/lib/entity-classifier.js";

interface Side {
  name: string;
  source_url?: string;
  institution?: string;
  institution_b?: string;
  page_context?: {
    url?: string; headings?: string[]; heading_path?: string[]; credit_points?: number;
    evidence?: string[]; entity_type?: string; parent_program?: string;
  };
}
interface Case {
  id: string; group: string; a: Side; b: Side; expected: string; note?: string;
  job_unit_codes?: string[]; expected_class_a?: string; expected_class_b?: string;
}

const fixture = JSON.parse(readFileSync(new URL("./fixtures/course-entity-resolution.json", import.meta.url), "utf8"));
const cases: Case[] = fixture.cases;

function classify(side: Side, other: Side, c: Case) {
  const pc = side.page_context ?? {};
  const sameUrl = !!side.source_url && side.source_url === other.source_url
    || !!pc.url && pc.url === (other.page_context?.url ?? other.source_url);
  return classifyEntity(
    {
      name: side.name,
      entity_type: pc.entity_type ?? null,
      parent_program: pc.parent_program ?? pc.heading_path?.[0] ?? null,
      evidence: pc.evidence ?? [],
      heading_path: pc.heading_path ?? [],
      credit_points: pc.credit_points ?? null,
    },
    {
      coursesOnPage: sameUrl || pc.heading_path?.length ? 2 : 1,
      jobUnitCodes: new Set((c.job_unit_codes ?? []).map((s) => s.toUpperCase())),
      jobUnitNames: new Set<string>(),
      sourceUrl: side.source_url ?? pc.url ?? null,
    },
  );
}

function run(c: Case): { got: string; classA: string; classB: string } {
  const instA = institutionKey(c.a.institution ?? "example.edu");
  const instB = institutionKey(c.b.institution_b ?? c.a.institution ?? "example.edu");
  const ca = classify(c.a, c.b, c);
  const cb = classify(c.b, c.a, c);
  const classA = ca.verdict, classB = cb.verdict;
  if (instA !== instB) return { got: "separate_institution", classA, classB };
  if (classB === "module" || classA === "module") {
    // "module" means b is a unit OF a. A unit of some other programme is simply never merged.
    const parent = cb.parentProgram ? parseCourseName(cb.parentProgram).key : null;
    const ofA = !parent || parent === parseCourseName(c.a.name).key;
    return { got: classB === "module" && ofA ? "module" : "separate", classA, classB };
  }

  const pa = parseCourseName(c.a.name);
  const pb = parseCourseName(c.b.name);
  const candidate: CandidateRow = {
    id: "a", job_id: "job", institution_key: instA,
    name_key: pa.key, qualifier_norm: pa.qualifier, subject_norm: pa.subject,
    specialisation_norm: pa.specialisation, variant_flags: pa.flags, course_code: pa.code,
    canonical_url: c.a.source_url ? canonicalCourseUrl(c.a.source_url, `https://${instA}/`) : null,
  };
  const r = resolveCourse(
    {
      jobId: "job", parsed: pb,
      canonicalUrl: c.b.source_url ? canonicalCourseUrl(c.b.source_url, `https://${instA}/`) : null,
    },
    [candidate],
  );
  return { got: r.outcome === "new" ? "separate" : r.outcome, classA, classB };
}

let pass = 0, fail = 0, falseMerges = 0;
const byGroup = new Map<string, { pass: number; fail: number }>();
for (const c of cases) {
  const { got, classA, classB } = run(c);
  let ok = got === c.expected;
  if (c.expected_class_a && classA !== c.expected_class_a) ok = false;
  if (c.expected_class_b && classB !== c.expected_class_b) ok = false;
  if (got === "identical" && c.expected !== "identical") falseMerges++;
  const g = byGroup.get(c.group) ?? { pass: 0, fail: 0 };
  if (ok) { pass++; g.pass++; } else {
    fail++; g.fail++;
    console.error(`FAIL ${c.id}: expected ${c.expected}, got ${got} (class a=${classA}, b=${classB})\n   a: ${c.a.name}\n   b: ${c.b.name}`);
  }
  byGroup.set(c.group, g);
}
// Direct unit check (not fixture-driven — the fixture format is pairs-only): tier 2c must surface
// EVERY qualifying candidate, not just the first. A bare subject mention can legitimately sit beside
// an undergrad AND a grad programme for the same subject, and both need their own review flag.
{
  const undergrad = parseCourseName("Aeronautics and Astronautics (Undergraduate)");
  const grad = parseCourseName("Aeronautics and Astronautics (Graduate)");
  const bare = parseCourseName("Aeronautics and Astronautics");
  const toRow = (id: string, p: ReturnType<typeof parseCourseName>): CandidateRow => ({
    id, job_id: "job", institution_key: null, name_key: p.key, qualifier_norm: p.qualifier,
    subject_norm: p.subject, specialisation_norm: p.specialisation, variant_flags: p.flags,
    course_code: p.code, canonical_url: null,
  });
  const candidates = [toRow("undergrad", undergrad), toRow("grad", grad)];
  const r = resolveCourse({ jobId: "job", parsed: bare, canonicalUrl: null }, candidates);
  const ids = (r.matches ?? (r.match ? [r.match] : [])).map((m) => m.id).sort().join(",");
  const ok = r.outcome === "possible_duplicate" && r.tier === "2c" && ids === "grad,undergrad";
  if (ok) pass++; else {
    fail++;
    console.error(`FAIL tier2c-multi-match: expected outcome=possible_duplicate tier=2c matches=grad,undergrad; got outcome=${r.outcome} tier=${r.tier} matches=${ids}`);
  }
}

console.log("\ngroup".padEnd(28), "pass", "fail");
for (const [g, v] of byGroup) console.log(g.padEnd(27), String(v.pass).padStart(4), String(v.fail).padStart(5));
console.log(`\n${pass} passed, ${fail} failed, false merges: ${falseMerges}`);
if (fail || falseMerges) process.exit(1);
