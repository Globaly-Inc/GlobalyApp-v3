/**
 * assertPublicUrl is the SSRF boundary for every user-supplied URL the SERVER fetches.
 * The widget site index stores what it fetches and serves it back to the same user, so a
 * hole here is credential exfiltration (169.254.169.254 hands out instance credentials),
 * not merely a blind request. Hence a test per bypass class.
 * Run: node --import tsx tests/public-url-guard.ts
 */
import { assertPublicUrl, UnsafeUrlError, isPrivateAddress } from "../src/shared/public-url.js";

let failed = 0;
function assert(ok: boolean, label: string) {
  if (ok) return;
  failed++;
  console.error(`FAIL: ${label}`);
}

/**
 * `reason` is checked, not just the rejection. Every IPv6 case once passed for the WRONG
 * reason — rejected as a "dotless internal name" because the brackets were still on the
 * hostname, so the IPv6 range logic never ran and the suite could not see it.
 */
async function rejects(input: string, label: string, reason?: RegExp) {
  try {
    await assertPublicUrl(input, { skipDns: true });
    failed++;
    console.error(`FAIL: ${label} — was ACCEPTED`);
  } catch (e) {
    assert(e instanceof UnsafeUrlError, `${label} — rejected with UnsafeUrlError`);
    if (reason) {
      assert(reason.test((e as Error).message), `${label} — rejected for the right reason (got "${(e as Error).message}")`);
    }
  }
}

async function accepts(input: string, label: string) {
  try {
    await assertPublicUrl(input, { skipDns: true });
  } catch (e) {
    failed++;
    console.error(`FAIL: ${label} — was REJECTED (${(e as Error).message})`);
  }
}

async function main() {
  // ── the cloud metadata endpoint, in its many spellings ──
  await rejects("http://169.254.169.254/latest/meta-data/", "AWS/GCP metadata IP");
  await rejects("http://metadata.google.internal/computeMetadata/v1/", "GCP metadata hostname");
  await rejects("http://[fe80::1]/", "IPv6 link-local", /private network/);

  // ── loopback and private ranges ──
  await rejects("http://localhost:6379", "localhost");
  await rejects("http://127.0.0.1/admin", "IPv4 loopback");
  await rejects("http://[::1]/", "IPv6 loopback", /private network/);
  // WHATWG URL rewrites these into hex (::ffff:7f00:1), so a dotted-quad check misses
  // them entirely — the bug the bracket fix uncovered.
  await rejects("http://[::ffff:127.0.0.1]/", "IPv4 loopback mapped into IPv6", /private network/);
  await rejects("http://[::ffff:7f00:1]/", "mapped loopback written in hex", /private network/);
  await rejects("http://[::ffff:10.0.0.1]/", "mapped private range", /private network/);
  await rejects("http://[::ffff:a00:1]/", "mapped private range in hex", /private network/);
  await rejects("http://[64:ff9b::7f00:1]/", "NAT64-embedded loopback", /private network/);
  await rejects("http://[2001:db8::1]/", "documentation range", /private network/);
  await rejects("http://[ff02::1]/", "IPv6 multicast", /private network/);
  await rejects("http://10.0.0.5/", "10/8 private");
  await rejects("http://192.168.1.1/", "192.168/16 private");
  await rejects("http://172.16.0.1/", "172.16/12 private");
  await rejects("http://100.64.0.1/", "carrier NAT");
  await rejects("http://0.0.0.0/", "0.0.0.0");

  // ── internal naming and non-http schemes ──
  await rejects("http://redis/", "dotless internal hostname", /private network/);
  await rejects("http://db.internal/", ".internal suffix");
  await rejects("http://printer.local/", ".local suffix");
  await rejects("file:///etc/passwd", "file: scheme");
  await rejects("gopher://evil/", "non-http scheme");
  await rejects("http://user:pass@example.com/", "embedded credentials");
  await rejects("not a url at all", "unparseable input");

  // ── real institution websites must still work ──
  await accepts("https://amberton.edu/", "a real https website");
  await accepts("www.curtin.edu.au", "a bare domain with no scheme");
  await accepts("https://www.crandallu.ca/about", "a path is fine — origin is taken later");
  await accepts("http://93.184.216.34/", "a PUBLIC ipv4 literal");
  // Was rejected before the bracket strip: URL.hostname hands back "[2606:...]" and
  // isIP() reads that as a name, not an address.
  await accepts("http://[2606:4700::1111]/", "a PUBLIC ipv6 literal");
  await accepts("https://[2001:4860:4860::8888]:8443/courses", "a public ipv6 literal with port and path");

  // ── the range helper itself ──
  assert(isPrivateAddress("169.254.169.254"), "169.254.169.254 is private");
  assert(!isPrivateAddress("8.8.8.8"), "8.8.8.8 is public");
  assert(isPrivateAddress("::1"), "::1 is private");
  assert(!isPrivateAddress("2606:4700::1111"), "public IPv6 is public");

  console.log(failed === 0 ? "PASS — SSRF guard rejects every private target and allows real sites" : `${failed} failure(s)`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
