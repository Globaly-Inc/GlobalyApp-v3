// Self-check for isApprovedCourse. Run: npm run test:course-approval
import assert from "node:assert/strict";
import { INGESTED_COURSE_STATUS, isApprovedCourse } from "../src/modules/superadmin/consts.js";

// Business-portal (self-service) extraction: no approval needed, a rejection still hides it.
assert.equal(isApprovedCourse("unverified", "institution_self_service"), true);
assert.equal(isApprovedCourse(null, "business_self_service"), true);
assert.equal(isApprovedCourse("flagged", "institution_self_service"), false);
// Courses an owner added by hand in the business portal (no extraction: the "self_service" placeholder).
assert.equal(isApprovedCourse(null, "self_service"), true);
// A Super Admin's manual institution still needs approval.
assert.equal(isApprovedCourse(null, "manual"), false);
// Superadmin extraction: still needs approval.
assert.equal(isApprovedCourse("unverified", "admin"), false);
assert.equal(isApprovedCourse(null, null), false);
assert.equal(isApprovedCourse("confirmed", "admin"), true);
assert.equal(isApprovedCourse("manual", null), true);
// A course is approved the moment it lands, with nobody approving it: that is true of a superadmin
// extraction, of the AgentCIS import, and of a course the verifier re-checked and found unchanged —
// all three write INGESTED_COURSE_STATUS.
assert.equal(isApprovedCourse(INGESTED_COURSE_STATUS, "admin"), true);
assert.equal(isApprovedCourse(INGESTED_COURSE_STATUS, "manual"), true);
assert.equal(isApprovedCourse(INGESTED_COURSE_STATUS, null), true);
// Rejecting it, or the verifier finding the live page disagrees, still takes it back out.
assert.equal(isApprovedCourse("flagged", "admin"), false);
assert.equal(isApprovedCourse("mismatch", "admin"), false);
console.log("course-approval: ok");
