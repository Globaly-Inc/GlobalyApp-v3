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

function isPrivateIPv6(ip: string): boolean {
  const s = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (s === "::" || s === "::1") return true;               // unspecified, loopback
  if (s.startsWith("fe80")) return true;                     // link-local
  if (/^f[cd]/.test(s)) return true;                          // fc00::/7 unique-local
  // ::ffff:127.0.0.1 — an IPv4 loopback wearing an IPv6 hat.
  const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
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

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
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
