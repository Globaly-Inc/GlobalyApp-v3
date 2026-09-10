// Guard for any URL that arrives from a user and is then fetched BY THE SERVER.
//
// A user-supplied URL that the backend fetches is an SSRF primitive: the request leaves
// from inside our network, so it reaches things the user cannot — other services on
// localhost, private subnets, and the cloud metadata endpoint (169.254.169.254) that
// hands out instance credentials. When the fetched body is also stored and readable back
// by that user (the widget site index does exactly that), it stops being blind SSRF and
// becomes credential exfiltration.
//
// Both checks matter and neither is sufficient alone:
//   - the literal check stops http://169.254.169.254 and http://localhost
//   - the DNS check stops a public hostname whose A record points at 127.0.0.1, which no
//     amount of string inspection can catch

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class UnsafeUrlError extends Error {}

/** Hostnames that never belong to a real public website. */
const BLOCKED_HOSTNAMES = new Set(["localhost", "localhost.localdomain", "metadata", "metadata.google.internal"]);
const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".localdomain"];

function isPrivateIPv4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||                                  // 0.0.0.0/8 "this host"
    a === 10 ||                                 // private
    a === 127 ||                                // loopback
    (a === 100 && b >= 64 && b <= 127) ||       // 100.64/10 carrier NAT
    (a === 169 && b === 254) ||                 // link-local — cloud metadata lives here
    (a === 172 && b >= 16 && b <= 31) ||        // private
    (a === 192 && b === 168) ||                 // private
    (a === 192 && b === 0) ||                   // 192.0.0/24 protocol assignments
    a === 198 && (b === 18 || b === 19) ||      // benchmarking
    a >= 224                                    // multicast + reserved
  );
}

/**
 * IPv6 is ALLOW-listed, not deny-listed: an address counts as public only inside
 * 2000::/3, the range IANA actually allocates as global unicast.
 *
 * A deny-list could not hold here. WHATWG `URL` rewrites an IPv4-mapped address into hex —
 * `http://[::ffff:127.0.0.1]/` arrives as `::ffff:7f00:1` — so a dotted-quad pattern
 * matched nothing after parsing and loopback sailed through. Rather than chase each
 * spelling (`::ffff:7f00:1`, `::ffff:0:7f00:1`, `64:ff9b::7f00:1`, …), anything that is not
 * allocated global unicast is refused: mapped and embedded IPv4 all sit outside 2000::/3,
 * so the entire class goes with one rule.
 */
function isPrivateIPv6(ip: string): boolean {
  const s = ip.toLowerCase().replace(/^\[|\]$/g, "");
  const firstHextet = parseInt(s.split(":")[0] || "0", 16);
  // 2000::/3 — the top three bits are 001, i.e. a leading hextet of 2000–3fff.
  const isGlobalUnicast = !Number.isNaN(firstHextet) && firstHextet >= 0x2000 && firstHextet <= 0x3fff;
  if (!isGlobalUnicast) return true;
  // 2001:db8::/32 is reserved for documentation and routes nowhere real.
  if (/^2001:0*db8:/.test(s)) return true;
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  return isIP(ip) === 6 ? isPrivateIPv6(ip) : isPrivateIPv4(ip);
}

/**
 * Parse `input` and confirm it is a fetchable PUBLIC http(s) URL.
 *
 * Throws `UnsafeUrlError` with a user-safe message otherwise. Resolves DNS unless
 * `skipDns` is set — callers on a hot path that have already validated the host once can
 * skip the lookup, but the first validation of any user-supplied URL must not.
 */
export async function assertPublicUrl(
  input: string,
  opts: { skipDns?: boolean } = {},
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(input.includes("://") ? input : `https://${input}`);
  } catch {
    throw new UnsafeUrlError("That does not look like a valid web address");
  }

  // file:, gopher:, ftp: and friends reach places http clients should not.
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Only http and https addresses can be used");
  }
  // Credentials in a URL are a redirect-laundering trick and never needed for a website.
  if (url.username || url.password) {
    throw new UnsafeUrlError("Web addresses with embedded credentials are not allowed");
  }

  // URL.hostname keeps the square brackets on an IPv6 literal while isIP() wants them
  // gone. Left on, every IPv6 URL fell through to the dotless-name check below and was
  // rejected as private — which meant the IPv6 range logic was never reached AT ALL, and
  // the ::1 / fe80:: tests passed for the wrong reason.
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (BLOCKED_HOSTNAMES.has(host) || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new UnsafeUrlError("That address points inside a private network");
  }
  // A bare hostname with no dot is an internal name ("intranet", "redis").
  if (!host.includes(".") && isIP(host) === 0) {
    throw new UnsafeUrlError("That address points inside a private network");
  }
  if (isIP(host) !== 0) {
    if (isPrivateAddress(host)) throw new UnsafeUrlError("That address points inside a private network");
    return url; // a public IP literal needs no DNS resolution
  }

  if (opts.skipDns) return url;

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new UnsafeUrlError("That web address could not be resolved");
  }
  // ALL records must be public: one private answer in a round-robin set is enough for an
  // attacker to win the race on a later fetch.
  if (addresses.some((a) => isPrivateAddress(a.address))) {
    throw new UnsafeUrlError("That address resolves inside a private network");
  }
  return url;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * fetch() with the guard applied to EVERY hop.
 *
 * assertPublicUrl before a request is not enough on its own: fetch follows redirects by default,
 * so a public URL answering 302 http://169.254.169.254/ reaches the metadata endpoint with the
 * check already passed. Redirects are followed manually here so each hop is validated, which also
 * closes the DNS-rebind window between check and connect for every hop after the first.
 */
export async function safeFetch(
  input: string,
  init: RequestInit = {},
  opts: { maxRedirects?: number } = {},
): Promise<Response> {
  const maxRedirects = opts.maxRedirects ?? 5;
  let current = input;

  for (let hop = 0; ; hop++) {
    await assertPublicUrl(current);
    const res = await fetch(current, { ...init, redirect: "manual" });
    if (!REDIRECT_STATUSES.has(res.status)) return res;

    const location = res.headers.get("location");
    if (!location) return res;
    if (hop >= maxRedirects) throw new UnsafeUrlError("Too many redirects");
    current = new URL(location, current).toString();
  }
}
