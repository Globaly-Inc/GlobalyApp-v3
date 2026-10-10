"use client";

import { useState } from "react";
import { Copy, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { CountUp } from "@/components/count-up";
import { cn } from "@/lib/utils";
import type { ServiceFee } from "../../../apis/types";

type FeeInstallmentLine = { fee_type: string; amount: number };
type FeeInstallment = { label: string; lines: FeeInstallmentLine[] };
const installmentsOf = (fee: ServiceFee) => fee.installments as unknown as FeeInstallment[];
const installmentSum = (i: FeeInstallment) => i.lines.reduce((s, l) => s + l.amount, 0);

/** The fee's total: the stored total_amount, or the sum of its installment lines. */
export function feeTotal(fee: ServiceFee) {
  return Number(fee.total_amount) || installmentsOf(fee).reduce((sum, i) => sum + installmentSum(i), 0);
}

/** Exact saved amounts keep their decimals (AUD 100.50 stays 100.5, not 101). */
export const formatAmount = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 2 });

const STUDENT_CHIP: Record<ServiceFee["student_type"], [string, string]> = {
  both: ["All students", "bg-primary/10 text-primary"],
  domestic: ["Domestic", "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300"],
  international: ["International", "bg-violet-500/10 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300"],
};
// Segment/dot tone ramp, cycling per installment.
const TONES = ["bg-primary", "bg-primary/75", "bg-primary/50", "bg-primary/30"];
const tone = (j: number) => TONES[j % TONES.length];

export function FeeCard({
  fee, onEdit, onDuplicate, onDelete,
}: Readonly<{ fee: ServiceFee; onEdit: () => void; onDuplicate: () => void; onDelete: () => Promise<void> }>) {
  const [hot, setHot] = useState<number | null>(null);
  const installments = installmentsOf(fee);
  const n = installments.length;
  const total = feeTotal(fee);
  const [studentLabel, studentClass] = STUDENT_CHIP[fee.student_type] ?? STUDENT_CHIP.both;
  const money = (v: number) => `${fee.currency} ${formatAmount(v)}`;

  return (
    <article
      className="group/fee overflow-hidden rounded-xl border bg-card text-card-foreground transition-[border-color,box-shadow] duration-200 hover:border-primary/30 hover:shadow-[0_8px_24px_-12px_color-mix(in_oklab,var(--color-primary)_35%,transparent)]"
      onMouseLeave={() => setHot(null)}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3.5 px-4 pt-4 pb-3 sm:px-[18px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-sans text-[15px] font-bold tracking-normal">{fee.name || "Unnamed fee"}</h3>
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", studentClass)}>{studentLabel}</span>
            <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">{fee.period_type}</span>
          </div>
          <div className="mt-2.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="font-heading text-[28px] leading-none font-bold tracking-[-0.015em]">
              <small className="mr-1.5 align-[4px] font-mono text-xs font-semibold tracking-normal text-muted-foreground">{fee.currency}</small>
              <CountUp value={total} format={formatAmount} />
            </span>
            <span className="text-[12.5px] text-muted-foreground">
              <b className="text-foreground">{n}</b> installment{n === 1 ? "" : "s"}
              {n > 1 && <> · about <b className="text-foreground">{fee.currency} {Math.round(total / n).toLocaleString()}</b> each</>}
            </span>
          </div>
        </div>
        <div className="flex items-start gap-1 opacity-55 transition-opacity group-focus-within/fee:opacity-100 group-hover/fee:opacity-100">
          <Button variant="ghost" size="icon-sm" title="Duplicate fee" aria-label="Duplicate fee" onClick={onDuplicate}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon-sm" title="Edit fee" aria-label="Edit fee" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <ConfirmDeleteButton label="Delete fee" onConfirm={onDelete} />
        </div>
      </div>

      {n > 1 && (
        <div className="mx-4 flex h-2.5 gap-[3px] overflow-hidden rounded-full sm:mx-[18px]" aria-hidden="true">
          {installments.map((inst, j) => (
            <i
              key={`${inst.label}-${j}`}
              className={cn("animate-fill-x h-full origin-left transition-[filter,transform] duration-200", tone(j), hot === j && "scale-y-[1.35] brightness-115")}
              style={{ flex: installmentSum(inst) || 1, "--fill-delay": `${250 + j * 80}ms` } as React.CSSProperties}
              onMouseEnter={() => setHot(j)}
            />
          ))}
        </div>
      )}

      {n > 0 && (
        <ol className="relative mx-4 mt-3 mb-3.5 before:absolute before:top-3.5 before:bottom-3.5 before:left-[11px] before:w-0.5 before:bg-border sm:mx-[18px]">
          {installments.map((inst, j) => {
            const sum = installmentSum(inst);
            return (
              <li
                key={`${inst.label}-${j}`}
                className={cn("relative grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3 rounded-[10px] py-[7px] pr-2.5 transition-colors", hot === j && "bg-muted")}
                onMouseEnter={() => setHot(j)}
              >
                <span className={cn("relative z-10 grid size-6 place-items-center rounded-full font-mono text-[10.5px] font-semibold text-primary-foreground shadow-[0_0_0_3px_var(--color-card)]", tone(j), j % TONES.length >= 2 && "text-foreground")}>
                  {j + 1}
                </span>
                <div className="min-w-0">
                  <div className="text-[13.5px] font-semibold">{inst.label}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {inst.lines.map((l) => (inst.lines.length > 1 ? `${l.fee_type} · ${money(l.amount)}` : l.fee_type)).join(" · ")}
                  </div>
                </div>
                <span className="text-right font-mono text-[13px] font-semibold whitespace-nowrap tabular-nums">
                  {money(sum)}
                  <small className="block text-[11px] font-medium text-muted-foreground">{total > 0 ? Math.round((sum / total) * 100) : 0}% of total</small>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </article>
  );
}
