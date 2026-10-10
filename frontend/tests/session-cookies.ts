/**
 * Cookie-backed token storage (NEXT_PUBLIC_SESSION_COOKIE_DOMAIN set): a token is read only
 * when exactly one cookie carries its name, so a cookie tossed in from a sibling subdomain
 * can't sign the user in as someone else, and a malformed value can't crash the page.
 *
 * Run: node --import ../backend/node_modules/tsx/dist/loader.mjs tests/session-cookies.ts
 */

import assert from "node:assert/strict";

process.env.NEXT_PUBLIC_SESSION_COOKIE_DOMAIN = ".globalyai.com";
let jar = "";
Object.assign(globalThis, { window: {}, document: { get cookie() { return jar; }, set cookie(_v: string) {} } });

void import("../src/lib/session.ts").then(({ getAccessToken }) => {

  jar = "theme=dark; globaly_access_token=abc.def";
  assert.equal(getAccessToken(), "abc.def");

  jar = "xglobaly_access_token=nope";
  assert.equal(getAccessToken(), null);

  jar = "globaly_access_token=attacker; globaly_access_token=victim"; // tossed + real
  assert.equal(getAccessToken(), null);

  jar = "globaly_access_token=%E0%A4%A";
  assert.equal(getAccessToken(), null);

  console.log("session-cookies: ok");
});
