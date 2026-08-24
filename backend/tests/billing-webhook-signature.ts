/**
 * Unit test for the hand-rolled Stripe webhook signature check (billing/lib/stripe.ts).
 * Pure — no DB, no server. Run: node --import tsx tests/billing-webhook-signature.ts
 * (or: npm run test:billing-webhook)
 */

import { createHmac } from "node:crypto";
import { verifyWebhookSignature } from "../src/modules/billing/lib/stripe.js";

const SECRET = "whsec_test_secret";
const BODY = Buffer.from(JSON.stringify({ id: "evt_1", type: "checkout.session.completed" }));

function sign(timestamp: number, body: Buffer = BODY, secret = SECRET): string {
  const digest = createHmac("sha256", secret).update(`${timestamp}.${body.toString("utf8")}`).digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

let passed = 0;
let failed = 0;
function check(name: string, condition: boolean) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${name}`);
  }
}

check("valid signature accepted", verifyWebhookSignature(BODY, sign(Date.now()), SECRET));
check("wrong secret rejected", !verifyWebhookSignature(BODY, sign(Date.now(), BODY, "whsec_other"), SECRET));
check("tampered body rejected", !verifyWebhookSignature(Buffer.from("{}"), sign(Date.now()), SECRET));
check("missing header rejected", !verifyWebhookSignature(BODY, undefined, SECRET));
check("malformed header rejected", !verifyWebhookSignature(BODY, "not-a-real-header", SECRET));

// Multiple v1= pairs (secret rotation) — either being valid must pass.
const ts = Date.now();
const rotatedHeader = `t=${ts},v1=deadbeef,v1=${createHmac("sha256", SECRET).update(`${ts}.${BODY.toString("utf8")}`).digest("hex")}`;
check("rotation: second v1 valid among several accepted", verifyWebhookSignature(BODY, rotatedHeader, SECRET));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
