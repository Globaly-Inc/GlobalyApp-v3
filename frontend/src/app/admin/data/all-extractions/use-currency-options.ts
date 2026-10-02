"use client";

import { useEffect, useState } from "react";
import { geoApi } from "@/app/geo/apis";
import { CURRENCY_OPTIONS } from "./const";

/** Currency picker options from the countries table — CURRENCY_OPTIONS is only the offline
 * fallback. `current` is kept selectable when it isn't in the list, so editing a record saved with
 * an unlisted code doesn't blank its picker. */
export function useCurrencyOptions(current?: string | null) {
  const [options, setOptions] = useState(CURRENCY_OPTIONS);
  useEffect(() => {
    geoApi.getCountries()
      .then((countries) => {
        const byCode = new Map(
          countries
            .filter((c) => c.currency)
            .map((c) => [c.currency!, `${c.currency}${c.currencySymbol ? ` (${c.currencySymbol})` : ""}`]),
        );
        if (byCode.size === 0) return;
        setOptions([...byCode].sort(([a], [b]) => a.localeCompare(b)).map(([value, label]) => ({ value, label })));
      })
      .catch(() => setOptions(CURRENCY_OPTIONS));
  }, []);
  return current && !options.some((o) => o.value === current) ? [...options, { value: current, label: current }] : options;
}
