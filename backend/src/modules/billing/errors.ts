// Billing-specific errors. Both are 402 Payment Required — the status that says
// "your request was understood and refused for a billing reason", which is what a
// client needs in order to route the user to a top-up or upgrade screen.
// src/shared/errors.ts has no 402 and is owned elsewhere, so they live here.

import { AppError } from "../../shared/errors.js";

export class InsufficientCreditsError extends AppError {
  constructor(
    public readonly required: number,
    public readonly available: number,
  ) {
    super(`Insufficient credits: ${required} required, ${available} available`, 402, "INSUFFICIENT_CREDITS");
  }
}

export class SubscriptionRequiredError extends AppError {
  constructor(
    public readonly feature: string,
    public readonly status: string,
  ) {
    super(`An active subscription is required for "${feature}"`, 402, "SUBSCRIPTION_REQUIRED");
  }
}
