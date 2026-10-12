# PR 2: move GlobalyApp onto globalyai.com

Decided 2026-10-10. PR 1 (brand: logo, navy, GlobalyAI name, navy icons) is separate and can ship first on the current domain.

## Target

| Host | Serves | Built from |
|---|---|---|
| `globalyai.com` (`www` 301s to apex) | GlobalyAI marketing site | `globalyai-website/` |
| `web.globalyai.com` | public marketplace: `(web)/*`, `/` coming-soon, `/embed/*`, `/embed.js` | `frontend/` |
| `app.globalyai.com` | `/personal`, `/business/*` (portal), `/admin`, `/ai`, `/auth`, `/signup`, `/join`, `/invite`, `/theme-setup` | same `frontend/` build |
| `globalyapp.com`, `www.globalyapp.com` | 301, path kept, to web. or app. by the same route table | Cloudflare |

Shared: `/api/image-proxy`, `/_next/*`, `/brand/*`, `/rail/*`, `/objects/*` on both hosts.

**`/business` is shared by both hosts.** `/business/<slug>` is a public institution page on web.; `/business/portal`, `/business/profile` and the other portal folders are on app. The route table lists the portal subfolders explicitly. Anything else under `/business/` goes to web.

## What the code map found (changes the earlier assumptions)

1. **No auth cookies.** Tokens live in `localStorage` (`frontend/src/lib/session.ts`) and are sent as a Bearer header. localStorage is per-origin, so login can't be shared across subdomains as things stand.
2. **There is no OAuth**, so there are no callback URLs to change. Login is OTP-only, and the Google button is a "coming soon" toast.
3. **A comma list in `CORS_ORIGINS` breaks the backend.** `backend/src/server.ts:91` passes the raw string to `@fastify/cors`, so a comma list breaks CORS. `admin-users.service.ts:155,180` also builds invite links from it.
4. **About 56 relative links cross between the two halves.** For example, `(web)` pages link `/auth/sign-up` ×24, and portal pages link to public pages ×16. Each one breaks once the hosts split.
5. **Embed snippets already pasted** on institution sites load `https://www.globalyapp.com/embed.js` forever. The globalyapp.com redirect must keep serving them: a 301 of a script is followed by browsers, and the iframe origin is taken from the script's own `src`.

## Changes

### Frontend
- **`src/lib/hosts.ts`** (new, one file):
  - `WEB_ORIGIN` / `APP_ORIGIN` from `NEXT_PUBLIC_WEB_URL` / `NEXT_PUBLIC_APP_URL`. Both default to `""` so local dev keeps working on one origin.
  - `isPortalPath(pathname)`, the single route table.
  - `appUrl(path)` / `webUrl(path)`.
- **`src/proxy.ts`** (new, Next 16's renamed middleware):
  - If the request host is web. and `isPortalPath`, 308 to app. with the same path and query.
  - If the host is app. and it's a public path, 308 to web.
  - It does nothing when the env vars are unset (local dev, previews).
  - The matcher skips `_next`, static files and `/api`.
- **Cross-host links:** run the ~56 links through `appUrl()` / `webUrl()`. A one-line helper per call site; layouts stay as they are.
- **Login shared across subdomains** (you chose this). Two options:
  - **A (recommended):** also write the refresh token to a `Domain=.globalyai.com; Secure; SameSite=Lax` cookie, set by a small `/api/session` route handler, so it's httpOnly. On web., the navbar asks `/api/session` whether a session exists and shows the avatar or a "Go to app" link. Access tokens stay in memory or localStorage on app. only.
  - **B (cheaper):** web. never knows who's signed in. The navbar always shows "Sign in", which lands on app., and app. bounces signed-in users straight into their portal.
  - Recommendation: A gives you what you asked for. B is a quarter of the work if A feels like too much.
- **SEO:** update `siteConfig.url` and the canonical, OG, JSON-LD and SearchAction in `(web)/layout.tsx` to `https://web.globalyai.com`; set `metadataBase` per host. Change the support@ and sales@ addresses to globalyai.com and fix the stray support@globalyhub.com in `referrals-view.tsx`. Update the youtube handle once the new channel exists.
- **`theme-settings` cookie:** set `Domain=.globalyai.com` so a tenant theme follows the user across hosts.

### Backend
- **`CORS_ORIGINS`:** split on commas into an array for `@fastify/cors`, and add `https://web.globalyai.com,https://app.globalyai.com`. Change the admin invite links to use `WEB_APP_URL`, not `CORS_ORIGINS`.
- **`WEB_APP_URL`:** `https://app.globalyai.com`. Every email, invite and Stripe-return link points at portal routes.
- **Mail:** `defaultFrom` reads `MAIL_FROM` (add it to the zod schema), set to `noreply@globalyai.com`. Before deploy, verify globalyai.com in Resend: SPF, DKIM and DMARC records in Cloudflare.
- **Mail logo:** `templates.ts:50` points at the old GlobalyApp PNG in the bucket. Upload `frontend/public/brand/globalyai-icon-512.png` there and repoint it. (This could also go in PR 1.)
- The AI prompt mentions globalyhub.com (`prompt.service.ts:81`), which students see. Change it to globalyai.com.

### Cloudflare (globalyapp.com zone)
Single Redirect rules, in this order. The DNS records must stay proxied (orange cloud) so the rules run.

1. Portal paths to app.:
   - Expression: `(http.host in {"globalyapp.com" "www.globalyapp.com"}) and (starts_with(http.request.uri.path, "/personal") or starts_with(http.request.uri.path, "/admin") or starts_with(http.request.uri.path, "/ai") or starts_with(http.request.uri.path, "/auth") or starts_with(http.request.uri.path, "/signup") or starts_with(http.request.uri.path, "/join") or starts_with(http.request.uri.path, "/invite") or starts_with(http.request.uri.path, "/theme-setup") or http.request.uri.path matches "^/business/(portal|profile|enquiries|marketing|messages|settings|onboarding|ai-widget|lms|social|notifications|credits|scribe)(/|$)")`
   - Action: dynamic redirect, 301, `concat("https://app.globalyai.com", http.request.uri.path)`, preserve query string.
   - `matches` (regex) needs a Business plan or higher. On Free or Pro, list the `/business/<folder>` prefixes with `starts_with` instead.
2. Everything else to web.:
   - Expression: `http.host in {"globalyapp.com" "www.globalyapp.com"}`
   - Action: 301, `concat("https://web.globalyai.com", http.request.uri.path)`, preserve query string.

In the globalyai.com zone: proxied DNS records for `web` and `app`, both pointing at the frontend load balancer; the apex and `www` point at the globalyai-website box, with a `www` to apex 301.
The `/business/` folder list is generated from `frontend/src/app/business/*` at implementation time, and the same list feeds `isPortalPath`.

### Env per environment
```
# frontend
NEXT_PUBLIC_WEB_URL=https://web.globalyai.com
NEXT_PUBLIC_APP_URL=https://app.globalyai.com
NEXT_PUBLIC_API_URL=<unchanged, or api.globalyai.com if the API moves too>
# backend
WEB_APP_URL=https://app.globalyai.com
CORS_ORIGINS=https://web.globalyai.com,https://app.globalyai.com
MAIL_FROM=noreply@globalyai.com
```

## Rollout
1. Set up DNS for web. and app., verify Resend for globalyai.com, and update the GCS CORS file.
2. Deploy PR 2 with the new env. Both new hosts work, and globalyapp.com still serves the site as before.
3. Turn on the Cloudflare redirect rules. Everyone signs in again once (accepted).
4. Watch for 404s and redirect loops for a week. Then retire the old `server_name` and certificates, but keep the globalyapp.com zone and its redirects for at least a year, because of the embed snippets.

## Tests
- Unit: `isPortalPath` table (every `src/app` top-level folder plus `/business/<slug>` vs `/business/portal`), `appUrl`/`webUrl` with and without env, CORS origin parsing.
- Proxy: a request on web. for `/business/portal` gets a 308 to app.; `/business/acme` is not redirected; nothing happens with the env unset.
- Manual: OTP sign-in on app.; the web navbar knows the session (option A); an old `www.globalyapp.com/for-students?x=1` link lands on web. with the query; an old embed snippet still opens its chat.

## Decisions (2026-10-10)
- **Login sharing: option A**, a shared httpOnly refresh-token cookie on `.globalyai.com`. Security review before merge: cookie flags, CSRF on `/api/session` (POST only, SameSite=Lax, Origin check against the two hosts), refresh rotation, logout clears the cookie on both hosts.
- **API moves to `api.globalyai.com`.** Keep the old API host as a proxied alias until every client (apps, embed snippets, mail links) has moved. Set `NEXT_PUBLIC_API_URL=https://api.globalyai.com` and `API_URL`/`APP_URL` on the backend to match; add `api` to the globalyai.com DNS records.
- **Cloudflare plan: Free or Pro**, so no regex. Rule 1 uses this expression:
  ```
  (http.host in {"globalyapp.com" "www.globalyapp.com"}) and (
    starts_with(http.request.uri.path, "/personal") or starts_with(http.request.uri.path, "/admin") or
    starts_with(http.request.uri.path, "/ai") or starts_with(http.request.uri.path, "/auth") or
    starts_with(http.request.uri.path, "/signup") or starts_with(http.request.uri.path, "/join") or
    starts_with(http.request.uri.path, "/invite") or starts_with(http.request.uri.path, "/theme-setup") or
    starts_with(http.request.uri.path, "/business/portal") or starts_with(http.request.uri.path, "/business/profile") or
    starts_with(http.request.uri.path, "/business/enquiries") or starts_with(http.request.uri.path, "/business/marketing") or
    starts_with(http.request.uri.path, "/business/messages") or starts_with(http.request.uri.path, "/business/settings") or
    starts_with(http.request.uri.path, "/business/onboarding") or starts_with(http.request.uri.path, "/business/ai-widget") or
    starts_with(http.request.uri.path, "/business/lms") or starts_with(http.request.uri.path, "/business/social") or
    starts_with(http.request.uri.path, "/business/notifications") or starts_with(http.request.uri.path, "/business/credits") or
    starts_with(http.request.uri.path, "/business/scribe"))
  ```
  Caveat: `starts_with("/ai")` would also catch a future public `/aid…` path, and a public institution slug that starts with a portal folder name (e.g. `/business/portal-college`) would go to app. app.'s proxy sends such a path back to web., so it costs one extra redirect, never a broken page.
