"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CURRENCY_OPTIONS, SORT_OPTIONS } from "../types";

const selectClass = "h-8 rounded-md border border-input bg-background px-2 text-sm";

export function SearchSortControls() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value); else params.delete(key);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex items-center gap-3 text-sm text-muted-foreground">
      <label className="flex items-center gap-1.5">
        <span>Fees in</span>
        <select
          defaultValue={searchParams.get("currency") ?? ""}
          onChange={(e) => updateParam("currency", e.target.value)}
          className={selectClass}
        >
          <option value="">All Currencies</option>
          {CURRENCY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-1.5">
        Sort by
        <select
          defaultValue={searchParams.get("sort") ?? "best_match"}
          onChange={(e) => updateParam("sort", e.target.value)}
          className={selectClass}
        >
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
    </div>
  );
}
