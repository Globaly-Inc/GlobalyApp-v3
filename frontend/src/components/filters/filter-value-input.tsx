"use client";

import { Combobox } from "@/components/combobox";
import { Input } from "@/components/ui/input";
import { NO_VALUE_OPERATORS, type FilterFieldDefinition, type FilterOperator, type FilterValue } from "./types";

const BOOLEAN_OPTIONS = [
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
];

/** The right-hand side of one condition row — shaped by the field's type and the operator. */
export function FilterValueInput({
  fieldDef,
  operator,
  value,
  onChange,
}: Readonly<{
  fieldDef: FilterFieldDefinition;
  operator: FilterOperator;
  value: FilterValue;
  onChange: (value: FilterValue) => void;
}>) {
  if (NO_VALUE_OPERATORS.includes(operator)) return null;

  if (operator === "between") {
    const pair = Array.isArray(value) ? value : ["", ""];
    const setAt = (i: number, next: string) => onChange(i === 0 ? [next, pair[1] ?? ""] : [pair[0] ?? "", next]);
    const isDate = fieldDef.type === "date";
    return (
      <div className="flex items-center gap-1">
        <Input
          type={isDate ? "date" : "number"}
          className="h-8 w-28 text-xs"
          value={pair[0] ?? ""}
          onChange={(e) => setAt(0, e.target.value)}
          placeholder="From"
        />
        <span className="text-xs text-muted-foreground">and</span>
        <Input
          type={isDate ? "date" : "number"}
          className="h-8 w-28 text-xs"
          value={pair[1] ?? ""}
          onChange={(e) => setAt(1, e.target.value)}
          placeholder="To"
        />
      </div>
    );
  }

  if (fieldDef.type === "single_select" || fieldDef.type === "multi_select" || fieldDef.type === "boolean") {
    const options = fieldDef.type === "boolean" ? BOOLEAN_OPTIONS : (fieldDef.options ?? []);
    // `is any of` / `is none of` still pick one option at a time, as in V1 — the matcher accepts
    // either a scalar or an array, so a saved filter carrying a list keeps working.
    return (
      <Combobox
        className="h-8 w-44 text-xs"
        options={options}
        value={Array.isArray(value) ? (value[0] ?? "") : String(value ?? "")}
        onChange={(v) => onChange(v || null)}
        placeholder="Select..."
      />
    );
  }

  if (fieldDef.type === "number" || fieldDef.type === "currency") {
    return (
      <Input
        type="number"
        className="h-8 w-32 text-xs"
        value={value == null ? "" : String(value)}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        placeholder="Value..."
      />
    );
  }

  if (fieldDef.type === "date") {
    return (
      <Input
        type="date"
        className="h-8 w-36 text-xs"
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value || null)}
      />
    );
  }

  return (
    <Input
      className="h-8 w-44 text-xs"
      value={String(value ?? "")}
      onChange={(e) => onChange(e.target.value || null)}
      placeholder="Value..."
    />
  );
}
