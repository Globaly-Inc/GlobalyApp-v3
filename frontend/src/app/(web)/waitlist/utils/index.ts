import { ApiError } from "@/lib/api/http";
import { REGISTRANT_TYPES, type RegistrantType } from "../apis";
import { WAITLIST_FIELD_LIMITS } from "../const";

/** Fastify's rate-limit error code, echoed by the backend error handler. */
export const RATE_LIMIT_CODE = "FST_ERR_RATE_LIMIT";

/**
 * True when the sign-up was throttled rather than rejected.
 *
 * POST /api/v3/waitlist is capped at 10/min. Until the Wave-G6 error-handler fix
 * every throttled route in the app answered 500 "Internal server error", so a
 * client could not tell a throttle from an outage; it now answers a real 429 with
 * code FST_ERR_RATE_LIMIT.
 *
 * Both signals are checked, and either is enough: the code is the API's own, while
 * the status also catches a 429 produced upstream (ingress, CDN) whose body
 * carries no code for readError to pick up.
 */
export function isRateLimited(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false;
  return error.code === RATE_LIMIT_CODE || error.status === 429;
}

export type WaitlistFormState = "idle" | "submitting" | "done" | "throttled" | "error";

/**
 * Which state a failed submit lands in. A throttle is NOT a failure the visitor
 * can fix by editing the form, so it gets its own state and its own copy — telling
 * someone their details were rejected when the server merely asked them to wait is
 * the failure mode this exists to prevent.
 */
export function failureState(error: unknown): WaitlistFormState {
  return isRateLimited(error) ? "throttled" : "error";
}

export function isRegistrantType(value: string): value is RegistrantType {
  return (REGISTRANT_TYPES as readonly string[]).includes(value);
}

/**
 * Client-side validation mirroring the zod schema on the route, so the obvious
 * mistakes never cost a request against the 10/min budget. The server remains the
 * authority — this is a courtesy, not a trust boundary.
 */
export function validateSignup(input: {
  email: string;
  name: string;
  type: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  const email = input.email.trim();
  const name = input.name.trim();

  if (!email) errors.email = "Enter your email address.";
  else if (email.length > WAITLIST_FIELD_LIMITS.emailMax)
    errors.email = `Email must be ${WAITLIST_FIELD_LIMITS.emailMax} characters or fewer.`;
  // Deliberately loose: anything with a local part, an @ and a dotted domain. A
  // stricter regex than the server's rejects addresses the server would accept.
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a valid email address.";

  if (!name) errors.name = "Enter your name.";
  else if (name.length > WAITLIST_FIELD_LIMITS.nameMax)
    errors.name = `Name must be ${WAITLIST_FIELD_LIMITS.nameMax} characters or fewer.`;

  if (!isRegistrantType(input.type)) errors.type = "Choose which best describes you.";

  return errors;
}
