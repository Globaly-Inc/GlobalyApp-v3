"use client";

import { useState } from "react";
import { ArrowRight, ChevronDown, Plus, Trash2 } from "lucide-react";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCurrencyOptions } from "../../all-extractions/use-currency-options";
import { cn } from "@/lib/utils";
import { SECTION_BY_KEY, TEMPLATE_SECTIONS } from "../const/template-sections";
import type { Sheet, TabMapping } from "../types";
import { autoMapSection } from "../utils";

const NONE = "__none__";
const SECTION_OPTIONS: ComboboxOption[] = [
  { value: NONE, label: "Don't import this tab" },
  ...TEMPLATE_SECTIONS.map((s) => ({ value: s.key, label: s.tab })),
];

/** Tab-per-section workbooks: each tab → one of our sections, each of its columns → that section's
 * fields. Our own template arrives fully matched; any other layout is matched by name and fixed here. */
export function TemplateMapStep({
  sheets, selected, tabs, onTabsChange,
}: Readonly<{
  sheets: Sheet[];
  selected: string[];
  tabs: Record<string, TabMapping>;
  onTabsChange: (t: Record<string, TabMapping>) => void;
}>) {
  const set = (name: string, m: TabMapping) => onTabsChange({ ...tabs, [name]: m });
  const currencyOptions = useCurrencyOptions();
  // Every tab starts open, so each tab's fields are visible without expanding them one by one.
  const [open, setOpen] = useState(() => new Set(selected));
  const toggle = (name: string) =>
    setOpen((o) => { const n = new Set(o); if (n.has(name)) n.delete(name); else n.add(name); return n; });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Tell us what each tab holds, then check its columns. Everything was matched by name — fields marked * are
        required.
      </p>
      {sheets.filter((s) => selected.includes(s.name)).map((s) => {
        const m = tabs[s.name] ?? { section: "", columns: {} };
        const section = m.section ? SECTION_BY_KEY.get(m.section) : undefined;
        const defaults = m.defaults ?? {};
        const used = new Set([...Object.values(m.columns).filter(Boolean), ...Object.keys(defaults)]);
        const filled = new Set([...used].filter((k) => k in defaults ? Boolean(defaults[k]?.trim()) : true));
        const missing = section?.fields.filter((f) => f.required && !filled.has(f.key)) ?? [];
        const setDefaults = (d: Record<string, string>) => set(s.name, { ...m, defaults: d });
        const freeFields = (current: string) => section?.fields.filter((f) => f.key === current || !used.has(f.key)) ?? [];
        const isOpen = open.has(s.name);
        const mappedCount = s.headers.filter((h) => m.columns[h]).length;
        return (
          <div key={s.name} className="flex flex-col gap-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => toggle(s.name)}
                aria-expanded={isOpen}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
              >
                <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", !isOpen && "-rotate-90")} />
                <span className="truncate font-medium" title={s.name}>{s.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  · {s.rows.length} rows{section ? ` · ${mappedCount} of ${s.headers.length} columns mapped` : " · not imported"}
                </span>
              </button>
              <span className="text-sm text-muted-foreground">This tab is</span>
              <Combobox
                options={SECTION_OPTIONS}
                value={m.section || NONE}
                onChange={(v) => {
                  const key = v === NONE ? "" : (v as TabMapping["section"]);
                  set(s.name, { section: key, columns: key ? autoMapSection(key, s.headers) : {} });
                  if (key) setOpen((o) => new Set(o).add(s.name));
                }}
                className="h-10 w-56"
              />
            </div>
            {missing.length > 0 && (
              <p className="text-xs text-destructive">Map a column to {missing.map((f) => f.label).join(", ")}</p>
            )}
            {section && isOpen && (
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-[1fr_auto_1fr] gap-2 text-xs font-semibold text-muted-foreground">
                  <span>Your column</span><span className="w-4" /><span>Our field</span>
                </div>
                {s.headers.map((h) => {
                  const value = m.columns[h] || "";
                  const options: ComboboxOption[] = [
                    { value: NONE, label: "Don't import this column" },
                    ...section.fields
                      .filter((f) => f.key === value || !used.has(f.key))
                      .map((f) => ({ value: f.key, label: `${f.label}${f.required ? " *" : ""}`, description: f.group })),
                    // Any other section's field too, stored as "section:field" (see applyTabMapping).
                    ...TEMPLATE_SECTIONS.filter((o) => o.key !== section.key).flatMap((o) => o.fields
                      .map((f) => ({ f, v: `${o.key}:${f.key}` }))
                      .filter(({ v }) => v === value || !used.has(v))
                      .map(({ f, v }) => ({ value: v, label: f.label, description: f.group ? `${o.tab} · ${f.group}` : o.tab }))),
                  ];
                  return (
                    <div key={h} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                      <div className="truncate rounded-md border bg-muted/40 px-3 py-2 text-sm" title={h}>{h}</div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      <Combobox
                        options={options}
                        value={value || NONE}
                        onChange={(v) => set(s.name, { ...m, columns: { ...m.columns, [h]: v === NONE ? "" : v } })}
                        searchPlaceholder="Search fields…"
                        className={cn("h-10 w-full", !value && "text-muted-foreground")}
                      />
                    </div>
                  );
                })}
                <div className="mt-2 flex flex-col gap-2 border-t pt-3">
                  <span className="text-xs font-semibold text-muted-foreground">
                    Default values — applied to every row of this tab that has none (e.g. Currency = USD)
                  </span>
                  {Object.entries(defaults).map(([key, val]) => (
                    <div key={key} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                      <Combobox
                        options={freeFields(key).map((f) => ({ value: f.key, label: f.label, description: f.group }))}
                        value={key}
                        // A value typed for one field rarely fits another (and a currency picker can't show free text), so it resets.
                        onChange={(k) => { const d = { ...defaults }; delete d[key]; setDefaults({ ...d, [k]: "" }); }}
                        searchPlaceholder="Search fields…"
                        className="h-10 w-full"
                      />
                      {key === "currency" || key === "fee_currency" ? (
                        <Combobox
                          options={currencyOptions}
                          value={val}
                          onChange={(v) => setDefaults({ ...defaults, [key]: v })}
                          placeholder="Select currency"
                          className="h-10 w-full"
                        />
                      ) : (
                        <Input
                          className="h-10"
                          value={val}
                          placeholder={section.fields.find((f) => f.key === key)?.label ?? "Value"}
                          onChange={(e) => setDefaults({ ...defaults, [key]: e.target.value })}
                        />
                      )}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Remove"
                        onClick={() => { const d = { ...defaults }; delete d[key]; setDefaults(d); }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  {freeFields("").length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-fit gap-1.5"
                      onClick={() => setDefaults({ ...defaults, [freeFields("")[0]!.key]: "" })}
                    >
                      <Plus className="h-3.5 w-3.5" /> Add default value
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
