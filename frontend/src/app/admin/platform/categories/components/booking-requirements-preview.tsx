"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  BookingRequirementField,
  defaultAnswersFor,
  validateAnswers,
  type BookingRequirementValue,
} from "@/components/booking-requirement-field";
import type { SchemaField } from "../apis/types";

/**
 * What the customer will see, drawn by the same component the Personal Portal booking form uses.
 *
 * Sharing the renderer is the point: a preview built from its own copy of the controls would drift from
 * the real form and quietly stop being a preview. This is fully interactive so an admin can check that
 * "at least 1 passenger" actually refuses 0 before saving the category.
 */
export function BookingRequirementsPreview({
  categoryName,
  fields,
}: Readonly<{ categoryName: string; fields: SchemaField[] }>) {
  // Only what the admin typed into the preview is state; defaults are layered underneath at render time,
  // so editing a default value in the builder is reflected here on the next keystroke.
  const [edits, setEdits] = useState<Record<string, BookingRequirementValue>>({});
  const [touched, setTouched] = useState(false);

  if (fields.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nothing to preview yet. Add what the customer should provide and it will appear here exactly as they
        will see it.
      </p>
    );
  }

  const answers = { ...defaultAnswersFor(fields), ...edits };
  const errors = validateAnswers(fields, answers);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-medium text-foreground">{categoryName || "This service"}</p>

      {fields.map((field) => (
        <BookingRequirementField
          key={field.id}
          field={field}
          value={answers[field.key]}
          error={touched ? errors[field.key] : undefined}
          onChange={(value) => setEdits((a) => ({ ...a, [field.key]: value }))}
        />
      ))}

      <div className="flex items-center gap-3">
        <Button type="button" size="sm" onClick={() => setTouched(true)}>
          Continue
        </Button>
        <span className="text-xs text-muted-foreground">
          {touched && Object.keys(errors).length === 0
            ? "Nothing missing — a customer could submit this."
            : "Preview only. Nothing is submitted."}
        </span>
      </div>
    </div>
  );
}
