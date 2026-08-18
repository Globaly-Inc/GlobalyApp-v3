// V2's registrant_type vocabulary, verbatim. Mirrors the CHECK constraint in
// database/migrations/globalyapp/20260817_822_waitlist_registrations.ts — unlike
// favourites, this IS a closed set: adding a registrant kind is a product decision
// with a matching change to the sign-up form, not something a wave does in passing.

export const REGISTRANT_TYPES = ["student", "institution", "service_provider", "other"] as const;

export type RegistrantType = (typeof REGISTRANT_TYPES)[number];

/** Human labels for the confirmation email. */
export const REGISTRANT_TYPE_LABELS: Record<RegistrantType, string> = {
  student: "Student",
  institution: "Institution",
  service_provider: "Service Provider",
  other: "Other",
};
