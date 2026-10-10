// The refresh token's home in the browser: an httpOnly cookie the API sets on its own host.
//
// Page scripts can't read it and a sibling subdomain can't plant one (no Domain attribute, so
// only api.* ever receives or sets it), which is what keeps a shared sign-in across
// web.globalyai.com and app.globalyai.com from becoming a token every subdomain can see.
// Both hosts are the same site as api.*, so SameSite=Lax still sends it on their fetches.
//
// The hint cookie is the opposite: readable, on the parent domain, carrying no secret. It only
// tells a page "a session may exist, try one refresh", so anonymous visitors never spend the
// tight /auth/refresh rate limit. A forged hint costs one failed refresh, nothing more.

import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../../config.js";

export const REFRESH_COOKIE = "globaly_rt";
export const SESSION_HINT_COOKIE = "globaly_session";

const PATH = "/api/v3/auth";
const MAX_AGE = config.SESSION_EXPIRY_DAYS * 24 * 60 * 60;

/** Reads one cookie from a raw Cookie header. Duplicates are refused: the API never sets two. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  const hits = header.split(/;\s*/).filter((c) => c.startsWith(`${name}=`));
  if (hits.length !== 1) return undefined;
  try {
    return decodeURIComponent(hits[0]!.slice(name.length + 1)) || undefined;
  } catch {
    return undefined;
  }
}

export function readRefreshCookie(req: FastifyRequest): string | undefined {
  return readCookie(req.headers.cookie, REFRESH_COOKIE);
}

// Secure whenever the frontends are served over HTTPS (any deployed environment, whatever its
// NODE_ENV); plain-http dev hosts other than localhost would drop a Secure cookie.
const SECURE = config.NODE_ENV === "production" || config.CORS_ORIGIN_LIST.some((o) => o.startsWith("https://"));

function secure(): string {
  return SECURE ? "; Secure" : "";
}

function hintDomain(): string {
  return config.SESSION_HINT_COOKIE_DOMAIN ? `; Domain=${config.SESSION_HINT_COOKIE_DOMAIN}` : "";
}

export function setRefreshCookie(reply: FastifyReply, refreshToken: string) {
  reply.header("set-cookie", [
    `${REFRESH_COOKIE}=${encodeURIComponent(refreshToken)}; Path=${PATH}; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax${secure()}`,
    `${SESSION_HINT_COOKIE}=1; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax${hintDomain()}${secure()}`,
  ]);
}

export function clearRefreshCookie(reply: FastifyReply) {
  reply.header("set-cookie", [
    `${REFRESH_COOKIE}=; Path=${PATH}; Max-Age=0; HttpOnly; SameSite=Lax${secure()}`,
    `${SESSION_HINT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${hintDomain()}${secure()}`,
  ]);
}
