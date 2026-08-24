"use client";

import { useState } from "react";
import { Combobox, type ComboboxOption } from "@/components/combobox";

export function ComboFilterField({
  name, value, options, anyLabel = "Any",
}: Readonly<{ name: string; value?: string; options: string[]; anyLabel?: string }>) {
  const [selected, setSelected] = useState(value ?? "");
  const comboOptions: ComboboxOption[] = [
    { value: "", label: anyLabel },
    ...options.map((o) => ({ value: o, label: o })),
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
