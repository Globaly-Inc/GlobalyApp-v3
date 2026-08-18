import type { RegistrantType } from "../apis";

/** Labels match backend REGISTRANT_TYPE_LABELS, which the confirmation email uses. */
export const REGISTRANT_TYPE_OPTIONS: ReadonlyArray<{ value: RegistrantType; label: string }> = [
  { value: "student", label: "Student" },
  { value: "institution", label: "Institution" },
  { value: "service_provider", label: "Service Provider" },
  { value: "other", label: "Other" },
];

/** Mirrors the zod bounds on POST /api/v3/waitlist so the form fails before the API does. */
export const WAITLIST_FIELD_LIMITS = {
  emailMax: 320,
  nameMax: 120,
} as const;
