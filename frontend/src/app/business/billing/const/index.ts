/** Stripe amounts are minor units (cents) — this is the one place billing formats them for display. */
export function formatPriceMinor(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amountMinor / 100);
}
