/**
 * The web./app. route table. Fails when src/app/business gains a route folder that
 * BUSINESS_PORTAL_FOLDERS doesn't list, so a new portal page can't silently land on web.
 *
 * Run: node --import ../backend/node_modules/tsx/dist/loader.mjs tests/hosts.ts
 */

import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { BUSINESS_PORTAL_FOLDERS, isPortalPath, isSharedPath } from "../src/lib/hosts.ts";

// Portal (app.)
for (const p of ["/personal", "/personal/enquiries?x=1", "/admin/overview", "/ai", "/auth/sign-in",
  "/signup", "/join/abc", "/invite/agent/accept", "/theme-setup", "/business", "/business/portal",
  "/business/profile/49/services", "/business/contacts/visitors"]) {
  assert.equal(isPortalPath(p), true, `${p} should be portal`);
}

// Public (web.)
for (const p of ["/", "/privacy", "/for-students", "/search?q=mba", "/business/acme-college",
  "/business/portal-college", "/embed/key123", "/coming-soon", "/aid", "/personalised"]) {
  assert.equal(isPortalPath(p), false, `${p} should be public`);
}

// Shared on both hosts
for (const p of ["/_next/static/x.js", "/api/image-proxy", "/brand/globalyai-logo.svg", "/rail/home.webp",
  "/embed.js", "/aly-orb", "/apple-icon.png"]) {
  assert.equal(isSharedPath(p), true, `${p} should be shared`);
}
assert.equal(isSharedPath("/business/portal"), false);
assert.equal(isSharedPath("/admin/export.json"), false);

// Every business route folder is classified.
const businessDir = join(import.meta.dirname, "../src/app/business");
const routeFolders = readdirSync(businessDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .filter((d) => ["page.tsx", "layout.tsx"].some((f) => existsSync(join(businessDir, d.name, f))))
  .map((d) => d.name)
  .sort();
assert.deepEqual(routeFolders, [...BUSINESS_PORTAL_FOLDERS].sort());

console.log("hosts: ok");
