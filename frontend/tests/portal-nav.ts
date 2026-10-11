/**
 * Every static portal page is reachable from its portal's navigation (rail, submenu or the phone
 * "More" sheet — all three read the same nav config), or is listed below with the reason it isn't.
 * Fails when a page is added without a nav entry, so it can't ship unreachable.
 *
 * Run: node --import ../backend/node_modules/tsx/dist/loader.mjs tests/portal-nav.ts
 */

import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { NAV_ITEMS } from "../src/app/personal/const/index.ts";
import { BUSINESS_NAV_GROUPS, INSTITUTION_SCHOLARSHIPS_ITEM } from "../src/app/business/const/index.ts";
import { ADMIN_NAV_GROUPS } from "../src/app/admin/nav-config.ts";

type Group = { href?: string; items?: { href: string }[] };

/** Reached some other way than the nav. Keep each reason honest — this list is the escape hatch. */
const NOT_IN_NAV: Record<string, string> = {
  "/personal/onboarding": "first-run wizard, opened by sign-up",
  "/personal/profile": "account menu (avatar → profile)",
  "/personal/notifications": "header bell (SHOW_HEADER_EXTRAS)",
  "/personal/credits": "header credits pill and the phone More sheet",
  "/personal/ai": "PERSONAL_PORTAL_HOME and the phone More sheet",
  "/personal/earn/services/new": "action button on the services list",
  "/personal/earn/services/payment-success": "payment provider redirect",
  "/personal/explore/compare": "compare tray on Explore",
  "/business/onboarding": "first-run wizard, and the switcher's “new business”",
  "/business/notifications": "header bell (SHOW_HEADER_EXTRAS)",
  "/business/credits": "header credits pill (SHOW_HEADER_EXTRAS)",
  "/business/ai-widget": "the Inbox's ⚙ Widget button",
  "/business/settings/ai-embed": "the Inbox's ⚙ Widget button",
  "/business/settings": "coming-soon placeholder; the Settings rail tile opens its first item instead",
  // Hidden for the short release: commented out in business/const. Bring back the entry, drop the line here.
  "/business/social": "hidden for the short release",
  "/business/enquiries": "hidden for the short release",
  "/business/marketing": "hidden for the short release",
  "/business/marketing/representations": "hidden for the short release",
  "/business/marketing/events": "hidden for the short release",
  "/business/marketing/ambassadors": "hidden for the short release",
  "/business/marketing/ads": "hidden for the short release",
  "/business/scribe": "hidden for the short release",
  "/business/lms": "hidden for the short release",
  "/business/settings/subscription": "hidden for the short release",
  "/business/settings/credits": "hidden for the short release",
  "/business/settings/application-charges": "hidden for the short release",
  "/business/settings/integrations": "hidden for the short release",
  "/admin/platform/businesses/add": "action button on the businesses list",
  "/admin/platform/countries/new": "action button on the countries list",
  "/admin/marketing/blog/new": "action button on the blog list",
  // Hidden for the short release: commented out in admin/nav-config.
  "/admin/platform/feature-flags": "hidden for the short release",
  "/admin/monitoring/moderation": "hidden for the short release",
  "/admin/monitoring/training": "hidden for the short release",
  "/admin/monitoring/events": "hidden for the short release",
  "/admin/monitoring/jobs": "hidden for the short release",
  "/admin/monitoring/ambassador-programs": "hidden for the short release",
  "/admin/monitoring/monitoring-logs": "hidden for the short release",
  "/admin/marketing/ads": "hidden for the short release",
  // ORPHANED: nothing links here at all (found by this test, 2026-10-11). Add a nav entry or delete the page.
  "/admin/data/mara-agents": "ORPHANED",
  "/admin/data/visas": "ORPHANED",
  "/admin/portal": "ORPHANED (a 'Welcome to admin Portal' stub)",
  "/admin/profile": "ORPHANED (the account menu opens /personal/profile)",
};

function routesUnder(dir: string, base: string): string[] {
  const routes: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (!statSync(full).isDirectory()) {
      if (name === "page.tsx") routes.push(base);
      continue;
    }
    // Dynamic pages are reached from their list; route groups and private folders aren't segments.
    if (name.startsWith("[") || name.startsWith("_") || name === "components") continue;
    const segment = name.startsWith("(") ? "" : `/${name}`;
    routes.push(...routesUnder(full, base + segment));
  }
  return routes;
}

function navPaths(groups: Group[]): string[] {
  return groups.flatMap((g) => [g.href, ...(g.items ?? []).map((i) => i.href)])
    .filter((href): href is string => !!href)
    .map((href) => href.split("?")[0]!);
}

function uncovered(portal: string, groups: Group[]): string[] {
  const paths = navPaths(groups);
  return routesUnder(join(import.meta.dirname, "../src/app", portal), `/${portal}`)
    .filter((route) => route !== `/${portal}`) // the bare portal path redirects
    .filter((route) => !(route in NOT_IN_NAV))
    // Covered by an entry for itself or for an ancestor page (`/admin/platform/categories/business/new`
    // lives under the Categories entry).
    .filter((route) => !paths.some((p) => route === p || route.startsWith(`${p}/`)));
}

const business = [...BUSINESS_NAV_GROUPS, { items: [INSTITUTION_SCHOLARSHIPS_ITEM] }];
for (const [portal, groups] of [["personal", NAV_ITEMS], ["business", business], ["admin", ADMIN_NAV_GROUPS]] as const) {
  assert.deepEqual(uncovered(portal, groups as Group[]), [], `${portal} pages missing from the nav (add an entry, or a reason to NOT_IN_NAV)`);
}

// Every exception still names a real page, so the list can't rot.
const allRoutes = new Set(["personal", "business", "admin"].flatMap((p) => routesUnder(join(import.meta.dirname, "../src/app", p), `/${p}`)));
for (const route of Object.keys(NOT_IN_NAV)) assert.ok(allRoutes.has(route), `NOT_IN_NAV lists ${route}, which is not a page`);

console.log("portal-nav: ok");
