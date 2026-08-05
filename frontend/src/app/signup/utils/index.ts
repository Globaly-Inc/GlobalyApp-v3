import type { Dispatch, SetStateAction } from "react";
import { signUpDetailsSchema, zodErrorsToFieldErrors } from "../validation";

export function formatCooldown(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}:${secs.toString().padStart(2, "0")}` : `${secs}s`;
}

export function clearFieldErrorIfNowValid(
  setFieldErrors: Dispatch<SetStateAction<Record<string, string>>>,
  field: string,
  isNowValid: boolean,
) {
  if (!isNowValid) return;
  setFieldErrors((prev) => {
    if (!prev[field]) return prev;
    const rest = { ...prev };
    delete rest[field];
    return rest;
  });
}

export function validateSignUpDetails(values: { firstName: string; lastName: string; email: string }) {
  const result = signUpDetailsSchema.safeParse(values);
  return result.success ? null : zodErrorsToFieldErrors(result.error);
}
