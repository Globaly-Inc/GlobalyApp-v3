// Copies an extracted (hot-linked) image into our own storage, so the profile no longer depends
// on the institution's site keeping it up, and the "Adjust image" crop can load it through the
// same-origin /api/image-proxy (which only proxies our storage host).
//
// The URL comes from scraped page content, so this is a server-side fetch of an untrusted URL:
// public http(s) on the default ports only, no redirects (a redirect could point back inside),
// images only, and the normal upload size cap enforced while streaming. The private-address check
// runs INSIDE the connection's own DNS lookup (guardedLookup), so the address that was checked is
// the one connected to — a host can't pass the check and then rebind to an internal address.

import { BlockList, isIP, type LookupFunction } from "node:net";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { createHash } from "node:crypto";
import http from "node:http";
import https from "node:https";
import * as storage from "../../../../shared/storage/storageService.js";

const PRIVATE = new BlockList();
for (const [net, bits] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.168.0.0", 16], ["224.0.0.0", 4], ["240.0.0.0", 4]] as const) {
  PRIVATE.addSubnet(net, bits, "ipv4");
}
for (const [net, bits] of [["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10]] as const) {
  PRIVATE.addSubnet(net, bits, "ipv6");
}

/** True for loopback, private, link-local, CGNAT, multicast, reserved and IPv4-mapped addresses. */
export function isPrivateAddress(address: string): boolean {
  // An IPv4-mapped IPv6 address (::ffff:127.0.0.1) is judged by its IPv4 part — a ::ffff:0:0/96
  // subnet in the BlockList would match every plain IPv4 address too.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return isPrivateAddress(mapped[1]!);
  const family = isIP(address);
  if (family === 0) return true; // not an IP at all — refuse
  return PRIVATE.check(address, family === 6 ? "ipv6" : "ipv4");
}

/** dns.lookup that refuses (as a connection error) any host resolving to a non-public address. */
const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    const list = (addresses ?? []) as unknown as LookupAddress[];
    if (err) return callback(err, "", 0);
    if (list.length === 0 || list.some((a) => isPrivateAddress(a.address))) {
      return callback(Object.assign(new Error(`Blocked non-public address for ${hostname}`), { code: "EBLOCKED" }), "", 0);
    }
    if (options.all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list);
    callback(null, list[0]!.address, list[0]!.family);
  });
};

/** Why an image wasn't fetched: `refused` is final (private address, not an image, too big,
 * redirect, 4xx), `transient` may succeed later (timeout, network error, 5xx, 429). */
export type FetchOutcome = { mime: string; buffer: Buffer } | "refused" | "transient";

/** GET an image with the guards above; the body is cut off past `maxBytes`. */
export function fetchImageOutcome(url: URL, maxBytes: number): Promise<FetchOutcome> {
  // An IP-literal host connects without any DNS lookup, so guardedLookup never sees it — check it here.
  const literal = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(literal) && isPrivateAddress(literal)) return Promise.resolve("refused");
  return new Promise((resolve) => {
    let settled = false;
    const done = (o: FetchOutcome) => { if (!settled) { settled = true; resolve(o); } };
    const client = url.protocol === "https:" ? https : http;
    const req = client.get(url, { lookup: guardedLookup, timeout: 15_000 }, (res) => {
      const mime = (res.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
      const declared = Number(res.headers["content-length"] ?? 0);
      const status = res.statusCode ?? 0;
      // Not following redirects is deliberate (3xx lands here and is refused).
      if (status !== 200 || !EXT[mime] || declared > maxBytes) {
        req.destroy(); // close it — draining a body we won't keep would have no size cap
        return done(status >= 500 || status === 429 ? "transient" : "refused");
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) {
          req.destroy(); // stop reading — never buffer more than the cap
          return done("refused");
        }
        chunks.push(chunk);
      });
      res.on("end", () => done(size <= maxBytes ? { mime, buffer: Buffer.concat(chunks) } : "refused"));
      res.on("error", () => done("transient"));
    });
    // `timeout` above only fires on an idle socket; this is the deadline for the whole request, so
    // a site trickling small chunks can't hold the backfill or a promote request open forever.
    const deadline = setTimeout(() => { req.destroy(); done("transient"); }, 30_000);
    req.on("close", () => clearTimeout(deadline));
    req.on("timeout", () => req.destroy());
    // A host resolving to a private address is a refusal; any other connection error may pass.
    req.on("error", (err: NodeJS.ErrnoException) => done(err.code === "EBLOCKED" ? "refused" : "transient"));
  });
}

/** fetchImageOutcome without the reason: the image, or null on any refusal or failure. */
export async function fetchImage(url: URL, maxBytes: number): Promise<{ mime: string; buffer: Buffer } | null> {
  const o = await fetchImageOutcome(url, maxBytes);
  return typeof o === "string" ? null : o;
}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" };

/** The stored copy's path; or why there is none — `refused` is final, `transient` (timeout, 5xx,
 * storage unconfigured or failing) can be retried. */
export async function copyExternalImageOutcome(rawUrl: string, dir: string): Promise<{ path: string } | "refused" | "transient"> {
  if (!storage.isConfigured()) return "transient";
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return "refused";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "refused";
  if (url.port && url.port !== "80" && url.port !== "443") return "refused";
  const image = await fetchImageOutcome(url, storage.MAX_FILE_SIZE);
  if (typeof image === "string") return image;
  const { mime, buffer } = image;
  try {
    storage.validateFile(mime, buffer.length); // the shared type allowlist (size already capped)
  } catch {
    return "refused";
  }
  try {
    // Content-addressed, so re-running the backfill reuses the same object instead of piling up copies.
    const path = `${dir}/${createHash("sha256").update(buffer).digest("hex").slice(0, 32)}.${EXT[mime]}`;
    await storage.uploadFile(path, buffer, mime);
    return { path };
  } catch {
    return "transient";
  }
}

/** The stored copy's path, or null when the image can't (or mustn't) be copied — the caller then
 * keeps the original URL, which still displays. */
export async function copyExternalImage(rawUrl: string, dir: string): Promise<string | null> {
  const o = await copyExternalImageOutcome(rawUrl, dir);
  return typeof o === "string" ? null : o.path;
}
