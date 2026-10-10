// Shared token storage for the backend's unified auth (access_token/refresh_token
// returned in the JSON body — there's no session cookie, unlike V2's better-auth).

/**
 * Where the tokens live. With NEXT_PUBLIC_SESSION_COOKIE_DOMAIN set (production:
 * ".globalyai.com") they're cookies on that domain, so a sign-in on app.globalyai.com is
 * also a sign-in on web.globalyai.com, whose public pages call the API too (saved items,
 * eligibility, compare, checkout). Unset — local dev, previews — they stay in localStorage.
 *
 * Not httpOnly on purpose: requests carry the token as a Bearer header that this code
 * builds, exactly as with localStorage, so script access is unchanged. What the cookie adds
 * is delivery to every *.globalyai.com server; Secure + SameSite=Lax keep it off plain HTTP
 * and other sites' cross-site requests. See the domain-move plan's security notes.
 */
const COOKIE_DOMAIN = (process.env.NEXT_PUBLIC_SESSION_COOKIE_DOMAIN ?? "").trim();
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // ponytail: matches SESSION_EXPIRY_DAYS' 30-day default

const store = {
  get(key: string): string | null {
    if (!COOKIE_DOMAIN) return localStorage.getItem(key);
    const hits = document.cookie.split("; ").filter((c) => c.startsWith(`${key}=`));
    // Two cookies with one name means a sibling subdomain planted its own (cookie tossing:
    // a longer Path is sent first, so "first match" would sign the user in as the attacker).
    // Trust neither; the user signs in again.
    if (hits.length !== 1) return null;
    try {
      return decodeURIComponent(hits[0]!.slice(key.length + 1));
    } catch {
      return null; // a malformed (planted) value must not crash every page
    }
  },
  set(key: string, value: string) {
    if (!COOKIE_DOMAIN) return localStorage.setItem(key, value);
    document.cookie = `${key}=${encodeURIComponent(value)}; Domain=${COOKIE_DOMAIN}; Path=/; Max-Age=${COOKIE_MAX_AGE}; Secure; SameSite=Lax`;
  },
  remove(key: string) {
    if (!COOKIE_DOMAIN) return localStorage.removeItem(key);
    document.cookie = `${key}=; Domain=${COOKIE_DOMAIN}; Path=/; Max-Age=0; Secure; SameSite=Lax`;
  },
};

const ACCESS_TOKEN_KEY = "globaly_access_token";
const REFRESH_TOKEN_KEY = "globaly_refresh_token";

export function saveTokens(tokens: { accessToken: string; refreshToken: string }) {
  if (typeof window === "undefined") return;
  store.set(ACCESS_TOKEN_KEY, tokens.accessToken);
  store.set(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

/** Updates only the access token — used after switching the active business org, which keeps the same refresh token/session. */
export function saveAccessToken(accessToken: string) {
  if (typeof window === "undefined") return;
  store.set(ACCESS_TOKEN_KEY, accessToken);
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return store.get(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return store.get(REFRESH_TOKEN_KEY);
}

export function clearTokens() {
  if (typeof window === "undefined") return;
  store.remove(ACCESS_TOKEN_KEY);
  store.remove(REFRESH_TOKEN_KEY);
  store.remove(SELECTED_ORG_KEY);
}

// Which business the user is acting as. Persisted because /auth/refresh mints a
// context-free token, so the choice has to survive being re-applied repeatedly.
const SELECTED_ORG_KEY = "globaly_selected_org_id";

export function saveSelectedOrgId(orgId: string) {
  if (typeof window === "undefined") return;
  store.set(SELECTED_ORG_KEY, orgId);
}

export function getSelectedOrgId(): string | null {
  if (typeof window === "undefined") return null;
  return store.get(SELECTED_ORG_KEY);
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
