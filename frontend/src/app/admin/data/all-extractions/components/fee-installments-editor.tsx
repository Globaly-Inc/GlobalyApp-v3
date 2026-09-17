"use client";

import type { Dispatch, SetStateAction } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/combobox";
import { FieldError } from "@/components/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { emptyFeeInstallment, sumFeeInstallments, sumFeeLines } from "../utils";
import type { FeeFormInstallment, FeeLine } from "../types";

/** One audience's installment table. Rendered once normally, and twice when a fee is being
 *  entered for domestic and international students in the same save. */
export function FeeInstallmentsEditor({
  heading,
  installments,
  setInstallments,
  currency,
  feeTypes,
  error,
  onDirty,
}: Readonly<{
  /** Omitted for a single-audience fee, where the block needs no disambiguating label. */
  heading?: string;
  installments: FeeFormInstallment[];
  setInstallments: Dispatch<SetStateAction<FeeFormInstallment[]>>;
  currency: string;
  feeTypes: { value: string; label: string }[];
  error?: string;
  onDirty: () => void;
}>) {
  const patchInstallment = (index: number, patch: Partial<FeeFormInstallment>) => {
    onDirty();
    setInstallments((list) => list.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const patchLine = (index: number, lineIndex: number, patch: Partial<FeeLine>) => {
    patchInstallment(index, {
      lines: installments[index]!.lines.map((l, i) => (i === lineIndex ? { ...l, ...patch } : l)),
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
        {heading ?? "Installments"} <span className="text-destructive">*</span>
      </Label>
      <FieldError message={error} />

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
              {currency} {sumFeeLines(installment.lines)}
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
        onClick={() => setInstallments((list) => [...list, emptyFeeInstallment(list.length)])}
      >
        <Plus className="h-4 w-4" />
        Add New Installment
      </Button>

      <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2.5">
        <span className="text-sm text-muted-foreground">{heading ? `Total — ${heading}` : "Total Fees"}</span>
        <span className="font-semibold">{currency} {sumFeeInstallments(installments)}</span>
      </div>
    </div>
  );
}
