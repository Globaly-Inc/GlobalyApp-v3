"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/combobox";

/**
 * One configured booking requirement, rendered.
 *
 * An **Other** Service Category's requirements are rows an admin maintains, so this component is handed
 * a definition and knows nothing about airports or rentals. It is the only place a requirement turns
 * into a control, which is what lets the Super Admin preview and the buyer's form be the same thing
 * rather than two renderers that drift apart.
 *
 * Nothing here is a security boundary: `booking.service.ts` re-checks every answer against the same
 * definitions server-side, and its verdict is the one that counts.
 */

export type BookingRequirementValidation = {
  min?: number;
  max?: number;
  min_length?: number;
  max_length?: number;
  pattern?: string;
};

/** The definition, as both the admin API and the public listing API return it. */
export type BookingRequirement = {
  key: string;
  label: string;
  type: string;
  is_required?: boolean;
  options?: (string | number)[] | null;
  placeholder?: string | null;
  help_text?: string | null;
  default_value?: string | null;
  validation?: BookingRequirementValidation | null;
};

export type BookingRequirementValue = string | number | boolean | string[] | null;

const CHOICE_TYPES = ["select", "radio"];
const MULTI_CHOICE_TYPES = ["multi_select", "checkbox"];

const optionsOf = (field: BookingRequirement) => (field.options ?? []).map((o) => String(o));

export const isBlankAnswer = (v: BookingRequirementValue | undefined) =>
  v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

/** Prefill from the admin's default values, coerced to what each control expects. */
export function defaultAnswersFor(fields: BookingRequirement[]): Record<string, BookingRequirementValue> {
  const answers: Record<string, BookingRequirementValue> = {};
  for (const field of fields) {
    const raw = field.default_value;
    if (raw == null || raw === "") continue;
    if (field.type === "number") {
      const n = Number(raw);
      if (Number.isFinite(n)) answers[field.key] = n;
    } else if (field.type === "boolean") {
      answers[field.key] = raw === "true";
    } else if (MULTI_CHOICE_TYPES.includes(field.type)) {
      answers[field.key] = raw.split(",").map((s) => s.trim()).filter(Boolean);
    } else {
      answers[field.key] = raw;
    }
  }
  return answers;
}

/**
 * The browser's copy of the server's rules, keyed by field. Only here to save a round trip — a rule the
 * server enforces and this misses is caught server-side, never the other way round.
 */
export function validateAnswers(
  fields: BookingRequirement[],
  answers: Record<string, BookingRequirementValue>,
): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const field of fields) {
    const value = answers[field.key];
    if (isBlankAnswer(value)) {
      if (field.is_required) errors[field.key] = `${field.label} is required`;
      continue;
    }

    const rules = field.validation;
    if (!rules) continue;

    if (typeof value === "number") {
      if (rules.min !== undefined && value < rules.min) errors[field.key] = `${field.label} must be at least ${rules.min}`;
      else if (rules.max !== undefined && value > rules.max) errors[field.key] = `${field.label} must be at most ${rules.max}`;
      continue;
    }

    const length = typeof value === "string" ? value.length : Array.isArray(value) ? value.length : undefined;
    if (length === undefined) continue;
    const min = rules.min_length ?? rules.min;
    const max = rules.max_length ?? rules.max;
    const unit = Array.isArray(value) ? "option" : "character";
    if (min !== undefined && length < min) {
      errors[field.key] = `${field.label} needs at least ${min} ${unit}${min === 1 ? "" : "s"}`;
    } else if (max !== undefined && length > max) {
      errors[field.key] = `${field.label} must be ${max} ${unit}${max === 1 ? "" : "s"} or fewer`;
    }
  }

  return errors;
}

/** date/time/datetime/email/phone/number all reach the same control; only the input type differs. */
const NATIVE_INPUT_TYPE: Record<string, string> = {
  number: "number",
  time: "time",
  datetime: "datetime-local",
  email: "email",
  phone: "tel",
};

export function BookingRequirementField({
  field,
  value,
  error,
  disabled = false,
  onChange,
}: Readonly<{
  field: BookingRequirement;
  value: BookingRequirementValue | undefined;
  error?: string;
  disabled?: boolean;
  onChange: (value: BookingRequirementValue) => void;
}>) {
  const id = `req-${field.key}`;
  const asText = typeof value === "string" || typeof value === "number" ? String(value) : "";
  const selected = Array.isArray(value) ? value : [];
  const toggle = (option: string) =>
    onChange(selected.includes(option) ? selected.filter((v) => v !== option) : [...selected, option]);

  // Types that render a group of controls or a popover trigger have no single input to point `htmlFor` at;
  // each of those labels its own group with aria-label instead of leaving a dangling reference.
  const hasLabelledInput = !["date", "boolean", "radio", "checkbox", "multi_select"].includes(field.type);

  return (
    // flex-col gap, never space-y: these wrappers can contain popovers whose focus guards inherit
    // sibling margins (frontend/AGENTS.md).
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={hasLabelledInput ? id : undefined}>
        {field.label}
        {field.is_required && <span aria-hidden className="text-destructive"> *</span>}
      </Label>

      {field.type === "long_text" ? (
        <Textarea
          id={id}
          rows={3}
          disabled={disabled}
          aria-invalid={!!error}
          placeholder={field.placeholder ?? undefined}
          value={asText}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : field.type === "date" ? (
        <DatePicker
          value={asText}
          onChange={onChange}
          aria-invalid={!!error}
          placeholder={field.placeholder ?? "Select date"}
        />
      ) : field.type === "boolean" ? (
        <div role="group" aria-label={field.label} className="flex gap-2">
          {[true, false].map((b) => (
            <Button
              key={String(b)}
              type="button"
              size="sm"
              disabled={disabled}
              aria-pressed={value === b}
              variant={value === b ? "default" : "outline"}
              onClick={() => onChange(b)}
            >
              {b ? "Yes" : "No"}
            </Button>
          ))}
        </div>
      ) : CHOICE_TYPES.includes(field.type) ? (
        field.type === "radio" ? (
          <div role="radiogroup" aria-label={field.label} className="flex flex-col gap-2">
            {optionsOf(field).map((option) => (
              <label key={option} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={id}
                  value={option}
                  disabled={disabled}
                  checked={value === option}
                  onChange={() => onChange(option)}
                  className="h-4 w-4 accent-primary"
                />
                {option}
              </label>
            ))}
          </div>
        ) : (
          <Combobox
            id={id}
            options={optionsOf(field).map((o) => ({ value: o, label: o }))}
            value={typeof value === "string" ? value : ""}
            onChange={onChange}
            disabled={disabled}
            aria-invalid={!!error}
            placeholder={field.placeholder ?? "Choose…"}
          />
        )
      ) : field.type === "checkbox" ? (
        <div role="group" aria-label={field.label} className="flex flex-col gap-2">
          {optionsOf(field).map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm">
              <Checkbox
                disabled={disabled}
                checked={selected.includes(option)}
                onCheckedChange={() => toggle(option)}
              />
              {option}
            </label>
          ))}
        </div>
      ) : field.type === "multi_select" ? (
        <div role="group" aria-label={field.label} className="flex flex-wrap gap-2">
          {optionsOf(field).map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              disabled={disabled}
              aria-pressed={selected.includes(option)}
              variant={selected.includes(option) ? "default" : "outline"}
              onClick={() => toggle(option)}
            >
              {option}
            </Button>
          ))}
        </div>
      ) : (
        <Input
          id={id}
          // A field type this file has not learned yet falls through to text rather than disappearing,
          // so a newly-added type is usable the moment an admin picks it.
          type={NATIVE_INPUT_TYPE[field.type] ?? "text"}
          disabled={disabled}
          aria-invalid={!!error}
          placeholder={field.placeholder ?? undefined}
          min={field.type === "number" ? field.validation?.min : undefined}
          max={field.type === "number" ? field.validation?.max : undefined}
          value={asText}
          onChange={(e) => onChange(field.type === "number" ? Number(e.target.value) : e.target.value)}
        />
      )}

      {field.help_text && <p className="text-xs text-muted-foreground">{field.help_text}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
