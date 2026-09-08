"use client";

import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/combobox";
import { Input } from "@/components/ui/input";
import type { CourseFee, FeeInstallment } from "../apis/types";

export type Line = { fee_type: string; amount: string; intl_amount: string };
export type Installment = { label: string; lines: Line[] };

export const emptyLine = (): Line => ({ fee_type: "", amount: "", intl_amount: "" });

export const emptyInstallment = (index: number): Installment => ({
  label: `Semester ${index + 1}`,
  lines: [emptyLine()],
});

// An extracted fee is stored as a total, sometimes with a {label, amount} split and no fee-type
// lines. Seeding those from the fee itself is what keeps the form from opening on an empty
// installment worth 0 — which, once saved, overwrites the real amount with zero.
const PERIOD_INSTALLMENT_LABEL: Record<string, string> = {
  "Per Year": "Year 1",
  "Per Semester": "Semester 1",
  "Per Trimester": "Trimester 1",
  "Per Term": "Term 1",
  "Per Week": "Week 1",
  "Per Unit": "Per Credit",
  Total: "Full Payment",
};

export const toInstallments = (fee?: CourseFee): Installment[] => {
  if (fee?.installments?.length) {
    return fee.installments.map((i) => ({
      label: i.label,
      lines: i.lines?.length
        ? i.lines.map((l) => ({ fee_type: l.fee_type, amount: String(l.amount), intl_amount: "" }))
        : [{ fee_type: fee.name ?? "", amount: String(i.amount ?? ""), intl_amount: "" }],
    }));
  }
  if (fee?.total_amount != null) {
    return [{
      label: PERIOD_INSTALLMENT_LABEL[fee.period_type ?? ""] ?? "Installment 1",
      lines: [{ fee_type: fee.name ?? "", amount: String(fee.total_amount), intl_amount: "" }],
    }];
  }
  return [emptyInstallment(0)];
};

// A blank international cell means "charge the same as domestic", so a two-column form only
// has to be filled in where the prices actually differ.
export const lineAmount = (line: Line, intl: boolean) =>
  Number(intl ? line.intl_amount.trim() || line.amount : line.amount) || 0;

export const sumLines = (lines: Line[], intl = false) =>
  lines.reduce((total, l) => total + lineAmount(l, intl), 0);

/** Installments → the wire shape, reading either the domestic or the international column. */
export const buildInstallments = (list: Installment[], intl: boolean): FeeInstallment[] =>
  list
    .map((i) => {
      const lines = i.lines
        .filter((l) => l.fee_type.trim() && Boolean(l.amount.trim()))
        .map((l) => ({ fee_type: l.fee_type.trim(), amount: lineAmount(l, intl) }));
      return {
        label: i.label.trim() || "Installment",
        amount: lines.reduce((sum, l) => sum + l.amount, 0),
        lines,
      };
    })
    .filter((i) => i.lines.length > 0);

/** True once any international cell holds a price different from its domestic one. */
export const hasSeparateIntlPrices = (list: Installment[]) =>
  list.some((i) =>
    i.lines.some((l) => l.intl_amount.trim() && Number(l.intl_amount) !== Number(l.amount)),
  );

export function FeeInstallments({
  installments,
  currency,
  feeTypes,
  split,
  onChange,
}: Readonly<{
  installments: Installment[];
  currency: string;
  feeTypes: { value: string; label: string }[];
  /** Render a second price column for international students. */
  split: boolean;
  onChange: (next: Installment[]) => void;
}>) {
  const patchInstallment = (index: number, patch: Partial<Installment>) =>
    onChange(installments.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  const patchLine = (index: number, lineIndex: number, patch: Partial<Line>) =>
    patchInstallment(index, {
      lines: installments[index]!.lines.map((l, i) => (i === lineIndex ? { ...l, ...patch } : l)),
    });

  return (
    <>
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
              {split && ` / ${sumLines(installment.lines, true)}`}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 cursor-pointer text-destructive hover:text-destructive"
              title="Remove installment"
              disabled={installments.length === 1}
              onClick={() => onChange(installments.filter((_, i) => i !== index))}
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
                placeholder={split ? "Domestic" : "0"}
                title={split ? "Domestic amount" : undefined}
                className="h-10 w-28"
              />
              {split && (
                <Input
                  value={line.intl_amount}
                  onChange={(e) => patchLine(index, lineIndex, { intl_amount: e.target.value })}
                  inputMode="decimal"
                  placeholder="International"
                  title="International amount — leave blank to charge the same as domestic"
                  className="h-10 w-32"
                />
              )}
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
            onClick={() => patchInstallment(index, { lines: [...installment.lines, emptyLine()] })}
          >
            <Plus className="h-3 w-3" />
            Add Fee Type
          </Button>
        </div>
      ))}

      <Button
        variant="outline"
        className="w-full gap-1.5 cursor-pointer"
        onClick={() => onChange([...installments, emptyInstallment(installments.length)])}
      >
        <Plus className="h-4 w-4" />
        Add New Installment
      </Button>
    </>
  );
}
