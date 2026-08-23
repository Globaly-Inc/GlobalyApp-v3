"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  BookingRequirementField,
  defaultAnswersFor,
  validateAnswers,
} from "@/components/booking-requirement-field";
import type { BookingAnswerValue, BookingField } from "../apis";

/**
 * The booking request form, built at runtime from the requirements the listing's category configures.
 *
 * The requirements are rows an admin maintains per Other Service Category, so this component knows
 * nothing about airports or tutoring — it renders whatever it is handed. Adding "how many bags?" to
 * Airport Pickup is an admin action, not a release. Each control comes from
 * `@/components/booking-requirement-field`, the same component the Super Admin preview draws with.
 *
 * Client-side validation here is only to save a round trip: the server re-checks every answer against
 * the same definitions, and it is the server's copy that decides.
 */
export function BookingDialog({
  open,
  onOpenChange,
  serviceTitle,
  priceLabel,
  fields,
  submitting,
  onSubmit,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceTitle: string;
  priceLabel: string;
  fields: BookingField[];
  submitting: boolean;
  onSubmit: (answers: Record<string, BookingAnswerValue>, note: string | null) => void;
}>) {
  // Only what the buyer changed is state. The admin's default values are layered underneath at render
  // time rather than copied into state by an effect, so a category whose defaults change is reflected
  // immediately and clearing a pre-filled field stays cleared.
  const [edits, setEdits] = useState<Record<string, BookingAnswerValue>>({});
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);

  const answers = { ...defaultAnswersFor(fields), ...edits };
  const errors = validateAnswers(fields, answers);

  const submit = () => {
    setTouched(true);
    if (Object.keys(errors).length > 0) return;
    onSubmit(answers, note.trim() || null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Request this booking</DialogTitle>
          <DialogDescription>
            {fields.length > 0
              ? `${serviceTitle} — tell the provider what you need. They'll confirm before you pay ${priceLabel}.`
              : `${serviceTitle} — the provider will confirm before you pay ${priceLabel}.`}
          </DialogDescription>
        </DialogHeader>

        {/* flex-col gap, never space-y: these wrappers can contain popovers whose focus guards inherit
            sibling margins (frontend/AGENTS.md). */}
        <div className="flex max-h-[55vh] flex-col gap-4 overflow-y-auto pr-1">
          {fields.map((field) => (
            <BookingRequirementField
              key={field.key}
              field={field}
              value={answers[field.key]}
              error={touched ? errors[field.key] : undefined}
              disabled={submitting}
              onChange={(value) => setEdits((a) => ({ ...a, [field.key]: value }))}
            />
          ))}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bk-note">Anything else? (optional)</Label>
            <Textarea
              id="bk-note"
              rows={3}
              value={note}
              placeholder="Flight number, how many of you, anything the provider should know."
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          You won&apos;t be charged yet. The provider accepts or declines first, and you only pay to confirm.
        </p>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "Sending…" : "Send request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
