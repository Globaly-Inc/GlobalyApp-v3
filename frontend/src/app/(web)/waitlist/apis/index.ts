// No mock branch on purpose: §1.4 — a page that has gone live deletes its mock
// path. POST /api/v3/waitlist exists
// (backend/src/modules/waitlist/routes/waitlist.routes.ts), so there is nothing
// for a mock to stand in for.
export { waitlistRealApi as waitlistApi } from "./real-api";
export { REGISTRANT_TYPES } from "./types";
export type { RegistrantType, WaitlistSignupInput, WaitlistSignupResult } from "./types";
