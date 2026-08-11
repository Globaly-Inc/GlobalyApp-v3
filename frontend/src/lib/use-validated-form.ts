import { useState } from "react";
import type { z } from "zod";

function getFieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0]);
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

export function useValidatedForm<T extends Record<string, unknown>>(schema: z.ZodType<T>, init: () => T) {
  const [formValue, setFormValue] = useState<T>(init);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function setForm(updater: (f: T) => T) {
    setFormValue((f) => {
      const next = updater(f);
      setErrors((prevErrors) => {
        if (Object.keys(prevErrors).length === 0) return prevErrors;
        const result = schema.safeParse(next);
        const nextErrors = result.success ? {} : getFieldErrors(result.error);
        const cleared: Record<string, string> = {};
        for (const key of Object.keys(prevErrors)) {
          if (nextErrors[key]) cleared[key] = nextErrors[key];
        }
        return cleared;
      });
      return next;
    });
  }

  function reset(next: T) {
    setFormValue(next);
    setErrors({});
  }

  function validate(): T | null {
    const result = schema.safeParse(formValue);
    if (!result.success) {
      setErrors(getFieldErrors(result.error));
      return null;
    }
    setErrors({});
    return result.data;
  }

  return { form: formValue, setForm, errors, reset, validate };
}
