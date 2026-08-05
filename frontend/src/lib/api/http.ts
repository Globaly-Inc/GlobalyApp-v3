import { clearTokens, getAccessToken, getRefreshToken, saveTokens } from "@/lib/session";

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

async function withRefreshRetry(attempt: () => Promise<Response>): Promise<Response> {
  const res = await attempt();
  if (res.status !== 401) return res;
  const refreshed = await refreshAccessToken();
  return refreshed ? attempt() : res;
}

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string; message?: string };
    return data.error || data.message || "Please try again.";
  } catch {
    return "Please try again.";
  }
}

export async function httpGet<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await withRefreshRetry(() =>
    fetch(`${BASE_URL}${path}`, { ...init, headers: { ...authHeaders(), ...init?.headers } }),
  );
  if (!res.ok) throw new Error(await readError(res));
  return res.json() as Promise<T>;
}

async function httpWithBody<T>(
  method: "POST" | "PATCH",
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
  if (!res.ok) throw new Error(await readError(res));
  return res.json() as Promise<T>;
}

export function httpPost<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  return httpWithBody<T>("POST", path, body, init);
}

export function httpPatch<T>(path: string, body: unknown, init?: RequestInit): Promise<T> {
  return httpWithBody<T>("PATCH", path, body, init);
}
