/**
 * jevThreshold: TYPESAFE_API_KEY alone turns every extraction Jev feature on at its built-in default;
 * an env value in (0, 1) overrides it; "0"/"off" switches that feature off; no key = all off.
 * Run: npm run test:jev-client
 */
import { config } from "../src/config.js";
import { JEV_DEFAULTS, jevThreshold, type JevSetting } from "../src/modules/superadmin/data-extraction/lib/jev-client.js";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; console.error(`FAIL ${label}\n  expected ${e}\n  got      ${a}`); }
}

const cfg = config as { TYPESAFE_API_KEY?: string };
const keys = Object.keys(JEV_DEFAULTS) as JevSetting[];
for (const k of keys) delete process.env[k];

cfg.TYPESAFE_API_KEY = "";
eq(keys.map((k) => jevThreshold(k)), keys.map(() => null), "no key → every feature off, whatever the env says");
process.env.JEV_LINK_MIN = "0.5";
eq(jevThreshold("JEV_LINK_MIN"), null, "a threshold without the key does not turn anything on");
delete process.env.JEV_LINK_MIN;

cfg.TYPESAFE_API_KEY = "ts-test";
eq(keys.map((k) => jevThreshold(k)), keys.map((k) => JEV_DEFAULTS[k] ?? null), "key only → every feature at its default");
eq([jevThreshold("JEV_PAGE_GATE_MIN"), jevThreshold("JEV_VERIFY_DROP_MIN")], [null, null], "key only → the two features that can REMOVE data stay off");
eq(jevThreshold("JEV_VERIFY_FLAG_MIN"), 0.9, "key only → suspects are reported (never deleted)");

process.env.JEV_VERIFY_DROP_MIN = "0.97";
eq(jevThreshold("JEV_VERIFY_DROP_MIN"), 0.97, "an env value in (0,1) overrides the default");
process.env.JEV_PAGE_GATE_MIN = "0.05";
eq(jevThreshold("JEV_PAGE_GATE_MIN"), 0.05, "an off-by-default feature turns on only when its env var is set");
for (const off of ["0", "off", "OFF", "false"]) {
  process.env.JEV_LINK_MIN = off;
  eq(jevThreshold("JEV_LINK_MIN"), null, `"${off}" switches the feature off`);
}
for (const bad of ["", "abc", "1", "1.5", "-0.2"]) {
  process.env.JEV_LOOKUP_MIN = bad;
  eq(jevThreshold("JEV_LOOKUP_MIN"), JEV_DEFAULTS.JEV_LOOKUP_MIN, `invalid "${bad}" falls back to the default, never to off or a wild value`);
}

eq([JEV_DEFAULTS.JEV_VERIFY_DROP_MIN, JEV_DEFAULTS.JEV_PAGE_GATE_MIN], [null, null], "no built-in default can remove data or skip a page");

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
