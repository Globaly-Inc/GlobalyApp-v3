"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { datePrecisionOf, type DatePrecision } from "../utils";

/**
 * A date the institution may have published to the day or only to the month, with the selector
 * that says which.
 *
 * The two native input types do all the work — `type="date"` emits "YYYY-MM-DD" and
 * `type="month"` emits "YYYY-MM", which is exactly what the column stores — so there is no picker
 * library here and no parsing.
 *
 * For the inline pencil edits on an existing intake, this same behaviour lives in EditableField's
 * `datePrecision` prop; this component is for the forms that aren't inline (Create Intake, and
 * each custom date row).
 */
export function PartialDateInput({
  id,
  value,
  onChange,
  disabled,
  className,
  "aria-invalid": ariaInvalid,
}: Readonly<{
  id?: string;
  /** "YYYY-MM-DD", "YYYY-MM", or "" */
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  className?: string;
  "aria-invalid"?: boolean;
}>) {
  // The value is the source of truth WHENEVER IT HAS ONE, so the selector can never describe a
  // value it doesn't match — and the input's type always matches its value, which matters because
  // a `type="date"` holding "2026-09" renders blank.
  //
  // But an empty field carries no precision, and deriving it from the value alone made the button
  // dead on exactly the row that needs it most: clicking Month on a blank field wrote "" back,
  // which still read as full_date, so the toggle sprang straight back. `chosen` is what an empty
  // field remembers until there is a value to read it from.
  const [chosen, setChosen] = useState<DatePrecision>(() => datePrecisionOf(value) ?? "full_date");
  const precision: DatePrecision = datePrecisionOf(value) ?? chosen;

  const switchTo = (next: DatePrecision) => {
    if (next === precision) return;
    setChosen(next);
    // Narrowing keeps the month; widening drops the value rather than inventing a day for it.
    onChange(next === "month" ? value.slice(0, 7) : "");
  };

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="inline-flex w-fit overflow-hidden rounded-md border border-border">
        {(["full_date", "month"] as const).map((p) => (
          <button
            key={p}
            type="button"
            disabled={disabled}
            onClick={() => switchTo(p)}
            className={cn(
              "cursor-pointer px-2 py-0.5 text-[11px] transition-colors",
              precision === p ? "bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            {p === "full_date" ? "Full date" : "Month"}
          </button>
        ))}
      </div>
      <Input
        id={id}
        type={precision === "month" ? "month" : "date"}
        value={value}
        disabled={disabled}
        aria-invalid={ariaInvalid}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/**
 * The month and year a list groups an intake by, read off the string.
 *
 * Never `new Date(value)`: "2026-09" parses as UTC midnight on the 1st, so `getMonth()` in any
 * timezone behind UTC returns August — an intake filed under the wrong month by a parsing detail.
 */
export function monthYearOf(value: string): { intake_month: number; intake_year: number } | null {
  const m = value.match(/^(\d{4})-(\d{2})/);
  return m ? { intake_year: Number(m[1]), intake_month: Number(m[2]) } : null;
}
