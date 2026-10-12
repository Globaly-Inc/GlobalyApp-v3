/**
 * The widget's FIRST reply must ask the visitor about themselves, not hand out courses.
 *
 * The symptom: a visitor opened with a broad starter ("what courses do you offer?"), retrieval
 * filled CONTEXT with a generic slice of the catalogue, and the counsellor's very first reply was
 * a course list — before it knew the field or the level, so none of it could be the right course.
 * The platform chat already had the cure (a discovery turn: no course data on turn 1, ask one
 * question instead); embed was explicitly exempt. It isn't any more.
 *
 * Run: npm run test:widget-discovery-turn    Pure function, no DB, no network.
 */
import assert from "node:assert/strict";
import { buildSystemPrompt } from "../src/modules/ai-counsellor/services/prompt.service.js";

const base = { profile: null, isFirstMessage: true, ragContext: "" } as const;
const widget = { display_name: "AIT", custom_instructions: null };

const first = buildSystemPrompt({ ...base, discoveryTurn: true, embedConfig: widget });

// Turn 1 withholds the catalogue and says so — the instruction the course-dump defied.
assert.match(first, /THIS IS A DISCOVERY TURN/);
assert.match(first, /do NOT name or recommend any specific course or institution/);

// Turn 1 asks the STUDY LEVEL and only that — asked together with the subject, the model merged
// them into "which area and study level interest you most?", which no option row can answer.
assert.match(first, /your one question this turn is the STUDY LEVEL/, "the widget turn asks for the level");
assert.match(first, /bachelor's, master's, PhD\/doctorate, short course/, "the levels are named");
assert.match(first, /Do NOT ask about the subject, field or area this turn/, "the field waits for turn 2");
assert.match(first, /the field is the NEXT turn's question/, "and the model is told where it went");
// The example it copies must be a level question, not the platform's "what draws you to maths?".
assert.match(first, /"question":"What level are you looking to study at\?"/, "level-shaped example");

// The platform's own discovery turn keeps its wording; this is an embed-only addition.
const platform = buildSystemPrompt({ ...base, discoveryTurn: true });
assert.ok(!platform.includes("This visitor is anonymous"), "platform students are not anonymous visitors");
assert.match(platform, /THIS IS A DISCOVERY TURN/, "platform discovery is untouched");

// ── Turn 2: the stream question ──────────────────────────────────────────────
// Answering the level with three courses "spanning business, environmental science and
// engineering" was the complaint: a sampler chosen before anyone knew which of the three.
const CATALOGUE = [
  { degree_level: "Master's", subject_area: "Engineering", count: 12 },
  { degree_level: "Master's", subject_area: "Management", count: 6 },
  { degree_level: "Doctoral (PhD)", subject_area: "Engineering", count: 4 },
];
const second = buildSystemPrompt({
  profile: null, isFirstMessage: false, ragContext: "",
  streamTurn: "Master's", catalogue: CATALOGUE, embedConfig: widget,
});
assert.match(second, /THIS IS THE SECOND DISCOVERY TURN/);
// Courses were withheld on purpose, so the searched-and-found-nothing rule must not also fire:
// it forbids saying what we offer, which is exactly what the stream list is.
assert.ok(!second.includes("NO RECORDS RETRIEVED"), "a deliberate stream turn is not an empty search");
assert.match(second, /do NOT emit course-card blocks/, "still no cards on the stream turn");
// The streams come from the catalogue, at the level they named — not from the model's imagination.
assert.match(second, /Engineering \(12\), Management \(6\)/, "streams are the real ones, commonest first");
assert.ok(!second.includes("Doctoral"), "another level's streams are not offered");

// Turn 1 names the real levels for the same reason.
const withLevels = buildSystemPrompt({ ...base, discoveryTurn: true, catalogue: CATALOGUE, embedConfig: widget });
assert.match(withLevels, /OUR LEVELS \(level, course count — offer only these\): Master's \(18\), Doctoral \(PhD\) \(4\)/);

// The broad "short course" bucket is ours, not a value any catalogue spells: it has to reach the
// certificates and diplomas, which are what an institution actually lists (Greptile). A named
// qualification still matches only its own rows.
const SHORT = [
  { degree_level: "Certificate", subject_area: "Engineering", count: 7 },
  { degree_level: "Advanced Diploma", subject_area: "Management", count: 3 },
  { degree_level: "Master's", subject_area: "Engineering", count: 12 },
];
const shortTurn = buildSystemPrompt({
  profile: null, isFirstMessage: false, ragContext: "",
  streamTurn: "Short course", catalogue: SHORT, embedConfig: widget,
});
assert.match(shortTurn, /Engineering \(7\), Management \(3\)/, "short course reaches certificates and diplomas");
assert.ok(!shortTurn.includes("You have no stream list"), "a catalogue of certificates is not an empty catalogue");
assert.ok(!shortTurn.includes("(12)"), "and does not drag the master's rows in with them");

const certTurn = buildSystemPrompt({
  profile: null, isFirstMessage: false, ragContext: "",
  streamTurn: "Certificate", catalogue: SHORT, embedConfig: widget,
});
assert.match(certTurn, /Engineering \(7\)/, "a named certificate matches its own rows");
assert.ok(!certTurn.includes("Management"), "and not the diplomas beside them");

// No catalogue (the query failed, or a widget with no jobs): ask openly, never guess a stream.
const blind = buildSystemPrompt({
  profile: null, isFirstMessage: false, ragContext: "", streamTurn: "Master's", embedConfig: widget,
});
assert.match(blind, /You have no stream list this turn/, "a failed lookup must not become an invented list");

// Turn 3 onwards: no discovery block at all, so courses flow normally.
const later = buildSystemPrompt({ profile: null, isFirstMessage: false, ragContext: "--- COURSES ---\nBSc Nursing", embedConfig: widget });
assert.ok(!later.includes("THIS IS A DISCOVERY TURN"), "recommendations resume once discovery is done");
assert.match(later, /CONTEXT:\n--- COURSES ---/);

console.log("widget-discovery-turn: ok");
