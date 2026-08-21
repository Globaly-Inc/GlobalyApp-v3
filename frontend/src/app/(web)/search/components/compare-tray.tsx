"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, ExternalLink, Layers, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompareTray } from "../use-compare-tray";
import { COMPARE_ROWS } from "../compare-rows";

/**
 * Floating messenger-style compare widget (bottom-right, collapsible).
 * Shared by the search page and the AI counsellor — both feed the same
 * in-memory store. "Compare Now" renders the comparison inline in this
 * widget; "View details" opens the full /compare page in the SAME tab
 * (a new tab would start with an empty store).
 */
export function CompareTray() {
  const { items, max, remove, clear } = useCompareTray();
  const [collapsed, setCollapsed] = useState(false);
  const [comparing, setComparing] = useState(false);

  if (items.length === 0) return null;
  // Items can drop below 2 while the table is open — fall back to the list.
  const showTable = comparing && items.length >= 2;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        aria-label={`Open compare list (${items.length} courses)`}
        className="fixed bottom-4 right-4 z-40 flex size-12 cursor-pointer items-center justify-center rounded-full border border-border bg-card shadow-lg transition-transform hover:scale-105"
      >
        <Layers className="size-5 text-primary" />
        <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
          {items.length}
        </span>
      </button>
    );
  }

  return (
    <div
      className={`fixed bottom-4 right-4 z-40 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-card shadow-xl ${
        showTable ? "w-[42rem]" : "w-80"
      }`}
    >
      <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Layers className="size-4 text-primary" /> Compare courses ({items.length}/{max})
        </span>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse compare list"
          className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ChevronDown className="size-4" />
        </button>
      </div>

      {showTable ? (
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="sticky left-0 bg-muted/95 py-2 px-3 text-left font-medium text-muted-foreground">Field</th>
                {items.map((i) => (
                  <th key={i.id} className="min-w-[9rem] py-2 px-3 text-left align-top">
                    <div className="flex items-start justify-between gap-1">
                      <span className="font-semibold text-foreground" title={i.name}>{i.name}</span>
                      <button
                        type="button"
                        onClick={() => remove(i.id)}
                        aria-label={`Remove ${i.name}`}
                        className="cursor-pointer rounded p-0.5 text-muted-foreground hover:text-destructive"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                    {i.institutionName && (
                      <span className="font-normal text-[11px] text-muted-foreground">{i.institutionName}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map((row) => (
                <tr key={row.label} className="border-b border-border/50 last:border-b-0">
                  <td className="sticky left-0 bg-card py-2 px-3 text-muted-foreground">{row.label}</td>
                  {items.map((i) => (
                    <td key={i.id} className="py-2 px-3 text-foreground">{row.get(i)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="max-h-56 overflow-y-auto">
          {items.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-2 border-b px-3 py-2 last:border-b-0">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium" title={i.name}>{i.name}</p>
                {i.institutionName && (
                  <p className="truncate text-[11px] text-muted-foreground">{i.institutionName}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(i.id)}
                aria-label={`Remove ${i.name}`}
                className="cursor-pointer rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
        {showTable ? (
          <>
            <Button type="button" size="sm" variant="ghost" onClick={() => setComparing(false)} className="h-8 gap-1.5">
              <ArrowLeft className="size-3.5" /> Back
            </Button>
            <Button size="sm" className="h-8 flex-1 gap-1.5" render={<Link href="/compare" />}>
              <ExternalLink className="size-3.5" /> View details
            </Button>
          </>
        ) : (
          <Button
            type="button"
            size="sm"
            disabled={items.length < 2}
            onClick={() => setComparing(true)}
            className="h-8 flex-1 gap-1.5"
          >
            <Layers className="size-3.5" /> Compare Now
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={() => { clear(); setComparing(false); }} className="h-8">
          Clear
        </Button>
      </div>
    </div>
  );
}
