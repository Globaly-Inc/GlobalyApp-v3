/**
 * situationText() test — the profile+context → search-text composition behind the
 * proactive Knowledge Rack briefing (rag.service.counsellorBriefing).
 * Run: node --import tsx tests/counsellor-briefing.ts   (or: npm run test:counsellor-briefing)
 *
 * Style matches tests/rack-chunk-budget.ts: plain tsx script, no framework.
 * Pure function — no DB, no embeddings, no API key.
 *
 * The case that matters: the briefing query must describe the student's SITUATION so
 * situation-scoped guidance surfaces, and must degrade to null (message-only search)
 * for an anonymous/empty profile rather than embedding junk like "budget ? - ?".
 */

import { situationText } from "../src/modules/ai-counsellor/services/rag.service.js";
import type { ProfileContext } from "../src/modules/ai-counsellor/repositories/knowledge.repository.js";

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    console.error(`  FAIL ${label}${detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  }
}

const emptyProfile = (profile: Record<string, unknown> | null): ProfileContext =>
  ({ profile, qualifications: [], language_tests: [], work_experiences: [] }) as unknown as ProfileContext;

function main() {
  console.log("\nsituationText — nothing known");
  assert(situationText(null, null) === null, "null profile + null context → null");
  assert(situationText(emptyProfile(null), {}) === null, "empty profile + empty context → null");

  console.log("\nsituationText — profile fields");
  {
    const text = situationText(
      emptyProfile({
        nationality: "Nepalese",
        degree_level: "Bachelor",
        preferred_destinations: ["Australia"],
        budget_min: 20000,
        budget_max: null,
        budget_currency: "AUD",
      }),
      null,
    );
    assert(text != null && text.includes("nationality Nepalese"), "nationality included", text);
    assert(text != null && text.includes("highest degree Bachelor"), "degree level included", text);
    assert(text != null && text.includes("Australia"), "preferred destination included", text);
    assert(text != null && text.includes("budget AUD 20000-?"), "half-open budget rendered", text);
  }

  console.log("\nsituationText — session context only");
  {
    const text = situationText(null, {
      goals: ["work in AI"],
      interests: ["mathematics"],
      constraints: ["under 25k"],
      stage: "narrowing",
    });
    assert(text != null && text.includes("goals: work in AI"), "goals included", text);
    assert(text != null && text.includes("interests: mathematics"), "interests included", text);
    assert(text != null && text.includes("constraints: under 25k"), "constraints included", text);
    assert(text != null && text.includes("journey stage: narrowing"), "stage included", text);
  }

  console.log("\nsituationText — empty arrays are not situation");
  assert(
    situationText(null, { goals: [], interests: [], constraints: [] }) === null,
    "all-empty context → null",
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
