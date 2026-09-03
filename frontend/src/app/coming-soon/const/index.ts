export const REGISTRANT_TYPES = [
  { value: "student", label: "Student" },
  { value: "institution", label: "Institution" },
  { value: "service_provider", label: "Service Provider" },
  { value: "other", label: "Other" },
] as const;

export type RegistrantType = (typeof REGISTRANT_TYPES)[number]["value"];

// Fixed launch instant (AEST). Absolute moment → correct for every viewer's clock.
export const LAUNCH_MS = new Date("2026-09-10T00:00:00+10:00").getTime();
