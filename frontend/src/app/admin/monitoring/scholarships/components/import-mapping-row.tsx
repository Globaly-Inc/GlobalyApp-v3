import { Combobox, type ComboboxOption } from "@/components/combobox";
import { Label } from "@/components/ui/label";
import type { ColumnMapping, ImportField } from "../utils";

export function ImportMappingRow({
  field,
  headers,
  mapping,
  onChange,
}: Readonly<{
  field: ImportField;
  headers: string[];
  mapping: ColumnMapping;
  onChange: (key: ImportField["key"], header: string) => void;
}>) {
  const options: ComboboxOption[] = [
    { value: "", label: "— None —" },
    ...headers.map((h) => ({ value: h, label: h })),
  ];

  return (
    <div className="flex items-center gap-3">
      <Label className="w-44 shrink-0 text-sm">
        {field.label}
        {field.required && <span className="text-destructive"> *</span>}
      </Label>
      <div className="flex-1">
        <Combobox
          options={options}
          value={mapping[field.key] ?? ""}
          onChange={(v) => onChange(field.key, v)}
          placeholder="— None —"
        />
      </div>
    </div>
  );
}
