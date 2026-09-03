import { z } from "zod";
import { isValidPhoneForCountry } from "@/app/admin/platform/businesses/utils";

const phoneCountryIdSchema = z.string().trim().min(1, "Phone code is required");
const phoneNumberSchema = z.string().trim().min(1, "Phone number is required");
const countryIdSchema = z.string().trim().min(1, "Country is required");
const addressSchema = z.string().trim().min(1, "Address is required");
const businessNameSchema = z.string().trim().min(1, "Business name is required");

const BUSINESS_FIELD_SCHEMAS = {
  phoneCountryId: phoneCountryIdSchema,
  phoneNumber: phoneNumberSchema,
  countryId: countryIdSchema,
  address: addressSchema,
  businessName: businessNameSchema,
};

export function validateBusinessField(field: keyof typeof BUSINESS_FIELD_SCHEMAS, value: string): string | null {
  const result = BUSINESS_FIELD_SCHEMAS[field].safeParse(value);
  return result.success ? null : (result.error.issues[0]?.message ?? "Invalid value");
}

export function validateBusinessDetails(values: {
  phoneCountryId: string;
  phoneNumber: string;
  phoneIso2: string | null | undefined;
  countryId: string;
  address: string;
  businessName: string;
  isInstitution: boolean;
}): Record<string, string> | null {
  const fieldErrors: Record<string, string> = {};
  for (const field of ["phoneCountryId", "phoneNumber", "countryId", "address", "businessName"] as const) {
    const error = validateBusinessField(field, values[field]);
    if (error) fieldErrors[field] = error;
  }
  if (values.isInstitution) {
    const businessNameError = validateBusinessField("businessName", values.businessName);
    if (businessNameError) fieldErrors.businessName = businessNameError;
  }
  if (!fieldErrors.phoneCountryId && !fieldErrors.phoneNumber && !isValidPhoneForCountry(values.phoneNumber, values.phoneIso2 ?? undefined)) {
    fieldErrors.phoneNumber = "Enter a valid phone number for the selected country";
  }
  return Object.keys(fieldErrors).length ? fieldErrors : null;
}
