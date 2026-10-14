/**
 * Does the configured model still make the right handover call?
 *
 *   npm run handover:check              # the configured model (GEMINI_MODEL_LITE)
 *   npm run handover:check -- --full    # the same cases against GEMINI_MODEL, to compare
 *
 * READ ONLY. It sends a dozen short prompts to Gemini and writes nothing.
 *
 * Why it exists: judgeWantsHuman is the ONE model call that blocks a visitor's reply, so it runs
 * on the lite model. That is only safe while lite reaches the same verdict as the full model, and
 * nothing else in the suite would notice if a model revision started answering "false" to "can I
 * talk to a real person" — the chat would simply never reach a human again, silently.
 *
 * Exits 1 on any mismatch, so it can gate a model change.
 */

/** The prompt's own true/false examples, plus the near-misses it exists to get right. */
const CASES: Array<[string, boolean]> = [
  ["can I talk to a real person", true],
  ["I want to speak to someone from admissions", true],
  ["is there a human here?", true],
  ["connect me to an advisor please", true],
  ["can someone from your team call me", true],
  ["who is the course coordinator?", false],
  ["what is the admissions email?", false],
  ["can I call the office?", false],
  ["is there a person I can email about visas?", false],
  ["does the team offer scholarships?", false],
  ["thanks, that's all", false],
  ["what are the entry requirements for the nursing course?", false],
];

const full = process.argv.includes("--full");
// Blank, not "the full model's name" — an empty GEMINI_MODEL_LITE is gemini.ts's own documented
// opt-out: every `tier: "lite"` call then runs on GEMINI_MODEL. And it has to be set BEFORE the
// imports below, which is why they are dynamic: config parses process.env once at import time, so
// an assignment after it is read by nobody and --full silently measured lite a second time.
// (dotenv leaves a key that already exists alone, so "" survives config's own `dotenv/config`.)
if (full) process.env.GEMINI_MODEL_LITE = "";

const { judgeWantsHuman, MIGHT_WANT_HUMAN } = await import("../src/modules/ai-counsellor/lib/handover-detect.js");
const { config } = await import("../src/config.js");

const model = full ? config.GEMINI_MODEL : config.GEMINI_MODEL_LITE;
console.log(`Judging ${CASES.length} messages with ${model}\n`);

let wrong = 0;
let elapsed = 0;
for (const [message, expected] of CASES) {
  // A case the regex rejects never reaches the model, so a narrowed regex is a silent miss too.
  if (!MIGHT_WANT_HUMAN.test(message) && expected) {
    console.log(`  REGEX MISS  "${message}" — never reaches the judge`);
    wrong++;
    continue;
  }
  const started = Date.now();
  const got = await judgeWantsHuman(message);
  elapsed += Date.now() - started;
  if (got !== expected) {
    console.log(`  MISMATCH    "${message}" → ${got}, expected ${expected}`);
    wrong++;
  }
}

console.log(`\n${CASES.length - wrong}/${CASES.length} correct, avg ${Math.round(elapsed / CASES.length)}ms per judged message`);
if (wrong) {
  console.log("A wrong verdict here is a chat that never reaches a human, or one handed over for a question the AI could answer.");
  process.exit(1);
}
