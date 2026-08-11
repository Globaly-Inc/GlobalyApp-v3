export { useValidatedForm } from "@/lib/use-validated-form";


export function toMonthInput(value: string, sep: "/" | "-" = "/"): string {
  const m = value.match(sep === "/" ? /^(\d{2})\/(\d{4})$/ : /^(\d{2})-(\d{4})$/);
  return m ? `${m[2]}-${m[1]}` : "";
}

export function fromMonthInput(value: string, sep: "/" | "-" = "/"): string {
  const m = value.match(/^(\d{4})-(\d{2})$/);
  return m ? `${m[2]}${sep}${m[1]}` : "";
}
