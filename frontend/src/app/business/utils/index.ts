import type { Dispatch, SetStateAction } from "react";

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
