import { httpPost } from "@/lib/api/http";
import type { WaitlistSignupInput, WaitlistSignupResult } from "./types";

/**
 * The route is anonymous — no JWT is required and none is sent unless the visitor
 * happens to be signed in, which the backend ignores. It still goes through
 * lib/api/http.ts (§1.4) so the base URL and the ApiError shape are the app's, not
 * a second hand-rolled fetch.
 */
export const waitlistRealApi = {
  signup: async (input: WaitlistSignupInput): Promise<WaitlistSignupResult> => {
    const raw = await httpPost<Partial<WaitlistSignupResult>>("/waitlist", input);
    return { ok: true, already_registered: raw?.already_registered === true };
  },
};
