/**
 * filterStudyUnits + normaliseUnitType — the gate that keeps programme names out of a course's
 * curriculum. Pure: the "is this another course of the job?" lookup is injected, so this never
 * touches the database.
 *
 * What this guards, all of it seen live on 2026-09-09 across the staged jobs:
 *   - a real curriculum survives untouched (Georgia Tech's course-list tables),
 *   - a "unit" that is really a QUALIFICATION goes ("Master of Science in Robotics"),
 *   - a "unit" that is really the course itself goes,
 *   - the University of Chicago case: a model read a programme INDEX page and returned the
 *     programme list as one course's curriculum, so the whole batch goes rather than the
 *     handful of entries that happen not to collide,
 *   - one stray collision inside a genuine curriculum drops that row only,
 *   - a 1-2 unit batch is never batch-rejected — it has no shape to judge,
 *   - unit_type comes from the requirement block's heading and stays null when unstated, so the
 *     write never asserts "compulsory" for an elective.
 *
 * Run it directly:
 *   node --import tsx tests/study-unit-plausibility.ts
 */
import {
  filterStudyUnits, normaliseUnitType, normaliseCourseName, type ExtractedStudyUnit,
} from "../src/modules/superadmin/data-extraction/lib/staging-writer.js";

let passed = 0;
let failed = 0;

function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; console.error(`FAIL: ${label} — expected ${e}, got ${a}`); }
}

const u = (unit_name: string, extra: Partial<ExtractedStudyUnit> = {}): ExtractedStudyUnit =>
  ({ unit_name, ...extra });

/** No course of the job matches — the default for a genuine curriculum page. */
const noProgrammes = () => false;
/**
 * The job's course names. Keyed through normaliseCourseName because that is exactly what
 * writeCourse compares — its SQL applies the same normalisation to the stored course names, so
 * keying by hand here would test a contract the writer does not have.
 */
const programmes = (...courseNames: string[]) => {
  const set = new Set(courseNames.map(normaliseCourseName));
  return (k: string) => set.has(k);
};

const names = (r: { kept: ExtractedStudyUnit[] }) => r.kept.map((x) => x.unit_name);

// ── A real curriculum passes through ──
const gatech = [
  u("Integral Calculus", { unit_code: "MATH 1552", credit_points: 4 }),
  u("Computing for Engineers", { unit_code: "CS 1371", credit_points: 3 }),
  u("Scientific Foundations of Health", { unit_code: "APPH 1040", credit_points: 2 }),
  u("Aerospace Vehicle Performance", { unit_code: "AE 2010", credit_points: 3 }),
];
eq(
  names(filterStudyUnits(gatech, "Bachelor of Science in Aerospace Engineering", noProgrammes)),
  ["Integral Calculus", "Computing for Engineers", "Scientific Foundations of Health", "Aerospace Vehicle Performance"],
  "a genuine course list survives intact",
);
eq(
  filterStudyUnits(gatech, "Bachelor of Science in Aerospace Engineering", noProgrammes).batchRejected,
  false,
  "…and is not batch-rejected",
);

// ── A qualification is never a unit ──
eq(
  names(filterStudyUnits(
    [u("Integral Calculus"), u("Master of Science in Robotics"), u("Nursing BSc (Hons)"), u("PhD in Economics")],
    "Bachelor of Science in Computer Science", noProgrammes,
  )),
  ["Integral Calculus"],
  "degree words mark a qualification, not a unit",
);
eq(
  names(filterStudyUnits([u("Minor in Astrobiology"), u("Thermodynamics")], "BS Physics", noProgrammes)),
  ["Thermodynamics"],
  "a minor is a credential too",
);

// ── The course cannot be its own unit ──
eq(
  names(filterStudyUnits(
    [u("Applied Data Science"), u("Statistical Inference")],
    "Applied Data Science", noProgrammes,
  )),
  ["Statistical Inference"],
  "the course's own name is not one of its units",
);
eq(
  names(filterStudyUnits([u("Nursing (Hons)."), u("Anatomy")], "Nursing (Hons)", noProgrammes)),
  ["Anatomy"],
  "…compared on the same normalisation as the course dedup, so trailing punctuation cannot hide it",
);

// ── The University of Chicago case: a programme index read as a curriculum ──
const uchicago = [
  u("Applied Data Science"), u("Biomedical Informatics"), u("Biomedical Sciences"),
  u("Business Administration (Evening)"), u("Business Administration (Executive)"), u("Chemistry"),
];
const idx = filterStudyUnits(uchicago, "Master of Science in Analytics", programmes(
  "Applied Data Science", "Biomedical Informatics", "Biomedical Sciences",
  "Business Administration (Evening)", "Business Administration (Executive)",
));
eq(idx.batchRejected, true, "5 of 6 names are the job's own courses — the page was an index");
eq(idx.kept, [], "…so the whole batch goes, including the entry that did not collide");
eq(idx.dropped.length, 6, "…and every rejection is reported");

// ── One stray collision inside a genuine curriculum ──
const oneClash = filterStudyUnits(
  [u("Integral Calculus"), u("Chemistry"), u("Thermodynamics"), u("Linear Algebra"), u("Statics")],
  "Bachelor of Science in Mechanical Engineering", programmes("Chemistry"),
);
eq(oneClash.batchRejected, false, "1 of 5 is below the batch limit");
eq(names(oneClash), ["Integral Calculus", "Thermodynamics", "Linear Algebra", "Statics"], "…only the colliding row goes");

// ── A tiny batch has no shape to judge ──
const tiny = filterStudyUnits([u("Chemistry"), u("Physics")], "BS Chemistry", programmes("Chemistry", "Physics"));
eq(tiny.batchRejected, false, "a 2-unit batch is never batch-rejected");
eq(tiny.kept, [], "…though both still fail the per-unit test");

// ── Junk names ──
eq(
  names(filterStudyUnits([u(""), u("  "), u("AI"), u("Machine Learning")], "MS Computer Science", noProgrammes)),
  ["Machine Learning"],
  "empty and two-character names go",
);

// ── unit_type ──
eq(normaliseUnitType("Core courses"), "compulsory", "a core block is compulsory");
eq(normaliseUnitType("Required Coursework (18 credits)"), "compulsory", "…so is a required one");
eq(normaliseUnitType("Electives"), "elective", "an electives block is elective");
eq(normaliseUnitType("Choose two of the following"), "elective", "…and so is a choice");
eq(normaliseUnitType("Area of Specialization (9 credits from)"), "elective", "…and a specialisation pool");
eq(normaliseUnitType("elective"), "elective", "the canonical value passes through");
eq(normaliseUnitType("compulsory"), "compulsory", "…both of them");
eq(normaliseUnitType("Year 1"), null, "a block heading that says nothing about requirement → null");
eq(normaliseUnitType(""), null, "empty → null, so the column default stands");
eq(normaliseUnitType(null), null, "absent → null");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
