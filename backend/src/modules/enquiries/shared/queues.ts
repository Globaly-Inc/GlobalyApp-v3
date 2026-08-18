// Enquiry queue names — single source of truth for publishers and consumers.
// Pattern mirrors data-extraction/shared/queues.ts.

export const ENQUIRY_QUEUES = {
  /** Enquiry row committed → matching worker runs the tiered match. */
  CREATED: "enquiry_created",
  /** Matching worker finished → future phases (email queue) notify recipients. */
  DISTRIBUTED: "enquiry_distributed",
} as const;
