"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, ChevronDown, ChevronLeft, Layers, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InstitutionLogo } from "@/components/institution-logo";
import { useCompareTray } from "../use-compare-tray";

const COMPARE_ENABLED_PATHS = ["/search", "/personal/explore", "/personal/ai"];

type View = "list" | "detail";

export function CompareTray({ positionClass = "bottom-4 right-4" }: Readonly<{ positionClass?: string }> = {}) {
  const { items, max, remove, clear } = useCompareTray();
  const [collapsed, setCollapsed] = useState(false);
  const [view, setView] = useState<View>("list");
  const pathname = usePathname();

  if (items.length === 0 || !COMPARE_ENABLED_PATHS.some((p) => pathname.startsWith(p))) return null;

  const baseComparePath = pathname.startsWith("/personal/explore") ? "/personal/explore/compare" : "/compare";
  const slugParam = items.map((i) => i.slug).filter(Boolean).join(",");
  const comparePath = slugParam ? `${baseComparePath}?slugs=${encodeURIComponent(slugParam)}` : baseComparePath;

  // Collapsed bubble
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        aria-label={`Open compare list (${items.length} courses)`}
        className={`fixed ${positionClass} z-40 flex size-12 cursor-pointer items-center justify-center rounded-full border border-border bg-card shadow-lg transition-transform hover:scale-105`}
      >
        <Layers className="size-5 text-primary" />
        <span className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
          {items.length}
        </span>
      </button>
    );
  }

  return (
    <div className={`fixed ${positionClass} z-40 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl transition-[width] duration-300 ${view === "detail" ? "w-[520px]" : "w-80"}`}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          {view === "detail" && (
            <button
              type="button"
              onClick={() => setView("list")}
              className="cursor-pointer rounded p-0.5 text-muted-foreground hover:text-foreground"
              aria-label="Back to list"
            >
              <ChevronLeft className="size-4" />
            </button>
          )}
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            <Layers className="size-4 text-primary" />
            {view === "detail" ? "Quick compare" : "Compare courses"}
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
              {items.length}/{max}
            </span>
          </span>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse"
          className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ChevronDown className="size-4" />
        </button>
      </div>

      {/* ── List view ── */}
      {view === "list" && (
        <>
          <ul className="flex flex-col divide-y">
            {items.map((item) => {
              const fee = item.annualTuition && item.feeCurrency
                ? `${item.feeCurrency} ${Number(item.annualTuition).toLocaleString("en-US")}`
                : null;
              return (
                <li key={item.id} className="flex items-start gap-3 px-3 py-2.5">
                  <InstitutionLogo
                    name={item.institutionName ?? item.name}
                    logoUrl={item.institutionLogoUrl ?? null}
                    className="mt-0.5 size-8 shrink-0 rounded-lg"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-foreground" title={item.name}>{item.name}</p>
                    {item.institutionName && (
                      <p className="truncate text-[11px] text-muted-foreground">{item.institutionName}</p>
                    )}
                    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                      {fee && <span className="text-[11px] font-medium text-primary">{fee}/yr</span>}
                      {item.durationLabel && <span className="text-[11px] text-muted-foreground">{item.durationLabel}</span>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(item.id)}
                    aria-label={`Remove ${item.name}`}
                    className="mt-0.5 shrink-0 cursor-pointer rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center gap-2 border-t bg-muted/20 px-3 py-2.5">
            <Button
              size="sm"
              disabled={items.length < 2}
              className="h-8 flex-1 gap-1.5"
              onClick={() => setView("detail")}
            >
              <Layers className="size-3.5" /> Compare Now
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-muted-foreground" onClick={clear}>
              Clear
            </Button>
          </div>
        </>
      )}

      {/* ── Detail view (inline mini compare) ── */}
      {view === "detail" && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="w-24 px-3 py-2 text-left font-medium text-muted-foreground" />
                  {items.map((item) => (
                    <th key={item.id} className="px-2 py-2 text-left font-semibold text-foreground">
                      <div className="flex items-center gap-1.5">
                        <InstitutionLogo
                          name={item.institutionName ?? item.name}
                          logoUrl={item.institutionLogoUrl ?? null}
                          className="size-5 shrink-0 rounded"
                        />
                        <span className="line-clamp-1 text-[11px]">{item.institutionName ?? "—"}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {/* Course */}
                <tr className="hover:bg-muted/20">
                  <td className="px-3 py-2 text-[11px] font-medium text-muted-foreground">Course</td>
                  {items.map((item) => (
                    <td key={item.id} className="px-2 py-2 text-[11px] font-semibold text-foreground">
                      <span className="line-clamp-2">{item.name}</span>
                    </td>
                  ))}
                </tr>
                {/* Country */}
                <tr className="hover:bg-muted/20">
                  <td className="px-3 py-2 text-[11px] font-medium text-muted-foreground">Country</td>
                  {items.map((item) => (
                    <td key={item.id} className="px-2 py-2 text-[11px] text-foreground">{item.countryName ?? "—"}</td>
                  ))}
                </tr>
                {/* Tuition */}
                <tr className="hover:bg-muted/20">
                  <td className="px-3 py-2 text-[11px] font-medium text-muted-foreground">Tuition/yr</td>
                  {items.map((item) => (
                    <td key={item.id} className="px-2 py-2 text-[11px] font-semibold text-primary">
                      {item.annualTuition && item.feeCurrency
                        ? `${item.feeCurrency} ${Number(item.annualTuition).toLocaleString("en-US")}`
                        : "—"}
                    </td>
                  ))}
                </tr>
                {/* Duration */}
                <tr className="hover:bg-muted/20">
                  <td className="px-3 py-2 text-[11px] font-medium text-muted-foreground">Duration</td>
                  {items.map((item) => (
                    <td key={item.id} className="px-2 py-2 text-[11px] text-foreground">{item.durationLabel ?? "—"}</td>
                  ))}
                </tr>
                {/* Intake */}
                <tr className="hover:bg-muted/20">
                  <td className="px-3 py-2 text-[11px] font-medium text-muted-foreground">Intake</td>
                  {items.map((item) => (
                    <td key={item.id} className="px-2 py-2 text-[11px] text-foreground">{item.nextIntakeLabel ?? "—"}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-2 border-t bg-muted/20 px-3 py-2.5">
            <Button
              size="sm"
              className="h-8 flex-1 gap-1.5"
              render={<Link href={comparePath} target="_blank" rel="noopener noreferrer" />}
              onClick={() => localStorage.setItem("compare_items", JSON.stringify(items))}
            >
              View More <ArrowRight className="size-3.5" />
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-8 px-2 text-muted-foreground" onClick={clear}>
              Clear
            </Button>
          </div>
        </>
      )}

    </div>
  );
}
