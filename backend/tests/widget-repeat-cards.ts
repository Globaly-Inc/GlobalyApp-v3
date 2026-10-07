/**
 * A follow-up about a course must not re-show that course's card. The ids that make a follow-up
 * answerable (pinnedCourseIdsFrom) are the same ids the model parrots back as cards, so the two
 * functions are tested together — their interplay is what makes repeated follow-ups work.
 *
 * Run: npm run test:widget-repeat-cards    Pure functions, no DB, no network.
 */
import assert from "node:assert/strict";
import { dropShownCards, pinnedCourseIdsFrom } from "../src/modules/ai-counsellor/services/rag.service.js";

const phd = { id: "c-phd", name: "PhD" };
const dba = { id: "c-dba", name: "Doctor of Business Administration" };
const msc = { id: "c-msc", name: "MSc Data Science" };

// Turn 1 showed both. Turn 2 asks what the PhD requires — neither card comes back.
const afterTurn1 = [
  { role: "user", cards: [] },
  { role: "assistant", cards: [phd, dba] },
];
const shown = pinnedCourseIdsFrom(afterTurn1);
assert.deepEqual(shown, ["c-phd", "c-dba"]);
assert.deepEqual(dropShownCards([phd, dba], shown), []);
// A genuinely new recommendation still gets through; only the repeats are dropped.
assert.deepEqual(dropShownCards([phd, msc], shown), [msc]);

// Turn 2 emitted no cards (they were dropped). Turn 3 asks another follow-up: the pin still points
// at turn 1, so the same two courses stay suppressed instead of reappearing one turn later.
const afterTurn2 = [...afterTurn1, { role: "user", cards: [] }, { role: "assistant", cards: [] }];
assert.deepEqual(pinnedCourseIdsFrom(afterTurn2), ["c-phd", "c-dba"]);
assert.deepEqual(dropShownCards([dba], pinnedCourseIdsFrom(afterTurn2)), []);

// Nothing shown yet: the first recommendation of the conversation is untouched.
assert.deepEqual(dropShownCards([phd, dba], []), [phd, dba]);
assert.deepEqual(dropShownCards([phd], pinnedCourseIdsFrom([{ role: "user", cards: [] }])), [phd]);
// A card with no id is never silently swallowed.
assert.deepEqual(dropShownCards([{ name: "no id" } as { id?: string; name: string }], shown).length, 1);

console.log("widget-repeat-cards: ok");
