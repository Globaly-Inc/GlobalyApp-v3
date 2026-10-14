// Shared token storage for the backend's unified auth (access_token/refresh_token
// returned in the JSON body — there's no session cookie, unlike V2's better-auth).

/**
 * The access token lives here, per host. The refresh token doesn't: the API keeps it in an
 * httpOnly cookie on its own host (backend modules/auth/refresh-cookie.ts), which is what lets
 * the frontend and the API share one sign-in without any script able to read
 * or plant it. A refresh token still in localStorage is a pre-cookie session: it is sent once,
 * the API answers with the cookie, and saveTokens drops the local copy.
 */

/** The API's readable "a session may exist" cookie (no secret; forging it costs one failed refresh). */
// Same name as the API's SESSION_HINT_COOKIE_NAME; staging uses its own so it can't clear production's.
const SESSION_HINT_COOKIE = process.env.NEXT_PUBLIC_SESSION_HINT_COOKIE || "globaly_session";

export function hasSessionHint(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split("; ").includes(`${SESSION_HINT_COOKIE}=1`);
}

const ACCESS_TOKEN_KEY = "globaly_access_token";
const REFRESH_TOKEN_KEY = "globaly_refresh_token";

/** Also drops a pre-cookie session's refresh token: once the API has answered, its cookie holds it. */
export function saveTokens(tokens: { accessToken: string }) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
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

/** Only a pre-cookie session still has one; see the note at the top. */
export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function clearTokens() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(SELECTED_ORG_KEY);
}

// Which business the user is acting as. Persisted because /auth/refresh mints a
// context-free token, so the choice has to survive being re-applied repeatedly.
const SELECTED_ORG_KEY = "globaly_selected_org_id";

export function saveSelectedOrgId(orgId: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SELECTED_ORG_KEY, orgId);
}

export function getSelectedOrgId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(SELECTED_ORG_KEY);
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
