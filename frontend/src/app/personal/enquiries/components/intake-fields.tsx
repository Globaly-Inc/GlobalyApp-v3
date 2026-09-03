"use client";

import { Label } from "@/components/ui/label";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { INTAKE_MONTHS, INTAKE_YEAR_RANGE } from "../const";

// Month is optional, so it needs a way back to "unset" — without this row the
// student can pick February and never undo it.
const MONTH_OPTIONS: ComboboxOption[] = [
  { value: "", label: "No preference" },
  ...INTAKE_MONTHS.map((m) => ({ value: m, label: m })),
];

/** Combobox, not Select, so these sit level with the institution and course fields above. */
export function IntakeFields({
  month,
  year,
  onMonthChange,
  onYearChange,
}: Readonly<{
  month: string;
  year: string;
  onMonthChange: (month: string) => void;
  onYearChange: (year: string) => void;
}>) {
  // Computed per render rather than at module load: a session left open across New
  // Year's Eve would otherwise keep offering last year.
  const yearOptions: ComboboxOption[] = Array.from({ length: INTAKE_YEAR_RANGE }, (_, i) => {
    const value = String(new Date().getFullYear() + i);
    return { value, label: value };
  });

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-2">
        <Label htmlFor="enquiry-intake">Preferred intake</Label>
        <Combobox
          id="enquiry-intake"
          options={MONTH_OPTIONS}
          value={month}
          onChange={onMonthChange}
          placeholder="Select month"
          searchPlaceholder="Search months..."
          emptyText="No month found."
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="enquiry-year">Preferred year</Label>
        <Combobox
          id="enquiry-year"
          options={yearOptions}
          value={year}
          onChange={onYearChange}
          placeholder="Select year"
          searchPlaceholder="Search years..."
          emptyText="No year found."
        />
      </div>
    </div>
  );
}
