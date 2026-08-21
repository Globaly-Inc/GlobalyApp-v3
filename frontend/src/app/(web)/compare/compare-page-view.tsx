"use client";

import Link from "next/link";
import { ArrowLeft, X, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompareTray } from "../search/use-compare-tray";
import { COMPARE_ROWS as ROWS } from "../search/compare-rows";

export function ComparePageView() {
  const { items, remove, clear } = useCompareTray();

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 print:max-w-none print:px-0 print:py-0">
      <Link href="/search?tab=courses" className="print:hidden inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mb-4">
        <ArrowLeft className="h-4 w-4" />Back to Search
      </Link>
      <div className="flex items-center justify-between gap-2 mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Compare Courses</h1>
        {items.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => window.print()} className="print:hidden gap-1.5">
            <Printer className="h-4 w-4" />Export / Print
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No courses selected. Go back to search and tap Compare on up to 5 courses.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto border border-border rounded-xl print:overflow-visible print:border-0 print:rounded-none">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground w-40">Field</th>
                  {items.map((i) => (
                    <th key={i.id} className="text-left py-3 px-4 min-w-[200px]">
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/course/${i.slug}`} className="font-semibold text-foreground hover:text-primary">
                          {i.name}
                        </Link>
                        <button
                          type="button"
                          onClick={() => remove(i.id)}
                          aria-label={`Remove ${i.name}`}
                          className="print:hidden text-muted-foreground hover:text-destructive flex-shrink-0"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.label} className="border-b border-border/50">
                    <td className="py-3 px-4 text-muted-foreground">{row.label}</td>
                    {items.map((i) => (
                      <td key={i.id} className="py-3 px-4 text-foreground">{row.get(i)}</td>
                    ))}
                  </tr>
                ))}
                <tr className="print:hidden">
                  <td className="py-3 px-4" />
                  {items.map((i) => (
                    <td key={i.id} className="py-3 px-4">
                      <Link href={`/course/${i.slug}`}>
                        <Button size="sm" className="text-xs h-8">View Course</Button>
                      </Link>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <Button variant="ghost" size="sm" onClick={clear} className="print:hidden mt-4 text-xs">Clear all</Button>
        </>
      )}
    </div>
  );
}
