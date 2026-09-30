"use client";

import { useState } from "react";
import { ArrowRight, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { cn } from "@/lib/utils";
import { FIELD_BY_KEY, SYSTEM_FIELDS, type InstitutionSource } from "../const";
import type { Defaults, Mapping } from "../types";

const DO_NOT_MAP = "__none__";

/** Fields still free for this picker: not used by another header, and not set as a default. */
function fieldOptions(taken: Set<string>, current: string, source: InstitutionSource, withNone: boolean): ComboboxOption[] {
  const options = SYSTEM_FIELDS
    // The tab name already IS the institution name in "sheet" mode.
    .filter((f) => (f.key === current || !taken.has(f.key)) && !(source === "sheet" && f.key === "institution_name"))
    .map((f) => ({ value: f.key, label: `${f.label}${f.required ? " *" : ""}`, description: f.group }));
  return withNone ? [{ value: DO_NOT_MAP, label: "Do not map this field", description: "Ignored on import" }, ...options] : options;
}

export function MapStep({
  headers, mapping, onMappingChange, defaults, onDefaultsChange, source,
}: Readonly<{
  headers: string[];
  mapping: Mapping;
  onMappingChange: (m: Mapping) => void;
  defaults: Defaults;
  onDefaultsChange: (d: Defaults) => void;
  source: InstitutionSource;
}>) {
  const [tab, setTab] = useState<"mapping" | "defaults">("mapping");
  const mappedKeys = new Set(Object.values(mapping).filter(Boolean));
  const defaultKeys = new Set(Object.keys(defaults));
  const mappedCount = headers.filter((h) => mapping[h]).length;

  const setDefault = (oldKey: string, key: string, value: string) => {
    const next = { ...defaults };
    if (oldKey !== key) delete next[oldKey];
    next[key] = value;
    onDefaultsChange(next);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-1 border-b">
        {(["mapping", "defaults"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "-mb-px cursor-pointer border-b-2 px-3 py-2 text-sm font-medium",
              tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground",
            )}
          >
            {t === "mapping" ? `Mapping Fields (${mappedCount}/${headers.length})` : `Assign Default Value (${defaultKeys.size})`}
          </button>
        ))}
      </div>

      {tab === "mapping" ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            Columns were matched automatically by name — check each one. Fields marked * are required.
          </p>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 gap-y-2 text-xs font-semibold text-muted-foreground">
            <span>Uploaded file field</span><span /><span>System field</span>
          </div>
          <div className="flex flex-col gap-2 pr-1">
            {headers.map((h) => {
              const value = mapping[h] || "";
              return (
                <div key={h} className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <div className="truncate rounded-md border bg-muted/40 px-3 py-2 text-sm" title={h}>{h}</div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <Combobox
                    options={fieldOptions(new Set([...mappedKeys, ...defaultKeys]), value, source, true)}
                    value={value || DO_NOT_MAP}
                    onChange={(v) => onMappingChange({ ...mapping, [h]: v === DO_NOT_MAP ? "" : v })}
                    placeholder="Please select the field"
                    searchPlaceholder="Search fields…"
                    className={cn("h-10 w-full", !value && "text-muted-foreground")}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            A value applied to every row that has none — e.g. Currency = USD or Country = United States when the sheet
            has no such column. A field used here can&apos;t also be mapped.
          </p>
          {Object.entries(defaults).map(([key, value]) => (
            <div key={key} className="grid grid-cols-[1fr_1fr_auto] items-center gap-3">
              <Combobox
                options={fieldOptions(new Set([...mappedKeys, ...defaultKeys]), key, source, false)}
                value={key}
                onChange={(k) => setDefault(key, k, value)}
                className="h-10 w-full"
              />
              <Input
                className="h-10"
                value={value}
                placeholder={FIELD_BY_KEY.get(key)?.label ?? "Value"}
                onChange={(e) => setDefault(key, key, e.target.value)}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                title="Remove"
                onClick={() => { const next = { ...defaults }; delete next[key]; onDefaultsChange(next); }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="w-fit gap-1.5"
            onClick={() => {
              const free = SYSTEM_FIELDS.find((f) => !mappedKeys.has(f.key) && !defaultKeys.has(f.key) && !(source === "sheet" && f.key === "institution_name"));
              if (free) onDefaultsChange({ ...defaults, [free.key]: "" });
            }}
          >
            <Plus className="h-3.5 w-3.5" /> Add default value
          </Button>
        </div>
      )}
    </div>
  );
}
