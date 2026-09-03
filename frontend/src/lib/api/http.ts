import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  getSelectedOrgId,
  isTokenExpired,
  saveTokens,
} from "@/lib/session";
import { parseBody } from "./parse-body";

const RAW_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
const BASE_URL = `${RAW_BASE.replace(/\/+$/, "")}/api/v3`;

/** Exported for raw-fetch callers (SSE streams, multipart uploads) that can't use httpGet/httpPost. */
export function authHeaders(): HeadersInit {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * "rejected" = the server refused the refresh token, so the session really is over.
 * "transient" = rate limit, 5xx or offline — the refresh token is probably still good.
 * The old code collapsed both into `false` and cleared the tokens either way, so a single
 * rate-limited /auth/refresh signed the user out — and the sign-in page then hit the same
 * exhausted limit. Never destroy a session because a request could not be delivered.
 */
type RefreshResult = "ok" | "rejected" | "transient";

let refreshPromise: Promise<RefreshResult> | null = null;

export function refreshAccessToken(): Promise<RefreshResult> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return Promise.resolve("rejected");

  refreshPromise ??= fetch(`${BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
    .then(async (res): Promise<RefreshResult> => {
      if (!res.ok) return res.status === 401 || res.status === 403 ? "rejected" : "transient";
      const tokens = (await res.json()) as { access_token: string; refresh_token: string };
      saveTokens({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token });
      return "ok";
    })
    .catch((): RefreshResult => "transient")
    .then((result) => {
      if (result === "rejected") clearTokens();
      return result;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

function forceSignIn(): never {
  clearTokens();
  if (typeof window !== "undefined") {
    // Carry where they were headed. sign-in-view.tsx already honours ?redirect=,
    // but this was sending everyone to a bare /auth/sign-in — so a deep link like
    // /personal/enquiries?course_id=… lost its course on the way through auth.
    // Skip it when already under /auth, or signing out would build a redirect loop.
    const back = `${window.location.pathname}${window.location.search}`;
    window.location.href = back.startsWith("/auth")
      ? "/auth/sign-in"
      : `/auth/sign-in?redirect=${encodeURIComponent(back)}`;
  }
  throw new Error("Your session has expired. Please sign in again.");
}

// ── Business context ──
// Tenant-scoped endpoints (everything behind requireBusinessContext) need an
// `orgId` claim, and POST /auth/switch-account is the ONLY thing that mints one:
// both verify-otp and refresh sign context-free tokens. That means context is
// not just missing at login — it is silently DROPPED every time the access token
// is refreshed, so re-establishing it has to be automatic, not a one-off on mount.

function orgIdFromToken(token: string | null): string | null {
  if (!token) return null;
  try {
    const { orgId } = JSON.parse(atob(token.split(".")[1] ?? "")) as { orgId?: string };
    return orgId ?? null;
  } catch {
    return null;
  }
}

export function hasBusinessContext(): boolean {
  return orgIdFromToken(getAccessToken()) !== null;
}

/** Institutions are treated as businesses everywhere in the /business/* UI — this is the
 * one spot that tells API layers which backend (businesses vs institutions) to call. */
export function isInstitutionContext(): boolean {
  const token = getAccessToken();
  if (!token) return false;
  try {
    const { orgType } = JSON.parse(atob(token.split(".")[1] ?? "")) as { orgType?: string };
    return orgType === "institution";
  } catch {
    return false;
  }
}

let switchPromise: Promise<boolean> | null = null;

/**
 * Serializes every call that mints a new access token via /auth/switch-account.
 * BusinessShell's `ensureBusinessContext()` and pages that switch to a specific
 * org (e.g. /business/profile/[businessId]) can both fire on the same mount;
 * without this lock their responses race and whichever resolves last silently
 * clobbers the other's `saveTokens`/`saveAccessToken` call, leaving the token
 * scoped to the wrong business.
 */
let switchLock: Promise<unknown> = Promise.resolve();

export function runExclusiveSwitch<T>(fn: () => Promise<T>): Promise<T> {
  const run = switchLock.catch(() => undefined).then(fn);
  switchLock = run.catch(() => undefined);
  return run;
}

/**
 * Upgrades the current access token to one scoped to the user's business.
 * Resolves false when the user has no business to switch into — callers decide
 * whether that is an error or just "not a business account".
 */
export function ensureBusinessContext(force = false): Promise<boolean> {
  if (!force && hasBusinessContext()) return Promise.resolve(true);

  switchPromise ??= (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;

    const meRes = await fetch(`${BASE_URL}/auth/me`, { headers: authHeaders() });
    if (!meRes.ok) return false;
    const me = (await meRes.json()) as {
      user?: {
        businesses?: { id: number; org_id: string }[];
        institutions?: { id: number; org_id: string }[];
      };
    };
    const businesses = me.user?.businesses ?? [];
    const institutions = me.user?.institutions ?? [];
    const allOrgs = [...businesses, ...institutions];
    if (allOrgs.length === 0) return false;

    // Honour the user's pick when it is still a valid membership; otherwise fall
    // back to the lowest id (businesses first, then institutions). Sorting matters:
    // listUserBusinesses has no ORDER BY, so "the first row" is whatever Postgres
    // happens to return and the active business would otherwise change between reloads.
    const selected = getSelectedOrgId();
    const orgId = allOrgs.some((b) => b.org_id === selected)
      ? selected!
      : [...allOrgs].sort((a, b) => a.id - b.id)[0]!.org_id;

    return runExclusiveSwitch(async () => {
      const res = await fetch(`${BASE_URL}/auth/switch-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        // Recorded on the session so /refresh keeps honoring it (see auth.service.ts).
        body: JSON.stringify({ org_id: orgId, refresh_token: refreshToken }),
      });
      if (!res.ok) return false;

      const { access_token } = (await res.json()) as { access_token: string };
      saveTokens({ accessToken: access_token, refreshToken });
      return true;
    });
  })().finally(() => {
    switchPromise = null;
  });

  return switchPromise;
}

/** A refused refresh token ends the session; an undeliverable refresh must not. */
function handleRefresh(result: RefreshResult): void {
  if (result === "rejected") forceSignIn();
  if (result === "transient") throw new ApiError("Couldn't reach the server. Please try again in a moment.");
}

/** Exported for raw-fetch callers — the attempt closure MUST rebuild headers via authHeaders() so a refreshed token is picked up on retry. */
export async function withRefreshRetry(attempt: () => Promise<Response>): Promise<Response> {
  const token = getAccessToken();
  if (token && isTokenExpired(token)) {
    handleRefresh(await refreshAccessToken());
  }
  let res = await attempt();

  if (res.status === 401) {
    handleRefresh(await refreshAccessToken());
    res = await attempt();
    if (res.status === 401) forceSignIn();
  }

  // A 403 on a token with no orgId means context was never established, or a
  // refresh just stripped it. Re-switch once and retry. Genuine permission
  // denials keep their orgId, so they fall straight through untouched.
  if (res.status === 403 && !hasBusinessContext()) {
    if (await ensureBusinessContext(true)) res = await attempt();
  }

  return res;
}

export class ApiError extends Error {
  code?: string;
  details?: unknown;
  constructor(message: string, code?: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

function messageFromValidationDetails(details: unknown): string | null {
  if (!Array.isArray(details) || details.length === 0) return null;
  const messages = details
    .map((issue) => (issue && typeof issue === "object" && typeof (issue as { message?: unknown }).message === "string"
      ? (issue as { message: string }).message
      : null))
    .filter((m): m is string => m !== null);
  return messages.length ? messages.join(", ") : null;
}

async function readError(res: Response): Promise<ApiError> {
  try {
    const data = (await res.json()) as { error?: string; message?: string; code?: string; details?: unknown };
    const message = messageFromValidationDetails(data.details) || data.error || data.message || "Please try again.";
    return new ApiError(message, data.code, data.details);
  } catch {
    return new ApiError("Please try again.");
  }
}

/** Maps a caught API error's Zod validation `details` (if any) to { fieldName: message }. */
export function fieldErrorsFrom(err: unknown): Record<string, string> {
  const fields: Record<string, string> = {};
  if (!(err instanceof ApiError) || !Array.isArray(err.details)) return fields;
  for (const issue of err.details as Array<{ path?: unknown[]; message?: string }>) {
    const field = issue.path?.[0];
    if (typeof field === "string" && typeof issue.message === "string") fields[field] = issue.message;
  }
  return fields;
}

export async function httpGet<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await withRefreshRetry(() =>
    fetch(`${BASE_URL}${path}`, { ...init, headers: { ...authHeaders(), ...init?.headers } }),
  );
  if (!res.ok) throw await readError(res);
  return parseBody<T>(res);
}

// Public auth endpoints signal bad credentials with 401 (e.g. "Invalid OTP", lockout, expired
// OTP). Those must surface to the form as-is — the refresh/forceSignIn dance in withRefreshRetry
// would eat the error and hard-redirect to /auth/sign-in, resetting the OTP form mid-entry.
const PUBLIC_AUTH_PATHS = new Set(["/auth/register", "/auth/send-otp", "/auth/verify-otp"]);

async function httpWithBody<T>(
  method: "POST" | "PATCH" | "PUT",
  path: string,
  body: unknown,
  init?: RequestInit,
): Promise<T> {
  const attempt = () =>
    fetch(`${BASE_URL}${path}`, {
      ...init,
      method,
      headers: { "Content-Type": "application/json", ...authHeaders(), ...init?.headers },
      body: JSON.stringify(body),
    });
  const res = PUBLIC_AUTH_PATHS.has(path) ? await attempt() : await withRefreshRetry(attempt);
  if (!res.ok) throw await readError(res);
  return parseBody<T>(res);
}

export function httpPost<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  return httpWithBody<T>("POST", path, body, init);
}

export function httpPatch<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  return httpWithBody<T>("PATCH", path, body, init);
}

export function httpPut<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  return httpWithBody<T>("PUT", path, body, init);
  }
/**
 * Multipart POST/PATCH. No Content-Type header on purpose — the browser must set it with the boundary.
 */
async function httpFormWithBody<T>(method: "POST" | "PATCH", path: string, form: FormData, init?: RequestInit): Promise<T> {
  const res = await withRefreshRetry(() =>
    fetch(`${BASE_URL}${path}`, { ...init, method, headers: { ...authHeaders(), ...init?.headers }, body: form }),
  );
  if (!res.ok) throw await readError(res);
  return parseBody<T>(res);
}

export function httpPostForm<T>(path: string, form: FormData, init?: RequestInit): Promise<T> {
  return httpFormWithBody<T>("POST", path, form, init);
}

export function httpPatchForm<T>(path: string, form: FormData, init?: RequestInit): Promise<T> {
  return httpFormWithBody<T>("PATCH", path, form, init);
}

/** POST that expects an empty body (204). httpPost handles 204 too — this just types it as void. */
export async function httpPostNoContent(path: string, body?: unknown, init?: RequestInit): Promise<void> {
  const res = await withRefreshRetry(() =>
    fetch(`${BASE_URL}${path}`, {
      ...init,
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(), ...init?.headers },
      body: JSON.stringify(body ?? {}),
    }),
  );
  if (!res.ok) throw await readError(res);
}

export async function httpDelete(path: string, init?: RequestInit): Promise<void> {
  const res = await withRefreshRetry(() =>
    fetch(`${BASE_URL}${path}`, { ...init, method: "DELETE", headers: { ...authHeaders(), ...init?.headers } }),
  );
  if (!res.ok) throw await readError(res);
}

export async function httpBlob(path: string, init?: RequestInit): Promise<Blob> {
  const res = await withRefreshRetry(() =>
    fetch(`${BASE_URL}${path}`, { ...init, headers: { ...authHeaders(), ...init?.headers } }),
  );
  if (!res.ok) throw await readError(res);
  return res.blob();
}
