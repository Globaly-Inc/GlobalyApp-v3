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

const base = { entityName: "Cleveland State University", entityEmail: "info@csuohio.edu", ownerEmail: "owner@csuohio.edu", ownerFirstName: "Dana", ownerDisplayName: "Dana W", claimStatus: "claimed" };
eq(pickRecipient(base), { email: "owner@csuohio.edu", name: "Dana", kind: "owner" }, "the owner comes first");
eq(pickRecipient({ ...base, ownerEmail: null }), { email: "info@csuohio.edu", name: null, kind: "entity" }, "no owner → the institution's own email");
eq(pickRecipient({ ...base, ownerEmail: "not-an-email" }), { email: "info@csuohio.edu", name: null, kind: "entity" }, "an invalid owner email falls through to the entity's");
eq(pickRecipient({ ...base, ownerEmail: null, entityEmail: "  " }), null, "neither → nobody is emailed");
eq(pickRecipient({ ...base, ownerFirstName: null })?.name, "Dana W", "display name when there is no first name");
eq(pickRecipient({ ...base, claimStatus: "unclaimed" }), null, "an unclaimed promoted listing has no owner to tell — not even its scraped email");
eq(pickRecipient({ ...base, claimStatus: "claim_pending" }), null, "a pending claim is not an owner yet");
eq(pickRecipient({ ...base, ownerEmail: "owner-1a2b3c4d@unclaimed.globalyhub.invalid" }), { email: "info@csuohio.edu", name: null, kind: "entity" }, "a synthetic .invalid owner is never mailed");
eq(pickRecipient({ ...base, ownerEmail: "x@unclaimed.globalyhub.invalid", entityEmail: "y@a.globalyhub.INVALID" }), null, "…nor a .invalid entity address");
eq(isOwnerRun({ source_type: "institution_self_service", updated_by_platform_user_id: null }), true, "an institution owner's own portal run is mailed");
eq(isOwnerRun({ source_type: "business_self_service", updated_by_platform_user_id: null }), true, "…and a business owner's");
eq(isOwnerRun({ source_type: "institution_self_service", updated_by_platform_user_id: 119 }), false, "an admin re-ran / resumed the owner's job → admin run, not mailed");
eq(isOwnerRun({ source_type: "institution", updated_by_platform_user_id: null }), false, "an admin-created crawl is never mailed");
eq(isOwnerRun({ source_type: "self_service", updated_by_platform_user_id: null }), false, "the sign-up placeholder job carries no crawl");
eq(isOwnerRun({ source_type: null, updated_by_platform_user_id: null }), false, "no source type → not the owner's");
eq(maskEmail("owner@csuohio.edu"), "ow***@csuohio.edu", "masked for the timeline");

const PORTAL = "https://app.globalyhub.com/business/portal";
const mail = extractionCompleteEmail({
  recipientName: "Dana", entityName: "Cleveland <State> University", website: "www.csuohio.edu",
  itemLabel: "courses", itemCount: 795,
  coverage: [{ label: "campuses", count: 3 }, { label: "courses with fees", count: 412 }, { label: "courses with intake dates", count: 0 }],
  portalUrl: PORTAL,
});
eq(mail.subject, "Your Cleveland <State> University profile is ready on GlobalyApp", "subject names the entity");
eq(mail.html.includes("Cleveland &lt;State&gt; University") && !mail.html.includes("<State>"), true, "entity name is escaped in HTML");
eq(mail.html.includes("795") && mail.html.includes("courses found"), true, "headline count");
eq(mail.html.includes("412 courses with fees") && !mail.html.includes("0 courses with intake dates"), true, "coverage lists only what was found");
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
