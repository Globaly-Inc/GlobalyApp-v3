"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { InstitutionSource } from "../const";
import type { Sheet } from "../types";

const PREVIEW_ROWS = 5;

export function PreviewStep({
  sheets, fileName, selected, onSelectedChange, source, onSourceChange, template, onTemplateChange,
}: Readonly<{
  sheets: Sheet[];
  fileName: string;
  selected: string[];
  onSelectedChange: (names: string[]) => void;
  source: InstitutionSource;
  onSourceChange: (s: InstitutionSource) => void;
  /** Template workbook: names come from each tab's Institution Name column, so no choice to make. */
  template?: boolean;
  onTemplateChange?: (t: boolean) => void;
}>) {
  const [focused, setFocused] = useState(sheets[0]?.name ?? "");
  const sheet = sheets.find((s) => s.name === focused) ?? sheets[0];
  const allSelected = selected.length === sheets.length;
  const totalRows = sheets.filter((s) => selected.includes(s.name)).reduce((n, s) => n + s.rows.length, 0);

  const toggle = (name: string) =>
    onSelectedChange(selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name]);

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{fileName}</h2>
          <p className="text-sm text-muted-foreground">
            {sheets.length} tab{sheets.length === 1 ? "" : "s"} · {selected.length} selected · {totalRows} rows
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 text-sm">
          <Toggle
            label="Layout:"
            options={[["tabs", "A tab per section"], ["rows", "A tab per institution"]]}
            value={template ? "tabs" : "rows"}
            onChange={(v) => onTemplateChange?.(v === "tabs")}
          />
          {!template && (
            <Toggle
              label="Institution name from:"
              options={[["sheet", "Tab name"], ["column", "A column"]]}
              value={source}
              onChange={(v) => onSourceChange(v as InstitutionSource)}
            />
          )}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[300px_1fr]">
        <div className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto rounded-lg border p-2 md:max-h-none">
          <label className="flex cursor-pointer items-center gap-2 border-b px-2 pb-2 text-xs font-medium text-muted-foreground">
            <Checkbox checked={allSelected} onCheckedChange={() => onSelectedChange(allSelected ? [] : sheets.map((s) => s.name))} />
            Select all tabs
          </label>
          {sheets.map((s) => (
            <div
              key={s.name}
              className={cn("flex items-center gap-2 rounded-md px-2 py-1.5", focused === s.name && "bg-primary/5")}
            >
              <Checkbox checked={selected.includes(s.name)} onCheckedChange={() => toggle(s.name)} />
              <button type="button" onClick={() => setFocused(s.name)} className="min-w-0 flex-1 cursor-pointer text-left">
                <span className="block truncate text-sm">{s.name}</span>
                <span className="text-xs text-muted-foreground">{s.rows.length} rows · {s.headers.length} columns</span>
              </button>
            </div>
          ))}
        </div>

        {sheet && (
          <div className="min-w-0 overflow-auto rounded-lg border">
            <p className="border-b px-3 py-2 text-sm font-medium">
              {sheet.name} <span className="font-normal text-muted-foreground">— first {Math.min(PREVIEW_ROWS, sheet.rows.length)} of {sheet.rows.length} rows</span>
            </p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>{sheet.headers.map((h) => <TableHead key={h} className="whitespace-nowrap text-xs">{h}</TableHead>)}</TableRow>
                </TableHeader>
                <TableBody>
                  {sheet.rows.slice(0, PREVIEW_ROWS).map((r, i) => (
                    <TableRow key={i}>
                      {sheet.headers.map((h) => <TableCell key={h} className="max-w-56 truncate text-xs">{r[h]}</TableCell>)}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** A labelled pair of pill buttons — the Preview step's two layout choices. */
function Toggle({ label, options, value, onChange }: Readonly<{
  label: string; options: [string, string][]; value: string; onChange: (v: string) => void;
}>) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{label}</span>
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={cn(
            "cursor-pointer rounded-md border px-2.5 py-1 text-xs font-medium",
            value === v ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground",
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
