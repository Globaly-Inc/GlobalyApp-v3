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
  const [form, setFormState] = useState<T>(init);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function setForm(updater: (f: T) => T) {
    setFormState((f) => {
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
    setFormState(next);
    setErrors({});
  }

  function validate(): T | null {
    const result = schema.safeParse(form);
    if (!result.success) {
      setErrors(getFieldErrors(result.error));
      return null;
    }
    setErrors({});
    return result.data;
  }

  return { form, setForm, errors, reset, validate };
}

/** MM/YYYY or MM-YYYY text <-> native <input type="month"> value (YYYY-MM), storage format stays unchanged. */
export function toMonthInput(value: string, sep: "/" | "-" = "/"): string {
  const m = value.match(sep === "/" ? /^(\d{2})\/(\d{4})$/ : /^(\d{2})-(\d{4})$/);
  return m ? `${m[2]}-${m[1]}` : "";
}

export function fromMonthInput(value: string, sep: "/" | "-" = "/"): string {
  const m = value.match(/^(\d{4})-(\d{2})$/);
  return m ? `${m[2]}${sep}${m[1]}` : "";
}
