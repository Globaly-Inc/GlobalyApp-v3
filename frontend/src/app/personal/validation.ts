import { z } from "zod";

const STEP2_FIELD_SCHEMAS = {
  nationalityId: z.string().trim().min(1, "Nationality is required"),
  dob: z.string().trim().min(1, "Date of birth is required"),
  gender: z.string().trim().min(1, "Gender is required"),
  address: z.string().trim().min(1, "Current address is required"),
  destinations: z.array(z.string()).min(1, "Pick at least one destination"),
  fields: z.array(z.string()).min(1, "Pick at least one field of study"),
  degreeLevel: z.string().trim().min(1, "Degree level is required"),
};

type Step2Field = keyof typeof STEP2_FIELD_SCHEMAS;

export function validateStep2Field(field: Step2Field, value: unknown): string | null {
  const result = STEP2_FIELD_SCHEMAS[field].safeParse(value);
  return result.success ? null : (result.error.issues[0]?.message ?? "Invalid value");
}

export function validateStep2(values: {
  nationalityId: string;
  dob: string;
  gender: string;
  address: string;
  category: string | null;
  destinations: string[];
  fields: string[];
  degreeLevel: string;
}): Record<string, string> | null {
  const fieldErrors: Record<string, string> = {};
  for (const field of ["nationalityId", "dob", "gender", "address"] as const) {
    const error = validateStep2Field(field, values[field]);
    if (error) fieldErrors[field] = error;
  }
  if (values.category !== "education_professional") {
    const destinationsError = validateStep2Field("destinations", values.destinations);
    if (destinationsError) fieldErrors.destinations = destinationsError;
    const fieldsError = validateStep2Field("fields", values.fields);
    if (fieldsError) fieldErrors.fields = fieldsError;
    const degreeLevelError = validateStep2Field("degreeLevel", values.degreeLevel);
    if (degreeLevelError) fieldErrors.degreeLevel = degreeLevelError;
  }
  return Object.keys(fieldErrors).length ? fieldErrors : null;
}
