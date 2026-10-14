/**
 * The one public origin this build serves (app.globalyai.com): public pages for visitors,
 * portals once signed in. From env, default "" so local dev and previews stay on whatever
 * origin they run on.
 */
export const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/+$/, "");
