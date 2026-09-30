/**
 * Jev linker's candidate finding (pure). Run: npm run test:jev-linker
 */
import { amountNeedles, candidatesFor, type Entity, type LinkKind } from "../src/modules/superadmin/data-extraction/lib/jev-linker.js";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; console.error(`FAIL ${label}\n  expected ${e}\n  got      ${a}`); }
}

eq(amountNeedles(16020), ["16020", "16,020", "16 020"], "an amount matches grouped and ungrouped spellings");
eq(amountNeedles(50), [], "small amounts are too ambiguous to match on");
eq(amountNeedles(null), [], "no amount, no needle");

const course = { id: "c1", name: "BSc Nursing", degree_level: "Bachelor", source_url: "https://x.edu/nursing" };
const page = "BSc Nursing is taught at the Stratford Campus. Start in September 2027. "
  + "Core units: NUR101 Foundations of Nursing. International tuition £16,020 per year. Entry Requirements: 3 A-levels.";
const E = (kind: LinkKind, id: string, needles: string[], scope?: string): Entity => ({ kind, id, label: id, needles, scope });
const entities: Entity[] = [
  E("campus", "stratford", ["Stratford Campus"]),
  E("campus", "docklands", ["Docklands Campus"]),
  E("intake", "sep27", ["September 2027"]),
  E("study_unit", "nur101", ["NUR101", "Foundations of Nursing"]),
  E("study_unit", "law200", ["LAW200", "Contract Law"]),
  E("fee", "f16020", amountNeedles(16020)),
  E("fee", "f9000", amountNeedles(9000)),
  E("eligibility", "orphan-req", ["Entry Requirements"]),
  E("eligibility", "other-course-req", ["Entry Requirements"]),
  E("scholarship", "merit", [], "for all undergraduate students"),
];
const unlinked = new Set(["eligibility|orphan-req", "campus|stratford", "study_unit|nur101"]);
const ids = (xs: Entity[]) => xs.map((e) => e.id);

eq(ids(candidatesFor(course, page, entities, new Set(), new Set(), { agentcis: false, unlinkedIds: unlinked })),
  ["stratford", "nur101", "orphan-req", "sep27", "f16020", "merit"],
  "only entities the page mentions (plus scope kinds); unlinked first; another course's requirement never");

eq(ids(candidatesFor(course, page, entities, new Set(["c1|intake|sep27"]), new Set(), { agentcis: false, unlinkedIds: unlinked })).includes("sep27"),
  false, "an existing link is never asked again");

eq(ids(candidatesFor(course, page, entities, new Set(), new Set<LinkKind>(["fee", "campus"]), { agentcis: true, unlinkedIds: unlinked })),
  ["nur101", "orphan-req", "sep27", "merit"], "AgentCIS: a kind the course already has is left alone");

eq(ids(candidatesFor(course, page, [E("study_unit", "shared", ["NUR101"])], new Set(), new Set(), { agentcis: false, unlinkedIds: new Set() })),
  [], "a unit already linked to another course is not offered (units are course-specific)");

eq(ids(candidatesFor(course, page, entities, new Set(), new Set(), { agentcis: false, unlinkedIds: unlinked, sharedPage: true })),
  ["stratford", "nur101", "orphan-req"], "a listing page (shared by several courses) offers only orphans");

eq(ids(candidatesFor(course, "Nursing at the Stratford Campuses page", [E("campus", "stra", ["Stratford Campus"])], new Set(), new Set(), { agentcis: false, unlinkedIds: new Set() })),
  [], "a name matches on whole words only, not inside a longer word");

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
