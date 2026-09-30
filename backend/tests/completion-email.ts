/**
 * Extraction-complete email: who receives it and what it says. Pure. Run: npm run test:completion-email
 */
import { maskEmail, pickRecipient } from "../src/modules/superadmin/data-extraction/lib/completion-email.js";
import { extractionCompleteEmail } from "../src/shared/mail/templates.js";

let passed = 0;
let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; console.error(`FAIL ${label}\n  expected ${e}\n  got      ${a}`); }
}

const base = { entityName: "Cleveland State University", entityEmail: "info@csuohio.edu", ownerEmail: "owner@csuohio.edu", ownerFirstName: "Dana", ownerDisplayName: "Dana W" };
eq(pickRecipient(base), { email: "owner@csuohio.edu", name: "Dana", kind: "owner" }, "the owner comes first");
eq(pickRecipient({ ...base, ownerEmail: null }), { email: "info@csuohio.edu", name: null, kind: "entity" }, "no owner → the institution's own email");
eq(pickRecipient({ ...base, ownerEmail: "not-an-email" }), { email: "info@csuohio.edu", name: null, kind: "entity" }, "an invalid owner email falls through to the entity's");
eq(pickRecipient({ ...base, ownerEmail: null, entityEmail: "  " }), null, "neither → nobody is emailed");
eq(pickRecipient({ ...base, ownerFirstName: null })?.name, "Dana W", "display name when there is no first name");
eq(maskEmail("owner@csuohio.edu"), "ow***@csuohio.edu", "masked for the timeline");

const mail = extractionCompleteEmail({
  recipientName: "Dana", entityName: "Cleveland <State> University", website: "www.csuohio.edu",
  itemLabel: "courses", itemCount: 795,
  coverage: [{ label: "campuses", count: 3 }, { label: "courses with fees", count: 412 }, { label: "courses with intake dates", count: 0 }],
  portalUrl: "https://app.globalyhub.com/business/portal",
});
eq(mail.subject, "Your Cleveland <State> University profile is ready on GlobalyApp", "subject names the entity");
eq(mail.html.includes("Cleveland &lt;State&gt; University") && !mail.html.includes("<State>"), true, "entity name is escaped in HTML");
eq(mail.html.includes("795") && mail.html.includes("courses found"), true, "headline count");
eq(mail.html.includes("412 courses with fees") && !mail.html.includes("0 courses with intake dates"), true, "coverage lists only what was found");
eq(mail.html.includes('href="https://app.globalyhub.com/business/portal"'), true, "CTA to the portal");
eq(mail.html.includes("#012E8A"), true, "brand layout (navy primary) is used");
eq(mail.text.includes("Hi Dana,") && mail.text.includes("https://app.globalyhub.com/business/portal"), true, "plain-text version carries greeting and link");

const toEntity = extractionCompleteEmail({ recipientName: null, entityName: "Acme Visas", website: null, itemLabel: "services", itemCount: 12, coverage: [], portalUrl: "https://x/business/portal" });
eq(toEntity.text.startsWith("Hi Acme Visas team,") && toEntity.html.includes("services found"), true, "the entity's own inbox is greeted as the team; visa jobs count services");

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
