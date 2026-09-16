"use client";

// Renders whatever extra schema_fields the SELECTED category defines beyond the three special
// ones (degree_level/area_of_study/awarded_by, handled by CourseDetailsCard's own comboboxes) —
// same mechanism V1's BusinessServiceEditor.renderCategoryFields() used, generalized here so an
// "Insurance" or "Transport" category's own fields actually render instead of being invisible.

import { useState } from "react";
import { ListChecks, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/combobox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SchemaField } from "@/app/admin/platform/categories/apis/types";

function fieldValueLabel(field: SchemaField, value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (field.type === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function FieldInput({
  field, value, onChange,
}: Readonly<{ field: SchemaField; value: unknown; onChange: (v: unknown) => void }>) {
  if (field.type === "boolean") {
    return <Checkbox checked={Boolean(value)} onCheckedChange={onChange} />;
  }
  if (field.type === "select" || field.type === "multi_select") {
    return (
      <Combobox
        options={(field.options ?? []).map((o) => ({ value: String(o), label: String(o) }))}
        value={value != null ? String(value) : ""}
        onChange={onChange}
        placeholder={`Select ${field.label.toLowerCase()}`}
      />
    );
  }
  return (
    <Input
      type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
      value={value != null ? String(value) : ""}
      onChange={(e) => onChange(field.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)}
    />
  );
}

export function CategoryExtraFields({
  fields, values, onChangeField, onSave,
}: Readonly<{
  fields: SchemaField[];
  values: Record<number, unknown>;
  onChangeField: (fieldId: number, value: unknown) => void;
  onSave: () => Promise<void>;
}>) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  if (fields.length === 0) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="gap-0 overflow-hidden">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-primary" />
          <h2 className="text-sm font-semibold">Additional details</h2>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing((v) => !v)} aria-label="Edit additional details">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </div>
      <CardContent className="p-5">
        {editing ? (
          <div className="flex flex-col gap-4">
            {fields.map((field) => (
              <div key={field.id} className="flex flex-col gap-2">
                <Label>{field.label}{field.is_required && <span className="text-destructive"> *</span>}</Label>
                <FieldInput field={field} value={values[field.id]} onChange={(v) => onChangeField(field.id, v)} />
              </div>
            ))}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" disabled={saving} onClick={() => setEditing(false)}>Cancel</Button>
              <Button size="sm" disabled={saving} onClick={handleSave}>{saving ? "Saving…" : "Save"}</Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {fields.map((field) => (
              <div key={field.id}>
                <p className="text-xs text-muted-foreground">{field.label}</p>
                <p className={fieldValueLabel(field, values[field.id]) ? "text-sm" : "text-sm italic text-muted-foreground"}>
                  {fieldValueLabel(field, values[field.id]) ?? "Not set"}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
