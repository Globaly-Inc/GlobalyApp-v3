/**
 * The Jev page gate skips the model only when it is ON, Jev ANSWERED, and p is BELOW the threshold.
 * Every other path extracts the page as before. Jev is faked. Run: npm run test:jev-page-gate
 */
import { _pageGateDeps, shouldSkipPage } from "../src/modules/superadmin/data-extraction/lib/jev-page-gate.js";
import { _jevDeps } from "../src/modules/superadmin/data-extraction/lib/jev-client.js";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; console.error(`FAIL ${label}\n  expected ${e}\n  got      ${a}`); }
}

let calls = 0;
const answer = (p: number | Error) => {
  _jevDeps.systemOne = (async () => {
    calls++;
    if (p instanceof Error) throw p;
    return { answers: { programme: { noul: p } } };
  }) as unknown as typeof _jevDeps.systemOne;
};

_pageGateDeps.threshold = () => null;
answer(0.01);
eq((await shouldSkipPage("https://x.edu/news", "text")).skip, false, "gate off → never skips");
eq(calls, 0, "gate off → Jev is not called (no spend)");

_pageGateDeps.threshold = () => 0.1;
answer(0.03);
eq((await shouldSkipPage("https://x.edu/news", "text")).skip, true, "below threshold → skip");
answer(0.4);
eq((await shouldSkipPage("https://x.edu/programs/ba", "text")).skip, false, "at/above threshold → extract");
answer(new Error("429"));
eq((await shouldSkipPage("https://x.edu/programs/ba", "text")).skip, false, "Jev failure → extract, never skip");

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
