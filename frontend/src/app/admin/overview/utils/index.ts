export function formatStatValue(value: number | null | undefined): string {
  return typeof value === "number" ? value.toLocaleString() : "—";
}
