"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SchemaField, SchemaFieldInput, SchemaFieldValidation } from "../apis/types";

/**
 * The extra controls a booking requirement gets: the hint text a customer reads, what the field is
 * pre-filled with, and the bounds "at least 1 passenger" means.
 *
 * Only Other Service Categories show these — a business or service category form renders its fields by
 * key and would ignore every one of them.
 */

const OPTION_TYPES = ["select", "multi_select", "radio", "checkbox"];

/** A blank box means "no bound", which is not the same as 0. */
const toBound = (raw: string) => (raw.trim() === "" ? undefined : Number(raw));

export function SchemaFieldBookingOptions({
  field,
  onLocalChange,
  onCommit,
}: Readonly<{
  field: SchemaField | SchemaFieldInput;
  onLocalChange: (patch: Partial<SchemaFieldInput>) => void;
  onCommit: (patch: Partial<SchemaFieldInput>) => void;
}>) {
  const rules: SchemaFieldValidation = field.validation ?? {};
  const needsOptions = OPTION_TYPES.includes(field.type);
  const isChoiceOrYesNo = needsOptions || field.type === "boolean";

  /** Merge one bound in and drop the empties, so an all-blank rule set is stored as no rules at all. */
  const withRule = (patch: SchemaFieldValidation) => {
    const merged = { ...rules, ...patch };
    for (const key of Object.keys(merged) as (keyof SchemaFieldValidation)[]) {
      if (merged[key] === undefined || Number.isNaN(merged[key])) delete merged[key];
    }
    return Object.keys(merged).length > 0 ? merged : null;
  };

  return (
    <div className="grid grid-cols-1 gap-3 pl-6 md:grid-cols-3">
      {!isChoiceOrYesNo && (
        <div className="space-y-1">
          <Label className="text-xs">Placeholder</Label>
          <Input
            className="h-8 text-xs"
            value={field.placeholder ?? ""}
            placeholder="e.g. Enter flight number"
            onChange={(e) => onLocalChange({ placeholder: e.target.value })}
            onBlur={() => onCommit({ placeholder: field.placeholder?.trim() || null })}
          />
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-xs">Help text</Label>
        <Input
          className="h-8 text-xs"
          value={field.help_text ?? ""}
          placeholder="Shown under the field"
          onChange={(e) => onLocalChange({ help_text: e.target.value })}
          onBlur={() => onCommit({ help_text: field.help_text?.trim() || null })}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Default value</Label>
        <Input
          className="h-8 text-xs"
          value={field.default_value ?? ""}
          placeholder={field.type === "boolean" ? "true or false" : "Pre-filled for the customer"}
          onChange={(e) => onLocalChange({ default_value: e.target.value })}
          onBlur={() => onCommit({ default_value: field.default_value?.trim() || null })}
        />
      </div>

      {field.type === "number" ? (
        <>
          <div className="space-y-1">
            <Label className="text-xs">Smallest allowed</Label>
            <Input
              className="h-8 text-xs"
              inputMode="numeric"
              value={rules.min ?? ""}
              placeholder="e.g. 1"
              onChange={(e) => onCommit({ validation: withRule({ min: toBound(e.target.value) }) })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Largest allowed</Label>
            <Input
              className="h-8 text-xs"
              inputMode="numeric"
              value={rules.max ?? ""}
              placeholder="e.g. 8"
              onChange={(e) => onCommit({ validation: withRule({ max: toBound(e.target.value) }) })}
            />
          </div>
        </>
      ) : isChoiceOrYesNo ? null : (
        <div className="space-y-1">
          <Label className="text-xs">Maximum length</Label>
          <Input
            className="h-8 text-xs"
            inputMode="numeric"
            value={rules.max_length ?? ""}
            placeholder="e.g. 500"
            onChange={(e) => onCommit({ validation: withRule({ max_length: toBound(e.target.value) }) })}
          />
        </div>
      )}
    </div>
  );
}
