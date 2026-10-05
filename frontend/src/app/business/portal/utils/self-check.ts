/**
 * Assertions for parseEmails — the one piece of real logic behind the "send the code to anyone"
 * dialog. Plain node:assert, no framework, same shape as src/lib/api/self-check.ts.
 *
 * Run: node --import ../backend/node_modules/tsx/dist/loader.mjs src/app/business/portal/utils/self-check.ts
 *      (node 20 here has no type stripping; the repo already keeps tsx in backend/)
 */

import assert from "node:assert/strict";
import { parseEmails } from "./index.ts";

// People paste addresses out of a mail client, a spreadsheet or a chat message. Whatever
// separator came with them, one address must not be read as part of the next.
assert.deepEqual(parseEmails("a@x.com, b@x.com").valid, ["a@x.com", "b@x.com"], "comma-separated");
assert.deepEqual(parseEmails("a@x.com b@x.com").valid, ["a@x.com", "b@x.com"], "space-separated");
assert.deepEqual(parseEmails("a@x.com;b@x.com").valid, ["a@x.com", "b@x.com"], "semicolon-separated");
assert.deepEqual(parseEmails("a@x.com\nb@x.com").valid, ["a@x.com", "b@x.com"], "newline-separated");

// The backend dedupes too, but the count shown next to the box has to match what is sent.
assert.deepEqual(parseEmails("a@x.com, A@X.com").valid, ["a@x.com"], "deduped, case-insensitively");

// Invalid addresses are reported, never silently dropped — the dialog names them back.
const mixed = parseEmails("good@x.com, nope");
assert.deepEqual(mixed.valid, ["good@x.com"], "the good one is kept");
assert.deepEqual(mixed.invalid, ["nope"], "and the bad one is named, not swallowed");

// Trailing separators are what a paste usually ends with; they must not become an empty address.
assert.deepEqual(parseEmails("a@x.com,  ").valid, ["a@x.com"], "trailing separators ignored");
assert.deepEqual(parseEmails("   ").valid, [], "whitespace alone is no address");
assert.deepEqual(parseEmails("   ").invalid, [], "and is not an invalid one either");

console.log("portal utils self-check: all assertions passed");
