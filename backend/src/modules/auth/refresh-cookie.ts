// The refresh token's home in the browser: an httpOnly cookie the API sets on its own host.
//
// Page scripts can't read it, and over HTTPS it is a __Host- cookie: browsers refuse any
// __Host- cookie that names a Domain, so a sibling subdomain can't plant one for api.* (cookie
// tossing / session fixation) — a plain name would accept `Domain=.globalyai.com` from any of
// them. That's what keeps a sign-in shared between app. and api. from being a token every
// subdomain can see or forge.
// app. is the same site as api.*, so SameSite=Lax still sends it on their fetches.
//
// The hint cookie is the opposite: readable, on the parent domain, carrying no secret. It only
// tells a page "a session may exist, try one refresh", so anonymous visitors never spend the
// tight /auth/refresh rate limit. A forged hint costs one failed refresh, nothing more.

import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../../config.js";

export const SESSION_HINT_COOKIE = "globaly_session";

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

// __Host- requires Secure and Path=/; plain-http local dev gets the bare name instead.
export const REFRESH_COOKIE = SECURE ? "__Host-globaly_rt" : "globaly_rt";
const PATH = "/";

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
