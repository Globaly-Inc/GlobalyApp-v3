/**
 * A send's response must not resurrect an address a Remove just deleted.
 *
 * `recipients` in a send response is the whole list as the SERVER read it. If a delete lands
 * while the send is in flight, that older list still carries the deleted row, and adopting it
 * wholesale puts the address back on screen (Greptile P2). The merge keeps the card's own state
 * for every row the send did not touch.
 *
 * Pure — no store, no React.
 * Run: node --import ../backend/node_modules/tsx/dist/loader.mjs tests/merge-sent-recipients.ts
 */

import assert from "node:assert/strict";
import { mergeSentRecipients } from "../src/app/business/ai-widget/utils/index.ts";

const row = (id: number, email: string) => ({ id, email, last_sent_at: null, send_count: 1 });

const gone = row(1, "gone@agency.com");
const kept = row(2, "kept@agency.com");
const fresh = row(3, "new@agency.com");

// THE RACE: the card already dropped `gone`; the send's response still lists it.
assert.deepEqual(
  mergeSentRecipients([kept], ["new@agency.com"], [fresh, gone, kept]).map((d) => d.email),
  ["new@agency.com", "kept@agency.com"],
  "a row the send did not touch stays deleted",
);

// The rows it DID touch come from the server, so send_count and last_sent_at are the new ones.
const bumped = { ...kept, send_count: 9 };
assert.deepEqual(
  mergeSentRecipients([kept], ["kept@agency.com"], [bumped]),
  [bumped],
  "a re-sent row takes the server's fresh counts, not the stale local copy",
);

// A read-back that failed server-side comes through empty: keep what the card has rather than
// blanking the list.
assert.deepEqual(
  mergeSentRecipients([kept], ["kept@agency.com"], []),
  [],
  "an empty server list drops only the rows it claimed to cover",
);
assert.deepEqual(
  mergeSentRecipients([kept], ["other@agency.com"], []),
  [kept],
  "...and leaves untouched rows alone",
);

// Newly sent rows lead, matching the server's newest-sent-first order.
assert.deepEqual(
  mergeSentRecipients([kept, gone], ["new@agency.com"], [fresh]).map((d) => d.email),
  ["new@agency.com", "kept@agency.com", "gone@agency.com"],
  "the address just mailed appears at the top",
);

console.log("PASS — a send response never resurrects a removed recipient");
