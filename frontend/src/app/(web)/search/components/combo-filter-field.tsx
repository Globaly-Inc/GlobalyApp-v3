"use client";

import { useState } from "react";
import { Combobox, type ComboboxOption } from "@/components/combobox";

export function ComboFilterField({
  name, value, options, anyLabel = "Any",
  // Plain strings where value and label are the same (facet lists), {value,label} where they differ
  // (duration buckets send "53-104" but read "1 – 2 years").
}: Readonly<{ name: string; value?: string; options: readonly (string | ComboboxOption)[]; anyLabel?: string }>) {
  const [selected, setSelected] = useState(value ?? "");
  const comboOptions: ComboboxOption[] = [
    { value: "", label: anyLabel },
    ...options.map((o) => (typeof o === "string" ? { value: o, label: o } : o)),
  ];

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={name} value={selected} />
      <Combobox
        value={selected}
        onChange={setSelected}
        options={comboOptions}
        placeholder={anyLabel}
        searchPlaceholder="Search..."
      />
    </div>
  );
}
