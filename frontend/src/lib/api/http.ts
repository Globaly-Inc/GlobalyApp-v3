import { clearTokens, getAccessToken, getRefreshToken, isTokenExpired, saveTokens } from "@/lib/session";

const RAW_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
const BASE_URL = `${RAW_BASE.replace(/\/+$/, "")}/api/v3`;

function authHeaders(): HeadersInit {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

let refreshPromise: Promise<boolean> | null = null;

function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return Promise.resolve(false);

  refreshPromise ??= fetch(`${BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
    .then(async (res) => {
      if (!res.ok) throw new Error("refresh failed");
      const tokens = (await res.json()) as { access_token: string; refresh_token: string };
      saveTokens({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token });
      return true;
    })
    .catch(() => {
      clearTokens();
      return false;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

function forceSignIn(): never {
  clearTokens();
  if (typeof window !== "undefined") window.location.href = "/auth/sign-in";
  throw new Error("Your session has expired. Please sign in again.");
}

async function withRefreshRetry(attempt: () => Promise<Response>): Promise<Response> {
  const token = getAccessToken();
  if (token && isTokenExpired(token)) {
    if (!(await refreshAccessToken())) forceSignIn();
  }
  const res = await attempt();
  if (res.status !== 401) return res;
  const refreshed = await refreshAccessToken();
  if (!refreshed) forceSignIn();
  const retried = await attempt();
  if (retried.status === 401) forceSignIn();
  return retried;
}

export class ApiError extends Error {
  code?: string;
  details?: unknown;
  constructor(message: string, code?: string, details?: unknown) {
    super(message);
    this.code = code;
  }
}

async function readError(res: Response): Promise<ApiError> {
  try {
    const data = (await res.json()) as { error?: string; message?: string; code?: string; details?: unknown };
    return new ApiError(data.error || data.message || "Please try again.", data.code, data.details);
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
  return res.json() as Promise<T>;
}

async function httpWithBody<T>(
  method: "POST" | "PATCH" | "PUT",
  path: string,
  body: unknown,
  init?: RequestInit,
): Promise<T> {
  const res = await withRefreshRetry(() =>
    fetch(`${BASE_URL}${path}`, {
      ...init,
      method,
      headers: { "Content-Type": "application/json", ...authHeaders(), ...init?.headers },
      body: JSON.stringify(body),
    }),
  );
  if (!res.ok) throw await readError(res);
  return res.json() as Promise<T>;
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
 * Multipart POST. No Content-Type header on purpose — the browser must set it with the boundary.
 */
export async function httpPostForm<T>(path: string, form: FormData, init?: RequestInit): Promise<T> {
  const res = await withRefreshRetry(() =>
    fetch(`${BASE_URL}${path}`, { ...init, method: "POST", headers: { ...authHeaders(), ...init?.headers }, body: form }),
  );
  if (!res.ok) throw await readError(res);
  return res.json() as Promise<T>;
}

/** POST that expects an empty body (204). Calling httpPost for these would throw on res.json(). */
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
