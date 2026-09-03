export { useValidatedForm } from "@/lib/use-validated-form";


export function toMonthInput(value: string, sep: "/" | "-" = "/"): string {
  const m = value.match(sep === "/" ? /^(\d{2})\/(\d{4})$/ : /^(\d{2})-(\d{4})$/);
  return m ? `${m[2]}-${m[1]}` : "";
}

export function fromMonthInput(value: string, sep: "/" | "-" = "/"): string {
  const m = value.match(/^(\d{4})-(\d{2})$/);
  return m ? `${m[2]}${sep}${m[1]}` : "";
}

export function sanitizeDecimalInput(value: string): string {
  const cleaned = value.replace(/[^0-9.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot === -1) return cleaned;
  return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, "");
}
