"use client";

import { displayMoney, normalizeCurrency, toAmount } from "../data/currency-rates";
import { useCurrency } from "./currency-context";

/**
 * Every public price goes through here: one figure, or a low–high range when `to` is given, shown
 * in the currency picked in the navbar. Renders nothing when there is no amount, so callers can
 * drop it in place of their own null checks.
 */
export function Money({
  amount,
  to,
  currency,
  className,
}: Readonly<{
  amount: number | string | null | undefined;
  to?: number | string | null;
  currency?: string | null;
  className?: string;
}>) {
  const { currency: target } = useCurrency();
  const shown = displayMoney(toAmount(amount), toAmount(to), normalizeCurrency(currency), target);
  if (!shown) return null;
  return (
    <span className={className} title={shown.title}>
      {shown.text}
    </span>
  );
}

/** For the handful of spots that need the figure as a string (table cells, aria labels, props). */
export function useMoneyText() {
  const { currency: target } = useCurrency();
  return (amount: number | string | null | undefined, currency?: string | null, to?: number | string | null) =>
    displayMoney(toAmount(amount), toAmount(to), normalizeCurrency(currency), target)?.text ?? null;
}
