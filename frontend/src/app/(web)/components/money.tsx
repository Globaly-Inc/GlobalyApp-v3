import { displayMoney, normalizeCurrency, toAmount } from "../data/currency-rates";

/**
 * Every public price goes through here: one figure, or a low–high range when `to` is given, in the
 * currency the row stored. Renders nothing when there is no amount, so callers can drop it in
 * place of their own null checks.
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
  const shown = displayMoney(toAmount(amount), toAmount(to), normalizeCurrency(currency));
  if (!shown) return null;
  return <span className={className}>{shown.text}</span>;
}
