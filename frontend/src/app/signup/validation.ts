import { z } from "zod";

const firstNameSchema = z.string().trim().min(3, "First name is required");
const lastNameSchema = z.string().trim().min(3, "Last name is required");
const emailSchema = z
  .string()
  .trim()
  .max(255, "Email must be less than 255 characters")
  .pipe(z.email("Invalid email address"));
const otpCodeSchema = z.string().trim().length(6, "Please enter the 6-digit code").regex(/^\d+$/, "Code must be numeric");

export const signUpDetailsSchema = z.object({
  firstName: firstNameSchema,
  lastName: lastNameSchema,
  email: emailSchema,
});

export const otpSchema = z.object({ otpCode: otpCodeSchema });

const SIGN_UP_FIELD_SCHEMAS = {
  firstName: firstNameSchema,
  lastName: lastNameSchema,
  email: emailSchema,
};

export function zodErrorsToFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0]);
    if (!fieldErrors[field]) fieldErrors[field] = issue.message;
  }
  return fieldErrors;
}

export function validateSignUpField(field: "firstName" | "lastName" | "email", value: string): string | null {
  const schema = SIGN_UP_FIELD_SCHEMAS[field];
  const result = schema.safeParse(value);
  return result.success ? null : (result.error.issues[0]?.message ?? "Invalid value");
}

export function validateOtpField(value: string): string | null {
  const result = otpCodeSchema.safeParse(value);
  return result.success ? null : (result.error.issues[0]?.message ?? "Invalid value");
}
