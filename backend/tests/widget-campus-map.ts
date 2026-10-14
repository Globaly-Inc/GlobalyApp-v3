/**
 * Which campuses the widget pins on a map, and which it refuses to.
 *
 * Two product rules are pinned here. The map is CITY level — the query handed to the embed is the
 * same city/state/country `placeOf` text the prompt section uses, never the street address, so the
 * pin cannot say more than the reply already did (owner decision, 2026-10-08). And the map follows
 * the reply: a campus the counsellor actually mentioned gets a pin, an answer about fees gets none.
 *
 * Run: npm run test:widget-campus-map    Pure function, no DB, no network.
 */
import assert from "node:assert/strict";
import { mapLocationsFor, asksAboutPlace } from "../src/modules/ai-counsellor/lib/visitor-location.js";

const BRANCHES = [
  { name: "AIT Main Campus", country: "Thailand", state: "Pathum Thani", city: "Bangkok",
    address: "58 Moo 9, Km. 42 Paholyothin Highway", phone: "+66 2 524 5000", is_primary: true },
  { name: "AIT Vietnam", country: "Vietnam", state: null, city: "Hanoi",
    address: "Luong The Vinh Street", phone: null, is_primary: false },
  // No city: Google would resolve "AIT Liaison Office, Vietnam" to the middle of a country.
  { name: "AIT Liaison Office", country: "Vietnam", state: null, city: null, address: null },
];

// ── The reply names both campuses, so both get a pin ──────────────────────────
const both = mapLocationsFor(
  "We teach at two campuses: our main campus near Bangkok, and a second in Hanoi, Vietnam.",
  BRANCHES,
);
assert.deepEqual(both.map((l) => l.label), ["Bangkok", "Hanoi"], "a reply naming two campuses pins both");

// ── The pin is a place, never a street address ────────────────────────────────
// This is the whole D1 decision in one assertion: the query is what Google resolves, so if the
// street ever leaks into it the map becomes the address disclosure the data layer removed.
assert.equal(both[0].query, "AIT Main Campus, Bangkok, Pathum Thani, Thailand");
for (const pin of both) {
  assert.ok(!/\d/.test(pin.query), `no street number reaches the map query: ${pin.query}`);
  assert.ok(!/Paholyothin|Luong The Vinh/.test(pin.query), `no street name reaches the map query: ${pin.query}`);
}

// ── A campus with no city is skipped even when the reply names it ─────────────
assert.deepEqual(
  mapLocationsFor("You can also reach our AIT Liaison Office.", BRANCHES),
  [],
  "a branch with no city is left off the map rather than pinned at country level",
);

// ── An answer about something else gets no map ───────────────────────────────
assert.deepEqual(
  mapLocationsFor("Total tuition for the professional master's is USD 11,890.", BRANCHES),
  [],
  "a reply that names no campus carries no map",
);

// ── Matching is on whole words, not substrings ───────────────────────────────
assert.deepEqual(
  mapLocationsFor("Our alumni work across Hanoian industry.", BRANCHES),
  [],
  "'Hanoian' is not the city Hanoi",
);

// ── One campus named, one not ────────────────────────────────────────────────
assert.deepEqual(
  mapLocationsFor("That program runs from our Hanoi campus.", BRANCHES).map((l) => l.name),
  ["AIT Vietnam"],
  "only the campus the reply actually named is pinned",
);

// ── A reply's wording is not the row's wording ───────────────────────────────
// The shapes below are real AIT rows. A counsellor writes "our Hanoi campus"; the row is named
// "Vietnam (Hanoi) Campus" and its city is the ward. Whole-phrase matching never fired on that,
// which is why the map stayed invisible on the first live test.
const REAL = [
  { name: "Vietnam (Hanoi) Campus", country: "Hanoi", state: null, city: "Cau Giay Ward",
    address: "DETECH Tower, 3rd Floor, 8 Ton That Thuyet Street" },
  // Name only, no place anywhere: unpinnable, however often the reply says it.
  { name: "Main Campus", country: null, state: null, city: null, address: null },
];

const hanoi = mapLocationsFor("That program runs from our Hanoi campus.", REAL);
assert.deepEqual(hanoi.map((l) => l.name), ["Vietnam (Hanoi) Campus"],
  "a distinctive word of the campus name is enough — the reply need not quote the row");
assert.equal(hanoi[0].query, "Vietnam (Hanoi) Campus, Cau Giay Ward, Hanoi");
assert.equal(hanoi[0].label, "Cau Giay Ward");

assert.deepEqual(
  mapLocationsFor("Our main campus has a library and a sports centre.", REAL),
  [],
  "'main campus' names no place, so it pins nothing — generic words never match",
);

// A branch with a city but a generic name still needs the reply to name its place.
assert.deepEqual(
  mapLocationsFor("Our main campus is lovely.", [{ name: "Main Campus", country: "Thailand", state: null, city: "Pathumthani", address: null }]),
  [],
  "a pinnable row is still not pinned until the reply names where it is",
);

// ── Spacing differs between the row and the reply ────────────────────────────
// Live AIT, 2026-10-14: the row's city is "Pathumthani", the counsellor writes "Pathum Thani",
// and the Thai campus silently dropped off a map that pinned both Vietnamese ones. One place
// spelled two ways is still one place.
const SPACED = [
  { name: "ACECOMS, AIT", country: "Thailand", state: null, city: "Pathumthani", address: "58 Moo 9" },
];
assert.deepEqual(
  mapLocationsFor("Our main campus is in Pathum Thani, Thailand.", SPACED).map((l) => l.label),
  ["Pathumthani"],
  "a row written solid still matches a reply that spaces the name",
);
assert.deepEqual(
  mapLocationsFor("Our main campus is in Pathumthani, Thailand.",
    [{ name: "Campus", country: "Thailand", state: null, city: "Pathum Thani", address: null }]).map((l) => l.label),
  ["Pathum Thani"],
  "and the same the other way round, when the ROW is the spaced one",
);
// The join is of adjacent WORDS, never of the whole string, so boundaries survive.
assert.deepEqual(
  mapLocationsFor("Our alumni work across Hanoian industry.", BRANCHES), [],
  "joining words must not resurrect the substring match — 'Hanoian' is still not Hanoi",
);

// ── One pin per place, however many rows describe it ─────────────────────────
// Extracted catalogues hold the same campus several times under different names.
const DUPES = [
  { name: "ACECOMS, AIT", country: "Thailand", state: null, city: "Pathumthani", address: "58 Moo 9" },
  { name: "ACECOMS", country: "Thailand", state: null, city: "Pathumthani", address: "58 Moo 9" },
  { name: "AIT Library", country: "Thailand.", state: null, city: "Pathumthani", address: "58 Moo. 9" },
];
assert.deepEqual(
  mapLocationsFor("Our campus is in Pathumthani.", DUPES).map((l) => l.name),
  ["ACECOMS, AIT"],
  "three rows for one address are one pin, not three identical chips",
);

// ── The VISITOR has to have asked ────────────────────────────────────────────
// Owner complaint, 2026-10-14: the map rode along on nearly every reply. The reply was the only
// trigger, and a counsellor names the campus city constantly ("our Bangkok campus runs it in
// January"), so a map about a course's intake dates was attached to an answer nobody asked a
// location question in. The question is the gate now; the reply still decides WHICH campuses.
for (const asked of [
  "where are your campuses?",
  "Where are you located?",
  "how do I contact you?",
  "what is your address",
  "which campus is nearest to me?",
  "can I visit your office?",
]) assert.ok(asksAboutPlace(asked), `a place/contact question opens the map: ${asked}`);

for (const asked of [
  "what are the fees for the data science master's?",
  "when does the January intake start?",
  "do I need IELTS for this course?",
  "tell me more about that program",
  // The near-miss that matters: a COURSE question whose answer will certainly name the campus.
  "what does the professional master's cover?",
]) assert.ok(!asksAboutPlace(asked), `an ordinary question carries no map: ${asked}`);

console.log(`widget-campus-map: ok (${25} assertions)`);
