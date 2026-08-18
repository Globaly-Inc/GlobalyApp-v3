// Enquiry-specific errors. src/shared/errors.ts is owned elsewhere and has no
// 429, so the rate-limit error lives here — same precedent as billing/errors.ts.

import { AppError } from "../../shared/errors.js";
import { ENQUIRY_RATE_LIMIT, ENQUIRY_RATE_WINDOW_HOURS } from "./consts.js";

export class EnquiryRateLimitError extends AppError {
  constructor() {
    super(
      `Rate limit exceeded: maximum ${ENQUIRY_RATE_LIMIT} enquiries per ${ENQUIRY_RATE_WINDOW_HOURS} hours`,
      429,
      "ENQUIRY_RATE_LIMIT",
    );
  }
}
