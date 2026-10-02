/**
 * Extraction-complete email: who receives it and what it says. Pure. Run: npm run test:completion-email
 */
import { isOwnerRun, maskEmail, pickRecipient } from "../src/modules/superadmin/data-extraction/lib/completion-email.js";
import { extractionCompleteEmail } from "../src/shared/mail/templates.js";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; console.error(`FAIL ${label}\n  expected ${e}\n  got      ${a}`); }
}

const base = { entityName: "Cleveland State University", entityEmail: "info@csuohio.edu", ownerEmail: "owner@csuohio.edu", ownerFirstName: "Dana", ownerDisplayName: "Dana W", claimStatus: "claimed", starterIsMember: true, starterIsAdmin: false };
eq(pickRecipient(base), { email: "owner@csuohio.edu", name: "Dana", kind: "owner" }, "the owner comes first");
eq(pickRecipient({ ...base, ownerEmail: null }), { email: "info@csuohio.edu", name: null, kind: "entity" }, "no owner → the institution's own email");
eq(pickRecipient({ ...base, ownerEmail: "not-an-email" }), { email: "info@csuohio.edu", name: null, kind: "entity" }, "an invalid owner email falls through to the entity's");
eq(pickRecipient({ ...base, ownerEmail: null, entityEmail: "  " }), null, "neither → nobody is emailed");
eq(pickRecipient({ ...base, ownerFirstName: null })?.name, "Dana W", "display name when there is no first name");
eq(pickRecipient({ ...base, claimStatus: "unclaimed" }), null, "an unclaimed promoted listing has no owner to tell — not even its scraped email");
eq(pickRecipient({ ...base, claimStatus: "claim_pending" }), null, "a pending claim is not an owner yet");
eq(pickRecipient({ ...base, ownerEmail: "owner-1a2b3c4d@unclaimed.globalyhub.invalid" }), { email: "info@csuohio.edu", name: null, kind: "entity" }, "a synthetic .invalid owner is never mailed");
eq(pickRecipient({ ...base, ownerEmail: "x@unclaimed.globalyhub.invalid", entityEmail: "y@a.globalyhub.INVALID" }), null, "…nor a .invalid entity address");
const member = { starterIsMember: true, starterIsAdmin: false };
eq(isOwnerRun({ updated_by_platform_user_id: null }, member), true, "a member of the listing started it, no admin touched it → mailed (any category)");
eq(isOwnerRun({ updated_by_platform_user_id: 119 }, member), false, "an admin re-ran / resumed / ran a step on it → admin run, not mailed");
eq(isOwnerRun({ updated_by_platform_user_id: null }, { starterIsMember: false, starterIsAdmin: true }), false, "an admin-created crawl is never mailed");
eq(isOwnerRun({ updated_by_platform_user_id: null }, { starterIsMember: true, starterIsAdmin: true }), false, "an admin who is also a member ran it → still an admin run");
eq(isOwnerRun({ updated_by_platform_user_id: null }, { starterIsMember: false, starterIsAdmin: false }), false, "someone outside the listing started it → not the owner's run");
eq(maskEmail("owner@csuohio.edu"), "ow***@csuohio.edu", "masked for the timeline");

const PORTAL = "https://app.globalyhub.com/business/portal";
const mail = extractionCompleteEmail({
  recipientName: "Dana", entityName: "Cleveland <State> University", website: "www.csuohio.edu",
  itemLabel: "courses", itemCount: 795,
  coverage: [
    { label: "campuses", count: 3 },
    { label: "courses with fees", count: 412, of: 795 },
    { label: "courses with intake dates", count: 0, of: 795 },
  ],
  portalUrl: PORTAL,
  snippet: `<script src="https://app.globalyhub.com/embed.js" data-key="abc-123" async></script>`,
});
eq(mail.subject, "Your Cleveland <State> University profile is ready on GlobalyApp", "subject names the entity");
eq(mail.html.includes("Cleveland &lt;State&gt; University") && !mail.html.includes("<State>"), true, "entity name is escaped in HTML");
eq(mail.html.includes("795") && mail.html.includes("courses found"), true, "headline count");
eq(mail.html.includes("Courses with fees") && mail.html.includes("412") && !mail.html.includes("Courses with intake dates"), true,
  "coverage lists only what was found");
eq(mail.html.includes("/ 795") && !/Campuses[\s\S]{0,200}\/ 795/.test(mail.html), true,
  "a share shows its denominator; a campus count is not a share of the course total");
// The tag itself, not a link to go and find it. Escaped, because it is rendered inside the mail.
eq(mail.html.includes("&lt;script src=&quot;https://app.globalyhub.com/embed.js&quot; data-key=&quot;abc-123&quot; async&gt;"), true,
  "the embed script is printed in the mail, escaped");
eq(mail.text.includes(`<script src="https://app.globalyhub.com/embed.js" data-key="abc-123" async></script>`), true,
  "and verbatim in the plain-text part, where it must stay copy-pasteable");
const noSnippet = extractionCompleteEmail({
  recipientName: "Dana", entityName: "X", website: null, itemLabel: "courses", itemCount: 1, coverage: [], portalUrl: PORTAL,
});
eq(noSnippet.html.includes("Get the embed code") && !noSnippet.html.includes("Paste this one line"), true,
  "no widget resolved → the panel links to the portal rather than printing a tag that is not theirs");
// Exact link values, not substrings of the body — a substring match also passes for the URL
// embedded in a longer, different one (CodeQL: incomplete URL substring sanitization).
const hrefs = new Set([...mail.html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]));
const textUrls = new Set(mail.text.split(/\s+/).filter((t) => t.startsWith("http")));
eq(hrefs.has(PORTAL), true, "CTA to the portal");
eq(mail.html.includes("#012E8A"), true, "brand layout (navy primary) is used");
eq(mail.text.includes("Hi Dana,") && textUrls.has(PORTAL), true, "plain-text version carries greeting and link");

const toEntity = extractionCompleteEmail({ recipientName: null, entityName: "Acme Visas", website: null, itemLabel: "services", itemCount: 12, coverage: [], portalUrl: "https://x/business/portal" });
eq(toEntity.text.startsWith("Hi Acme Visas team,") && toEntity.html.includes("services found"), true, "the entity's own inbox is greeted as the team; visa jobs count services");

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
