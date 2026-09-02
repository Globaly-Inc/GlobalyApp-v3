"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { CURRENCY_STORAGE_KEY, DEFAULT_CURRENCY, RATES_PER_USD } from "../data/currency-rates";

const CurrencyContext = createContext<{ currency: string; setCurrency: (code: string) => void }>({
  currency: DEFAULT_CURRENCY,
  setCurrency: () => {},
});

/**
 * The currency every public price is shown in. Starts at USD on the server and on first paint —
 * reading localStorage during render would mismatch the server HTML — then swaps to the reader's
 * saved pick on mount.
 */
export function CurrencyProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [currency, setCurrency] = useState(DEFAULT_CURRENCY);

  useEffect(() => {
    const saved = localStorage.getItem(CURRENCY_STORAGE_KEY);
    if (saved && saved in RATES_PER_USD) setCurrency(saved);
  }, []);

  const choose = (code: string) => {
    setCurrency(code);
    localStorage.setItem(CURRENCY_STORAGE_KEY, code);
  };

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency: choose }}>{children}</CurrencyContext.Provider>
  );
}

export const useCurrency = () => useContext(CurrencyContext);
