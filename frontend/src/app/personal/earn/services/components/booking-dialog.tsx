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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RequiredMark } from "@/app/admin/platform/categories/components/required-mark";
import type { BookingAnswerValue, BookingField } from "../apis";

/**
 * The booking request form, built at runtime from the questions the listing's category asks.
 *
 * The questions are rows in `schema_fields` that an admin maintains per category, so this component knows
 * nothing about airports or tutoring — it renders whatever it is handed. Adding "how many bags?" to Airport
 * Pickup is an admin action, not a release.
 *
 * Client-side validation here is only to save a round trip: the server re-checks every answer against the
 * same definitions, and it is the server's copy that decides. A field type this file has not learned yet
 * falls through to a text input rather than disappearing, so a newly-added type is usable immediately.
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
  const [answers, setAnswers] = useState<Record<string, BookingAnswerValue>>({});
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);

  const set = (key: string, value: BookingAnswerValue) => setAnswers((a) => ({ ...a, [key]: value }));

  /** Options come back from jsonb as string|number; the wire and the UI both work in strings. */
  const optionsOf = (field: BookingField) => (field.options ?? []).map((o) => String(o));

  const isBlank = (v: BookingAnswerValue | undefined) =>
    v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
  const missing = fields.filter((f) => f.is_required && isBlank(answers[f.key]));

  const submit = () => {
    setTouched(true);
    if (missing.length > 0) return;
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
          {fields.map((field) => {
            const value = answers[field.key];
            const showError = touched && field.is_required && isBlank(value);
            return (
              <div key={field.key} className="flex flex-col gap-1.5">
                <Label htmlFor={`bk-${field.key}`}>
                  {field.label}
                  {field.is_required && <RequiredMark />}
                </Label>

                {field.type === "select" ? (
                  <select
                    id={`bk-${field.key}`}
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                    value={typeof value === "string" ? value : ""}
                    onChange={(e) => set(field.key, e.target.value)}
                  >
                    <option value="">Choose…</option>
                    {optionsOf(field).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : field.type === "multi_select" ? (
                  <div className="flex flex-wrap gap-2">
                    {optionsOf(field).map((o) => {
                      const list = Array.isArray(value) ? value : [];
                      const on = list.includes(o);
                      return (
                        <Button
                          key={o}
                          type="button"
                          size="sm"
                          variant={on ? "default" : "outline"}
                          onClick={() => set(field.key, on ? list.filter((v) => v !== o) : [...list, o])}
                        >
                          {o}
                        </Button>
                      );
                    })}
                  </div>
                ) : field.type === "boolean" ? (
                  <div className="flex gap-2">
                    {[true, false].map((b) => (
                      <Button
                        key={String(b)}
                        type="button"
                        size="sm"
                        variant={value === b ? "default" : "outline"}
                        onClick={() => set(field.key, b)}
                      >
                        {b ? "Yes" : "No"}
                      </Button>
                    ))}
                  </div>
                ) : (
                  <Input
                    id={`bk-${field.key}`}
                    // date and number get the native control; anything unrecognised falls back to text.
                    type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"}
                    value={typeof value === "string" || typeof value === "number" ? String(value) : ""}
                    onChange={(e) =>
                      set(field.key, field.type === "number" ? Number(e.target.value) : e.target.value)
                    }
                  />
                )}

                {showError && <p className="text-xs text-destructive">{field.label} is required</p>}
              </div>
            );
          })}

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
