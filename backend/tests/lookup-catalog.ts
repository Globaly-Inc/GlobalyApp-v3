/**
 * lookup-catalog — binding a course to the platform's CLOSED lookup lists. Pure: the lists are
 * injected, so this never touches the database (at runtime they are read from
 * public.areas_of_study / public.degree_levels, seeded from database/seeders/globalyapp).
 *
 * What this guards:
 *   - a value that matches nothing on the list links to nothing (never invents a category),
 *   - a course still lands on an area and a level when the model didn't answer — from the subject
 *     wording, then the course's own name,
 *   - the placements that follow the PLATFORM rather than intuition (Psychology → Health and
 *     Medicine, Economics → Social Studies and Media, Environmental Management → Social Studies),
 *   - the ordering traps: "human resource management" beats "management", short subjects like
 *     "IT" never match inside another word,
 *   - empty lists link nothing rather than crashing.
 *
 * Deliberately not an npm script — the running system reports its own link health through the
 * verify worker's `lookup_links_verified` / `lookup_lists_unhealthy` job events. This is the
 * offline check on the matcher itself. Run it directly:
 *   node --import tsx tests/lookup-catalog.ts
 */
import {
  resolveAreaOfStudy, resolveDegreeLevel, type LookupLists,
} from "../src/modules/superadmin/data-extraction/lib/lookup-catalog.js";

let passed = 0;
let failed = 0;

function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; console.error(`FAIL: ${label} — expected ${e}, got ${a}`); }
}

// The lists exactly as the seeders define them (active rows, in sort order).
const LISTS: LookupLists = {
  areas: [
    { slug: "agriculture_veterinary_medicine", name: "Agriculture and Veterinary Medicine" },
    { slug: "applied_pure_science", name: "Applied and Pure Science" },
    { slug: "architecture_construction", name: "Architecture and Construction" },
    { slug: "business_management", name: "Business and Management" },
    { slug: "computer_science_it", name: "Computer Science and IT" },
    { slug: "creative_arts_design", name: "Creative Arts and Design" },
    { slug: "education_training", name: "Education and Training" },
    { slug: "engineering", name: "Engineering" },
    { slug: "health_medicine", name: "Health and Medicine" },
    { slug: "humanities", name: "Humanities" },
    { slug: "law", name: "Law" },
    { slug: "personal_care_fitness", name: "Personal Care and Fitness" },
    { slug: "social_studies_media", name: "Social Studies and Media" },
    { slug: "travel_hospitality", name: "Travel and Hospitality" },
  ],
  levels: [
    { slug: "school", name: "School" },
    { slug: "high_school", name: "High School" },
    { slug: "certificate", name: "Certificate" },
    { slug: "diploma", name: "Diploma" },
    { slug: "advance_diploma", name: "Advance Diploma" },
    { slug: "non_aqf_award", name: "Non AQF Award" },
    { slug: "bachelor", name: "Bachelor" },
    { slug: "graduate_diploma", name: "Graduate Diploma" },
    { slug: "master", name: "Master" },
    { slug: "master_research", name: "Master (Research)" },
    { slug: "doctoral", name: "PHD" },
  ],
};

const lvl = (pick: unknown, name?: string) => resolveDegreeLevel(LISTS, pick, name)?.slug ?? null;
const area = (pick: unknown, ...texts: unknown[]) => resolveAreaOfStudy(LISTS, pick, ...texts)?.slug ?? null;

// ── The model's pick is validated against the live list ──
eq(area("Health and Medicine"), "health_medicine", "the model's area name resolves");
eq(area("health_medicine"), "health_medicine", "…and its slug");
eq(area("HEALTH AND MEDICINE"), "health_medicine", "…case-insensitively");
eq(area("Health & Medicine"), "health_medicine", "…with '&' for 'and'");
eq(area("Computer Science and IT"), "computer_science_it", "another area");
eq(area("Social Studies and Media"), "social_studies_media", "another area");
eq(area(null), null, "no pick → null");
eq(area(undefined, "Humanities"), "humanities", "the subject text IS an area name (older rows, re-runs)");
eq(area("Not A Real Area", "Law"), "law", "an invalid pick falls back to the subject text");

// ── Placing a subject that is not itself an area name ──
// Needed for every row the model did not classify: staged before the prompt asked, re-run during
// an outage, admin edit. The 14 areas cover essentially every discipline, so these must LAND.
eq(area(undefined, "Nursing"), "health_medicine", "a bare subject reaches its area");
eq(area("Nursing"), "health_medicine", "…including when the MODEL answered with a subject, not an area");
eq(area(undefined, "Civil Engineering"), "engineering", "engineering");
eq(area(undefined, "Marine Biology"), "applied_pure_science", "a subject inside a longer phrase");
eq(area(undefined, "Human Resource Management"), "business_management", "the longest phrase wins over bare 'management'");
eq(area(undefined, "Environmental Management"), "social_studies_media", "…so this follows the platform, not the word 'management'");
eq(area(undefined, "Psychology"), "health_medicine", "placement follows the PLATFORM's taxonomy, not intuition");
eq(area(undefined, "Economics"), "social_studies_media", "…and so does Economics");
eq(area(undefined, "Public Health"), "health_medicine", "health beats the bare word 'public'");
eq(area(undefined, "International Business"), "business_management", "business beats the bare word 'international'");
eq(area(undefined, "Hospitality Management"), "travel_hospitality", "hospitality beats 'management'");
eq(area(undefined, "Cyber Security"), "computer_science_it", "a keyword with no listed phrase");
eq(area(undefined, "Culinary Arts"), "travel_hospitality", "…and the listed phrase beats the 'arts' keyword");
eq(area(undefined, "IT"), "computer_science_it", "a two-letter subject matches only exactly");
eq(area(undefined, "Credit Risk"), null, "…and never inside another word — 'credit' is not 'IT'");
eq(area(undefined, "Law and Society"), "law", "a three-letter subject inside a phrase, via keywords");

// Not subjects: enrolment states and offering buckets a catalogue put where a subject goes.
eq(area(undefined, "Various"), null, "'Various' is not a discipline");
eq(area(undefined, "Graduate Studies"), null, "an enrolment bucket is not a discipline");
eq(area(undefined, "Community Auditing"), null, "…nor is an enrolment status");
eq(area(undefined, "N/A"), null, "…nor is a placeholder");
eq(area("Underwater Basket Weaving"), null, "an unplaceable value links to NOTHING — never invents a category");

// The course NAME is the last candidate, for pages that never state a subject.
eq(area(undefined, null, "Bachelor of Nursing"), "health_medicine", "the course name places it");
eq(area(undefined, "Benjamin Franklin Seminars", "Chemistry BSc"), "applied_pure_science", "an unplaceable subject falls through to the name");
eq(area(undefined, null, "Diploma of Project Management"), "business_management", "…and a qualification word doesn't get in the way");

eq(lvl("Bachelor"), "bachelor", "the model's level name resolves");
eq(lvl("PHD"), "doctoral", "PHD resolves to the app-wide `doctoral` slug");
eq(lvl("Master (Research)"), "master_research", "a level with punctuation");
eq(lvl("Underwater Studies"), null, "a level outside the list links to nothing");

// ── The platform's Course Level → Degree Level folds ──
eq(lvl("Associate Degree"), "bachelor", "Associate Degree folds into Bachelor");
eq(lvl("Bachelor Honours Degree"), "bachelor", "Bachelor Honours folds into Bachelor");
eq(lvl("Undergraduate Higher Diploma"), "bachelor", "Undergraduate Higher Diploma folds into Bachelor");
eq(lvl("Graduate Certificate"), "graduate_diploma", "Graduate Certificate folds into Graduate Diploma");
eq(lvl("Masters Degree (Extended)"), "master", "Masters (Extended) folds into Master");
eq(lvl("Kindergarten Studies"), "school", "every school stage folds into School");
eq(lvl("Primary School Studies"), "school", "Primary School Studies → School");
eq(lvl("Junior Secondary Studies"), "school", "Junior Secondary Studies → School");
eq(lvl("Certificate II"), "certificate", "Certificate II → Certificate");
eq(lvl("Other"), "non_aqf_award", "a retired 'Other' folds into Non AQF Award");
eq(lvl("Short Course"), "non_aqf_award", "short course → Non AQF Award");

// ── The course's own qualification, when the model didn't answer ──
eq(lvl(null, "Anthropology Ph.D."), "doctoral", "Ph.D. in the name");
eq(lvl(null, "Economics A.B."), "bachelor", "A.B. is a Bachelor");
eq(lvl(null, "Computer Science BSc (Hons)"), "bachelor", "BSc (Hons)");
eq(lvl(null, "Medicine and Surgery MBChB"), "bachelor", "MBChB is a Bachelor");
eq(lvl(null, "Finance M.Fin."), "master", "M.Fin. is a Master");
eq(lvl(null, "History MPhil"), "master_research", "MPhil is a research master");
eq(lvl(null, "Juris Doctor (JD)"), "doctoral", "JD folds onto the one doctoral level");
eq(lvl(null, "Diploma of Nursing"), "diploma", "Diploma by words");
eq(lvl(null, "Advanced Diploma of Engineering"), "advance_diploma", "Advanced → the platform's 'Advance Diploma'");
eq(lvl(null, "Certificate IV in Business"), "certificate", "AQF Cert IV");
eq(lvl(null, "Year 12 Studies"), "high_school", "senior secondary");
eq(lvl(null, "Finance Undergraduate Minor"), "non_aqf_award", "a minor is a Non AQF Award");
eq(lvl(null, "Minor Surgery MSc"), "master", "'Minor' inside an MSc title is still a Master");
eq(lvl(null, "Master In Teaching"), "master", "'in' is as valid a preposition as 'of'");
eq(lvl(null, "Bachelor In Nursing"), "bachelor", "…on the undergraduate side too");
eq(lvl(null, "Master in Research"), "master_research", "…and it doesn't shadow the research master");
eq(lvl(null, "Educational Specialist (EdS)"), "master", "EdS folds onto the nearest platform level");
eq(lvl(null, "Nursing"), null, "nothing to go on → unlinked, not guessed");

// The name is verbatim from the page, so it outranks a vaguer model answer …
eq(lvl("Other", "Anthropology Ph.D."), "doctoral", "the name beats a vague 'Other'");
// … except where the model read the page and was MORE specific than a bare 'Certificate'.
eq(lvl("Graduate Certificate", "Certificate in Clinical Education"), "graduate_diploma", "a more specific model answer wins over a bare 'Certificate'");
eq(lvl("Certificate", "Certificate in Clinical Education"), "certificate", "…but not when the model also just said Certificate");

// ── Empty lists (seeders never run) must not crash or link ──
const EMPTY: LookupLists = { areas: [], levels: [] };
eq(resolveAreaOfStudy(EMPTY, "Health and Medicine"), null, "no seeded areas → nothing links");
eq(resolveDegreeLevel(EMPTY, "Bachelor", "Nursing BSc"), null, "no seeded levels → nothing links");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
