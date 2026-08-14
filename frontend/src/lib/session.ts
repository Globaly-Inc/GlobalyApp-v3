// Shared token storage for the backend's unified auth (access_token/refresh_token
// returned in the JSON body — there's no session cookie, unlike V2's better-auth).

const ACCESS_TOKEN_KEY = "globaly_access_token";
const REFRESH_TOKEN_KEY = "globaly_refresh_token";

export function saveTokens(tokens: { accessToken: string; refreshToken: string }) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

/** Updates only the access token — used after switching the active business org, which keeps the same refresh token/session. */
export function saveAccessToken(accessToken: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function clearTokens() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

// JWT exp is seconds since epoch; a few seconds of slop avoids racing the server's own check.
export function isTokenExpired(token: string): boolean {
  try {
    const { exp } = JSON.parse(atob(token.split(".")[1] ?? "")) as { exp?: number };
    return typeof exp === "number" && Date.now() >= exp * 1000 - 5000;
  } catch {
    return false;
  }
}
