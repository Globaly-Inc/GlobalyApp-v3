// Self-check for isApprovedCourse. Run: npm run test:course-approval
import assert from "node:assert/strict";
import { isApprovedCourse } from "../src/modules/superadmin/consts.js";

// Business-portal (self-service) extraction: no approval needed, a rejection still hides it.
assert.equal(isApprovedCourse("unverified", "institution_self_service"), true);
assert.equal(isApprovedCourse(null, "business_self_service"), true);
assert.equal(isApprovedCourse("flagged", "institution_self_service"), false);
// Superadmin extraction: still needs approval.
assert.equal(isApprovedCourse("unverified", "admin"), false);
assert.equal(isApprovedCourse(null, null), false);
assert.equal(isApprovedCourse("confirmed", "admin"), true);
assert.equal(isApprovedCourse("manual", null), true);
console.log("course-approval: ok");
