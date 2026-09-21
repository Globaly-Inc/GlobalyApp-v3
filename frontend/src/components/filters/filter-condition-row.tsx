"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/combobox";
import { FilterValueInput } from "./filter-value-input";
import { OPERATOR_LABELS, type FilterCondition, type FilterFieldDefinition, type FilterOperator } from "./types";

/** One `<field> <operator> <value>` line inside a filter group. */
export function FilterConditionRow({
  condition,
  fieldDefinitions,
  onUpdate,
  onRemove,
}: Readonly<{
  condition: FilterCondition;
  fieldDefinitions: FilterFieldDefinition[];
  onUpdate: (updates: Partial<FilterCondition>) => void;
  onRemove: () => void;
}>) {
  const fieldDef = fieldDefinitions.find((f) => f.fieldId === condition.fieldId);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Combobox
        className="h-8 w-40 text-xs"
        options={fieldDefinitions.map((f) => ({ value: f.fieldId, label: f.label }))}
        value={condition.fieldId}
        onChange={(fieldId) => {
          const next = fieldDefinitions.find((f) => f.fieldId === fieldId);
          if (!next) return;
          // Operators and the value shape belong to the field — switching field resets both,
          // or a "contains" carried onto a date field would silently never match.
          onUpdate({ fieldId, operator: next.operators[0], value: null });
        }}
        placeholder="Field"
      />

      <Combobox
        className="h-8 w-36 text-xs"
        options={(fieldDef?.operators ?? []).map((op) => ({ value: op, label: OPERATOR_LABELS[op] }))}
        value={condition.operator}
        onChange={(op) => op && onUpdate({ operator: op as FilterOperator, value: null })}
        placeholder="Operator"
      />

      {fieldDef && (
        <FilterValueInput
          fieldDef={fieldDef}
          operator={condition.operator}
          value={condition.value}
          onChange={(value) => onUpdate({ value })}
        />
      )}

      <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label="Remove condition">
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
