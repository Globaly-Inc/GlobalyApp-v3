"use client";

import { z } from "zod";
import { useEffect, useState } from "react";
import { DollarSign, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/combobox";
import { FieldError } from "@/components/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { categoriesApi } from "@/app/admin/platform/categories/apis";
import { CURRENCY_OPTIONS, PERIOD_TYPE_OPTIONS, STUDENT_TYPE_OPTIONS } from "../const";
import type { CourseFee, CourseFeeParams, FeeInstallment } from "../apis/types";

type Line = { fee_type: string; amount: string };
type Installment = { label: string; lines: Line[] };

const emptyInstallment = (index: number): Installment => ({
  label: `Semester ${index + 1}`,
  lines: [{ fee_type: "", amount: "" }],
});

const toInstallments = (fee?: CourseFee): Installment[] =>
  fee?.installments?.length
    ? fee.installments.map((i) => ({
        label: i.label,
        lines: i.lines?.length
          ? i.lines.map((l) => ({ fee_type: l.fee_type, amount: String(l.amount) }))
          : [{ fee_type: "", amount: String(i.amount ?? "") }],
      }))
    : [emptyInstallment(0)];

const sumLines = (lines: Line[]) => lines.reduce((total, l) => total + (Number(l.amount) || 0), 0);

const feeSchema = z.object({
  studentType: z.string().min(1, "Please select who the fee applies to"),
  periodType: z.string().trim().min(1, "Period type is required"),
  currency: z.string().trim().min(1, "Currency is required"),
  name: z.string().trim().transform((v) => v || null),
  installments: z.array(
    z.object({
      label: z.string(),
      lines: z.array(
        z.object({
          fee_type: z.string(),
          amount: z.string(),
        })
      ),
    })
  ).refine((insts) => {
    let totalLinesCount = 0;
    let missingType = false;
    let missingAmount = false;
    insts.forEach((inst) => {
      inst.lines.forEach((line) => {
        const hasType = Boolean(line.fee_type.trim());
        const amt = Number(line.amount);
        const hasAmount = Boolean(line.amount.trim()) && !isNaN(amt) && amt > 0;
        if (hasType || hasAmount) {
          totalLinesCount++;
          if (!hasType) missingType = true;
          if (!hasAmount) missingAmount = true;
        }
      });
    });
    return totalLinesCount > 0 && !missingType && !missingAmount;
  }, {
    message: "At least one valid fee line with a fee type and amount (> 0) is required",
  }),
});

export function FeeForm({
  fee,
  saving,
  onCancel,
  onSave,
}: Readonly<{
  fee?: CourseFee;
  saving: boolean;
  onCancel: () => void;
  onSave: (values: CourseFeeParams) => void;
}>) {
  const [studentType, setStudentType] = useState(fee?.student_type ?? "both");
  const [periodType, setPeriodType] = useState(fee?.period_type ?? "Per Year");
  const [currency, setCurrency] = useState(fee?.currency ?? "AUD");
  const [name, setName] = useState(fee?.name ?? "");
  const [installments, setInstallments] = useState<Installment[]>(() => toInstallments(fee));
  const [saveForReuse, setSaveForReuse] = useState(fee?.save_for_reuse ?? false);
  const [feeTypes, setFeeTypes] = useState<{ value: string; label: string }[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    categoriesApi.getFeeTypes({ limit: 100 })
      .then((res) => setFeeTypes(res.data.map((f) => ({ value: f.name, label: f.name }))))
      .catch(() => setFeeTypes([]));
  }, []);

  const total = installments.reduce((sum, i) => sum + sumLines(i.lines), 0);

  const clearError = (key: string) => {
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: "" }));
  };

  const patchInstallment = (index: number, patch: Partial<Installment>) => {
    clearError("installments");
    setInstallments((list) => list.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const patchLine = (index: number, lineIndex: number, patch: Partial<Line>) => {
    clearError("installments");
    patchInstallment(index, {
      lines: installments[index]!.lines.map((l, i) => (i === lineIndex ? { ...l, ...patch } : l)),
    });
  };

  const submit = () => {
    const result = feeSchema.safeParse({ studentType, periodType, currency, name, installments });
    if (!result.success) {
      const errs: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const key = String(issue.path[0]);
        if (!errs[key]) errs[key] = issue.message;
      }
      setErrors(errs);
      return;
    }

    setErrors({});
    const d = result.data;
    const payload: FeeInstallment[] = d.installments.map((i) => ({
      label: i.label.trim() || "Installment",
      amount: sumLines(i.lines),
      lines: i.lines
        .filter((l) => l.fee_type.trim() && Boolean(l.amount.trim()))
        .map((l) => ({ fee_type: l.fee_type.trim(), amount: Number(l.amount) || 0 })),
    }));

    onSave({
      name: d.name,
      student_type: d.studentType,
      period_type: d.periodType,
      currency: d.currency,
      total_amount: total,
      installments: payload,
      save_for_reuse: saveForReuse,
    });
  };

  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <DollarSign className="h-4 w-4 text-primary" />
          {fee ? "Edit Course Fee" : "Add Course Fee"}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Fee structure <span className="text-destructive">*</span>
          </Label>
          <div className="flex flex-wrap items-center gap-6">
            {STUDENT_TYPE_OPTIONS.map((option) => (
              <label key={option.value} className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={studentType === option.value}
                  onCheckedChange={() => {
                    setStudentType(option.value);
                    clearError("studentType");
                  }}
                />
                {option.label}
              </label>
            ))}
          </div>
          <FieldError message={errors.studentType} />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fee-period">
              Period Type <span className="text-destructive">*</span>
            </Label>
            <Combobox
              id="fee-period"
              options={PERIOD_TYPE_OPTIONS}
              value={periodType}
              onChange={(v) => {
                setPeriodType(v);
                clearError("periodType");
              }}
              placeholder="Select period"
              aria-invalid={Boolean(errors.periodType)}
              creatable
            />
            <FieldError message={errors.periodType} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="fee-currency">
              Currency <span className="text-destructive">*</span>
            </Label>
            <Combobox
              id="fee-currency"
              options={CURRENCY_OPTIONS}
              value={currency}
              onChange={(v) => {
                setCurrency(v);
                clearError("currency");
              }}
              placeholder="Select currency"
              aria-invalid={Boolean(errors.currency)}
              creatable
            />
            <FieldError message={errors.currency} />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Installments <span className="text-destructive">*</span>
          </Label>
          <FieldError message={errors.installments} />

          {installments.map((installment, index) => (
            <div key={index} className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <Input
                  value={installment.label}
                  onChange={(e) => patchInstallment(index, { label: e.target.value })}
                  placeholder="Installment name"
                  className="flex-1"
                />
                <span className="shrink-0 text-sm text-muted-foreground">
                  {currency} {sumLines(installment.lines)}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 cursor-pointer text-destructive hover:text-destructive"
                  title="Remove installment"
                  disabled={installments.length === 1}
                  onClick={() => setInstallments((list) => list.filter((_, i) => i !== index))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              {installment.lines.map((line, lineIndex) => (
                <div key={lineIndex} className="flex items-center gap-2 pl-3">
                  <Combobox
                    options={feeTypes}
                    value={line.fee_type}
                    onChange={(v) => patchLine(index, lineIndex, { fee_type: v })}
                    placeholder="Fee type"
                    searchPlaceholder="Search or type a fee type…"
                    className="h-10 flex-1 text-xs"
                    creatable
                  />
                  <span className="shrink-0 text-xs text-muted-foreground">{currency}</span>
                  <Input
                    value={line.amount}
                    onChange={(e) => patchLine(index, lineIndex, { amount: e.target.value })}
                    inputMode="decimal"
                    placeholder="0"
                    className="h-10 w-28"
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 cursor-pointer"
                    title="Remove fee type"
                    disabled={installment.lines.length === 1}
                    onClick={() =>
                      patchInstallment(index, { lines: installment.lines.filter((_, i) => i !== lineIndex) })
                    }
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}

              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-fit gap-1.5 text-xs text-primary hover:text-primary cursor-pointer"
                onClick={() => patchInstallment(index, { lines: [...installment.lines, { fee_type: "", amount: "" }] })}
              >
                <Plus className="h-3 w-3" />
                Add Fee Type
              </Button>
            </div>
          ))}

          <Button
            variant="outline"
            className="w-full gap-1.5 cursor-pointer"
            onClick={() => setInstallments((list) => [...list, emptyInstallment(list.length)])}
          >
            <Plus className="h-4 w-4" />
            Add New Installment
          </Button>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2.5">
          <span className="text-sm text-muted-foreground">Total Fees</span>
          <span className="font-semibold">{currency} {total}</span>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
          <span className="text-sm">Save this for future uses</span>
          <Switch checked={saveForReuse} onCheckedChange={setSaveForReuse} />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" className="cursor-pointer" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button className="gap-1.5 cursor-pointer" onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save Fee
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
