// Driver selection, shaped like shared/storage/storageService.ts's config-driven switch: a real provider
// when configured, otherwise a local stand-in, and callers never learn which one is active.

import { config } from "../../../config.js";
import { devDriver } from "./dev-driver.js";
import { stripeDriver } from "./stripe-driver.js";
import type { PaymentDriver } from "./types.js";

export type { PaymentDriver, PaymentRefund, PaymentSession } from "./types.js";
export { makeDevSessionId } from "./dev-driver.js";

/**
 * The production guard is here, at *selection* — not at import time in dev-driver.ts.
 *
 * An import-time throw fires in every process that merely loads the module: the migration runner, a
 * typecheck, an unrelated worker, a test run. It would also fire in a production deployment that never takes
 * a payment. The condition that actually matters is narrower — "we are about to hand a caller a driver that
 * approves payments without charging, in production" — and that is exactly what this checks.
 */
export function getDriver(): PaymentDriver {
  if (config.STRIPE_SECRET_KEY) return stripeDriver;

  if (config.NODE_ENV === "production") {
    throw new Error(
      "Payments are not configured: STRIPE_SECRET_KEY is unset and the dev payment driver, " +
        "which approves payments without charging, must never serve production traffic.",
    );
  }
  return devDriver;
}

/** True when a real payment provider is behind the seam. */
export function isConfigured(): boolean {
  return !!config.STRIPE_SECRET_KEY;
}
