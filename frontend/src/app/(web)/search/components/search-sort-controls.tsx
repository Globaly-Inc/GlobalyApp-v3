"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { flagFromIso2 } from "@/lib/utils";
import { CURRENCY_OPTIONS, DEFAULT_FEE_PERIOD, FEE_PERIOD_OPTIONS, GENERIC_SORT_OPTIONS, SORT_OPTIONS } from "../types";

// Inline triggers: the results bar reads as a sentence ("Course Fee: Per Semester"), so the
// Combobox drops its bordered box and full width and keeps only the value plus its chevron.
const TRIGGER = "h-8 w-auto gap-1 border-0 px-1.5 text-sm font-medium shadow-none hover:bg-muted";

const CURRENCY_ITEMS: ComboboxOption[] = [
  { value: "", label: "Any" },
  ...CURRENCY_OPTIONS.map((code) => ({
    value: code,
    label: code,
    // ISO 4217 codes start with the ISO 3166 country code, so the flag needs no lookup table.
    icon: <span aria-hidden="true">{flagFromIso2(code.slice(0, 2))}</span>,
  })),
];

function Control({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/** `feeControls` is the courses tab only — every other tab shows Sort on its own. */
export function SearchSortControls({ feeControls = false }: Readonly<{ feeControls?: boolean }> = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value); else params.delete(key);
    // Changing how results are shown shouldn't drop the reader back onto page 1's scroll position.
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {feeControls && (
        <>
          <Control label="Course Fee:">
            <Combobox
              className={TRIGGER}
              contentClassName="w-44"
              options={FEE_PERIOD_OPTIONS}
              value={searchParams.get("fee_period") ?? DEFAULT_FEE_PERIOD}
              onChange={(v) => updateParam("fee_period", v === DEFAULT_FEE_PERIOD ? "" : v)}
              searchPlaceholder="Search periods..."
            />
          </Control>

          {/* Filters to courses actually quoted in this currency. Display currency is separate —
              the navbar picker converts what is shown; this narrows what comes back. */}
          <Control label="Currency:">
            <Combobox
              className={TRIGGER}
              contentClassName="w-44"
              options={CURRENCY_ITEMS}
              value={searchParams.get("currency") ?? ""}
              onChange={(v) => updateParam("currency", v)}
              searchPlaceholder="Search currencies..."
            />
          </Control>
        </>
      )}

      <Control label="Sort:">
        <Combobox
          className={TRIGGER}
          contentClassName="w-52"
          options={feeControls ? SORT_OPTIONS : GENERIC_SORT_OPTIONS}
          value={searchParams.get("sort") ?? "best_match"}
          onChange={(v) => updateParam("sort", v === "best_match" ? "" : v)}
          searchPlaceholder="Search sorting..."
        />
      </Control>
    </div>
  );
}
