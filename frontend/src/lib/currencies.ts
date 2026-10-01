// Currency picker options shared by the profile's Default Currency card and the scholarship form.
// Not exhaustive — the API accepts any ISO code; withCurrentCurrency keeps a saved code that isn't
// listed here selectable instead of showing a blank picker.
export const CURRENCY_OPTIONS = [
  { value: "USD", label: "US Dollar (USD)" },
  { value: "GBP", label: "British Pound (GBP)" },
  { value: "EUR", label: "Euro (EUR)" },
  { value: "AUD", label: "Australian Dollar (AUD)" },
  { value: "CAD", label: "Canadian Dollar (CAD)" },
  { value: "NZD", label: "New Zealand Dollar (NZD)" },
  { value: "INR", label: "Indian Rupee (INR)" },
  { value: "NPR", label: "Nepalese Rupee (NPR)" },
  { value: "SGD", label: "Singapore Dollar (SGD)" },
  { value: "AED", label: "UAE Dirham (AED)" },
  { value: "JPY", label: "Japanese Yen (JPY)" },
  { value: "CNY", label: "Chinese Yuan (CNY)" },
];

export function withCurrentCurrency(current: string | null | undefined) {
  if (!current || CURRENCY_OPTIONS.some((o) => o.value === current)) return CURRENCY_OPTIONS;
  return [...CURRENCY_OPTIONS, { value: current, label: current }];
}
