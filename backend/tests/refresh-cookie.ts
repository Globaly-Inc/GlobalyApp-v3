// Run: node --import tsx tests/refresh-cookie.ts
import assert from "node:assert/strict";
import { readCookie } from "../src/modules/auth/refresh-cookie";

assert.equal(readCookie(undefined, "globaly_rt"), undefined);
assert.equal(readCookie("a=1; globaly_rt=abc.def; b=2", "globaly_rt"), "abc.def");
assert.equal(readCookie("xglobaly_rt=nope", "globaly_rt"), undefined);
assert.equal(readCookie("globaly_rt=one; globaly_rt=two", "globaly_rt"), undefined); // never trust duplicates
assert.equal(readCookie("globaly_rt=%E0%A4%A", "globaly_rt"), undefined); // malformed
assert.equal(readCookie("globaly_rt=", "globaly_rt"), undefined); // cleared
console.log("refresh-cookie: ok");
