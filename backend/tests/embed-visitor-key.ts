/**
 * visitorKey() is what keeps one university's widget conversation out of another's.
 * It is the whole isolation boundary for anonymous embed threads, so it gets a test:
 * a bug here silently shows visitor A's thread to a different institution's widget.
 * Run: node --import tsx tests/embed-visitor-key.ts
 */
let failed = 0;
function assert(ok: boolean, label: string) {
  if (ok) return;
  failed++;
  console.error(`FAIL: ${label}`);
}

async function main() {
  const { visitorKey, hashFingerprint } = await import("../src/modules/ai-counsellor/services/guest.service.js");

  const FP = "fp-visitor-1";
  const UNI_A = "11111111-1111-1111-1111-111111111111";
  const UNI_B = "22222222-2222-2222-2222-222222222222";

  assert(visitorKey(FP, UNI_A) === visitorKey(FP, UNI_A), "same browser + same widget → same thread");
  assert(visitorKey(FP, UNI_A) !== visitorKey(FP, UNI_B), "same browser + different widget → SEPARATE thread");
  assert(visitorKey("other-fp", UNI_A) !== visitorKey(FP, UNI_A), "different browser → different thread");

  // The IP is deliberately absent: mixing it in is right for a rate gate and wrong for a
  // conversation, since changing network would strand the visitor's thread.
  assert(visitorKey(FP, UNI_A) !== hashFingerprint(FP, UNI_A), "visitorKey is not the rate-gate hash");

  // A separator prevents fingerprint/key boundary collisions: without it, ("a","bc")
  // and ("ab","c") would hash to the same thread.
  assert(visitorKey("a", "bc") !== visitorKey("ab", "c"), "fingerprint/key boundary cannot be forged");

  assert(/^[0-9a-f]{64}$/.test(visitorKey(FP, UNI_A)), "key is a sha256 hex digest");

  console.log(failed === 0 ? "PASS — embed visitor threads are scoped per widget" : `${failed} failure(s)`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
