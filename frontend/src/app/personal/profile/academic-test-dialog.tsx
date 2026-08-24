"use client";

import { useEffect } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Combobox } from "@/components/combobox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AcademicTest, AcademicTestInput } from "../apis/types";
import { useValidatedForm, sanitizeDecimalInput } from "./validation";
import { FieldError } from "./field-error";

const TEST_TYPES = ["SAT", "GMAT", "ACT", "GRE", "LSAT"];
const TEST_TYPE_OPTIONS = TEST_TYPES.map((t) => ({ value: t, label: t }));

const SUB_SCORE_FIELDS: Record<string, string[]> = {
  SAT: ["Math", "Reading & Writing"],
  GMAT: ["Quantitative", "Verbal", "Integrated Reasoning", "Analytical Writing"],
  ACT: ["English", "Math", "Reading", "Science"],
  GRE: ["Verbal", "Quantitative", "Analytical Writing"],
  LSAT: [],
};

const schema: z.ZodType<AcademicTestInput> = z
  .object({
    test_status: z.string(),
    test_type: z.string().min(1, "Required"),
    overall_score: z.string().refine((v) => v === "" || Number.isFinite(Number(v)), "Must be a number"),
    test_date: z.string(),
    sub_scores: z.record(z.string(), z.string().refine((v) => v === "" || Number.isFinite(Number(v)), "Must be a number")),
    sort_order: z.number(),
  })
  .refine((v) => v.test_status !== "completed" || v.overall_score !== "", { message: "Required", path: ["overall_score"] })
  .refine((v) => v.test_status !== "completed" || v.test_date !== "", { message: "Required", path: ["test_date"] });

function toInput(item: AcademicTest | null): AcademicTestInput {
  return {
    test_status: item?.test_status ?? "completed",
    test_type: item?.test_type ?? "",
    overall_score: item?.overall_score ?? "",
    test_date: item?.test_date ?? "",
    sub_scores: item?.sub_scores ?? {},
    sort_order: item?.sort_order ?? 0,
  };
}

export function AcademicTestDialog({
  open,
  onOpenChange,
  item,
  onSave,
  saving,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: AcademicTest | null;
  onSave: (data: AcademicTestInput) => Promise<boolean>;
  saving: boolean;
}>) {
  const { form, setForm, errors, reset, validate } = useValidatedForm(schema, () => toInput(item));

  useEffect(() => {
    if (open) reset(toInput(item));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item]);

  const handleSubmit = async () => {
    const data = validate();
    if (!data) return;
    if (!(await onSave(data))) return;
    onOpenChange(false);
  };

  const subFields = form.test_type ? (SUB_SCORE_FIELDS[form.test_type] ?? []) : [];
  const completed = form.test_status === "completed";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? "Edit Academic Test" : "Add Academic Test"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-col gap-2">
            <Label>Test Status</Label>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  className="h-4 w-4 accent-primary"
                  checked={completed}
                  onChange={() => setForm((f) => ({ ...f, test_status: "completed" }))}
                />
                <span>I have completed this test</span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  className="h-4 w-4 accent-primary"
                  checked={!completed}
                  onChange={() => setForm((f) => ({ ...f, test_status: "awaiting_results" }))}
                />
                <span>I&apos;m waiting for results</span>
              </label>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Test Type *</Label>
            <Combobox
              value={form.test_type ?? ""}
              onChange={(v) => setForm((f) => ({ ...f, test_type: v, sub_scores: {} }))}
              placeholder="Select test type"
              options={TEST_TYPE_OPTIONS}
              aria-invalid={!!errors.test_type}
            />
            <FieldError message={errors.test_type} />
          </div>
          {completed && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Overall Score *</Label>
                  <Input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={form.overall_score ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, overall_score: sanitizeDecimalInput(e.target.value) }))}
                    aria-invalid={!!errors.overall_score}
                  />
                  <FieldError message={errors.overall_score} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Test Date *</Label>
                  <DatePicker
                    value={form.test_date ?? ""}
                    onChange={(v) => setForm((f) => ({ ...f, test_date: v }))}
                    placeholder="Select test date"
                    toYear={new Date().getFullYear()}
                    disabled={(date) => date > new Date()}
                    aria-invalid={!!errors.test_date}
                  />
                  <FieldError message={errors.test_date} />
                </div>
              </div>
              {subFields.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  {subFields.map((label) => {
                    const key = label.toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "");
                    return (
                      <div className="space-y-2" key={key}>
                        <Label>{label}</Label>
                        <Input
                          type="number"
                          step="any"
                          inputMode="decimal"
                          value={form.sub_scores?.[key] ?? ""}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, sub_scores: { ...f.sub_scores, [key]: sanitizeDecimalInput(e.target.value) } }))
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
