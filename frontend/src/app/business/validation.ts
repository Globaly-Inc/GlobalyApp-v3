import { z } from "zod";

const phoneSchema = z.string().trim().min(1, "Phone number is required");
const countryIdSchema = z.string().trim().min(1, "Country is required");
const addressSchema = z.string().trim().min(1, "Address is required");
const subdomainSchema = z
  .string()
  .trim()
  .min(1, "Subdomain is required")
  .regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers, and hyphens allowed");
const businessNameSchema = z.string().trim().min(1, "Institution name is required");

const BUSINESS_FIELD_SCHEMAS = {
  phone: phoneSchema,
  countryId: countryIdSchema,
  address: addressSchema,
  subdomain: subdomainSchema,
  businessName: businessNameSchema,
};

export function validateBusinessField(field: keyof typeof BUSINESS_FIELD_SCHEMAS, value: string): string | null {
  const result = BUSINESS_FIELD_SCHEMAS[field].safeParse(value);
  return result.success ? null : (result.error.issues[0]?.message ?? "Invalid value");
}

export function validateBusinessDetails(values: {
  phone: string;
  countryId: string;
  address: string;
  subdomain: string;
  businessName: string;
  businessType: string | null;
}): Record<string, string> | null {
  const fieldErrors: Record<string, string> = {};
  for (const field of ["phone", "countryId", "address"] as const) {
    const error = validateBusinessField(field, values[field]);
    if (error) fieldErrors[field] = error;
  }
  if (values.businessType === "institution") {
    const businessNameError = validateBusinessField("businessName", values.businessName);
    if (businessNameError) fieldErrors.businessName = businessNameError;
  } else {
    const subdomainError = validateBusinessField("subdomain", values.subdomain);
    if (subdomainError) fieldErrors.subdomain = subdomainError;
  }
  return Object.keys(fieldErrors).length ? fieldErrors : null;
}

// Capped at 20 chars to match BusinessRegisterSchema's subdomain max — for institutions
// this field is auto-generated and never shown, so an overflow here would otherwise
// surface as a confusing "Couldn't create business" error pointing at a field the user
// never saw.
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-/, "")
    .replace(/-$/, "")
    .slice(0, 20)
    .replace(/-$/, "");
}
