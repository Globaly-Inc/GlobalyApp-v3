// Enquiry-specific errors. src/shared/errors.ts is owned elsewhere and has no
// 429, so the rate-limit error lives here — same precedent as billing/errors.ts.

import { AppError } from "../../shared/errors.js";
import { ENQUIRY_RATE_LIMIT, ENQUIRY_RATE_WINDOW_HOURS } from "./consts.js";

/**
 * Unlocking a distribution this business has already closed.
 *
 * 409 rather than 404: the row IS in the caller's inbox, so hiding it would be a
 * lie, and the caller can fix the situation by looking at the row it already has.
 * Nothing to do with cross-tenant isolation, which is still a 404 above this.
 */
export class EnquiryClosedError extends AppError {
  constructor() {
    super("This enquiry has been closed and can no longer be unlocked", 409, "ENQUIRY_CLOSED");
  }
}

export class EnquiryRateLimitError extends AppError {
  constructor() {
    super(
      `Rate limit exceeded: maximum ${ENQUIRY_RATE_LIMIT} enquiries per ${ENQUIRY_RATE_WINDOW_HOURS} hours`,
      429,
      "ENQUIRY_RATE_LIMIT",
    );
  }
}
