/**
 * The one route table for the two hosts the frontend build serves (plan:
 * docs/superpowers/plans/2026-10-10-globalyai-domain-move.md):
 *
 * - web.globalyai.com: public marketplace — the (web) pages, coming-soon, /embed
 * - app.globalyai.com: portals and everything behind sign-in
 *
 * Both origins come from env and default to "" so local dev and previews keep running on
 * one origin: with no env, appUrl("/x") is just "/x" and the proxy does nothing.
 */

export const WEB_ORIGIN = trimOrigin(process.env.NEXT_PUBLIC_WEB_URL);
export const APP_ORIGIN = trimOrigin(process.env.NEXT_PUBLIC_APP_URL);

function trimOrigin(raw: string | undefined): string {
  return (raw ?? "").trim().replace(/\/+$/, "");
}

/** Top-level folders under src/app that belong to app.globalyai.com. */
const PORTAL_ROOTS = ["personal", "admin", "ai", "auth", "signup", "join", "invite", "theme-setup"] as const;

/**
 * `/business` is shared: `/business/<slug>` is a public institution page on web., these
 * folders are the business portal on app. tests/hosts.ts fails when src/app/business gains
 * a route folder that is missing here, so a new portal page can't silently land on web.
 */
export const BUSINESS_PORTAL_FOLDERS = [
  "ai-knowledge", "ai-widget", "contacts", "credits", "enquiries", "lms", "marketing", "messages",
  "notifications", "onboarding", "portal", "profile", "scribe", "settings", "social",
] as const;

const PORTAL_ROOT_SET = new Set<string>(PORTAL_ROOTS);
const BUSINESS_PORTAL_SET = new Set<string>(BUSINESS_PORTAL_FOLDERS);

function pathOnly(path: string): string {
  return path.split(/[?#]/, 1)[0] ?? "";
}

/** True when the path is served by app.globalyai.com. Query and hash are ignored. */
export function isPortalPath(path: string): boolean {
  const [first, second] = pathOnly(path).split("/").filter(Boolean);
  if (!first) return false;
  if (first === "business") return second === undefined || BUSINESS_PORTAL_SET.has(second);
  return PORTAL_ROOT_SET.has(first);
}

/** Paths both hosts serve as-is: build assets, API routes, static files. */
export function isSharedPath(path: string): boolean {
  return /^\/(_next|api|aly-orb|brand|rail|objects|people|templates|favicon|icon|apple-icon)(\/|\.|$)/.test(path)
    // Root static files (embed.js, widget-demo.html). Never a portal path: a route handler
    // like /admin/x.json must still be held to app.
    || (!isPortalPath(path) && /\.[a-z0-9]+$/i.test(pathOnly(path)));
}
