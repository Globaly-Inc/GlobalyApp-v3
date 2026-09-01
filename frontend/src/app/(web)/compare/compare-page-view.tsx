"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, MapPin, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InstitutionLogo } from "@/components/institution-logo";
import { cn } from "@/lib/utils";
import { useAuthState } from "@/app/auth/store/auth-slice";
import { useCompareTray } from "../search/use-compare-tray";
import { COMPARE_GROUPS } from "../search/compare-rows";

const EMPTY_VALUES = new Set(["—", "Fees on enquiry", "Intake TBC"]);

export function ComparePageView() {
  const { user, initializing } = useAuthState();
  const router = useRouter();
  const { items, remove, clear } = useCompareTray();
  const [hoveredCol, setHoveredCol] = useState<number | null>(null);

  useEffect(() => {
    if (!initializing && !user) {
      router.replace("/auth/sign-in?redirect=/compare");
    }
  }, [initializing, user, router]);

  if (!initializing && !user) return null;

  if (items.length === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <span className="inline-flex size-16 items-center justify-center rounded-2xl bg-muted">
          <BookOpen className="size-7 text-muted-foreground" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-foreground">No courses selected for comparison</h2>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            Explore courses and add them to compare side by side.
          </p>
        </div>
        <Button render={<Link href="/search?tab=courses" />}>Explore Courses</Button>
      </div>
    );
  }

  /** Background applied to every cell in the hovered column. */
  const colBg = (i: number) => hoveredCol === i ? "bg-primary/5" : undefined;
  /** onMouseEnter for any cell in course column i. */
  const onEnter = (i: number) => () => setHoveredCol(i);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 print:max-w-none print:px-0 print:py-0">
      <div className="mb-5 flex items-center justify-between print:hidden">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          render={<Link href="/search?tab=courses" />}
        >
          <ArrowLeft className="size-4" /> Back to Search
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
          <Printer className="size-4" /> Print
        </Button>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">Compare Courses</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {items.length} course{items.length !== 1 ? "s" : ""} selected
        </p>
      </div>

      {/* onMouseLeave on the table clears the hovered column when the cursor leaves entirely. */}
      <div className="overflow-x-auto print:overflow-visible">
        <table
          className="w-full border-separate border-spacing-0 text-sm"
          style={{ minWidth: `${items.length * 240 + 160}px` }}
          onMouseLeave={() => setHoveredCol(null)}
        >
          <thead>
            <tr>
              <th className="w-44 pb-6 pr-6 align-bottom" />
              {items.map((item, i) => (
                <th
                  key={item.id}
                  onMouseEnter={onEnter(i)}
                  className={cn(
                    "min-w-[220px] rounded-t-xl px-5 pb-5 pt-2 align-top text-left transition-colors",
                    colBg(i),
                  )}
                >
                  <div className="mb-3 flex justify-end print:hidden">
                    <button
                      type="button"
                      onClick={() => remove(item.id)}
                      aria-label={`Remove ${item.name} from comparison`}
                      className="text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <X className="size-4" />
                    </button>
                  </div>

                  <InstitutionLogo
                    name={item.institutionName ?? item.name}
                    logoUrl={item.institutionLogoUrl}
                    className="mb-3 size-16 rounded-xl"
                  />

                  <Link
                    href={`/course/${item.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="line-clamp-2 text-sm font-semibold leading-snug text-foreground hover:underline"
                  >
                    {item.name}
                  </Link>
                  {item.institutionName && (
                    <p className="mt-1 truncate text-xs text-muted-foreground">{item.institutionName}</p>
                  )}
                  {item.countryName && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3 shrink-0" />
                      {item.countryName}
                    </p>
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {COMPARE_GROUPS.map((group) => (
              <Fragment key={group.label}>
                <tr>
                  <td className="py-3 pr-6 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.label}
                  </td>
                  {items.map((item, i) => (
                    <td
                      key={item.id}
                      onMouseEnter={onEnter(i)}
                      className={cn("px-5 py-2 transition-colors", colBg(i))}
                    />
                  ))}
                </tr>

                {group.rows.map((row, rowIdx) => {
                  const divided = rowIdx < group.rows.length - 1;
                  return (
                    <tr key={row.label}>
                      <td
                        className={cn(
                          "py-3 pr-6 text-xs font-medium text-muted-foreground",
                          divided && "border-b border-border/40",
                        )}
                      >
                        {row.label}
                      </td>
                      {items.map((item, i) => {
                        const value = row.get(item);
                        return (
                          <td
                            key={item.id}
                            onMouseEnter={onEnter(i)}
                            className={cn(
                              "px-5 py-3 text-sm transition-colors",
                              divided && "border-b border-border/40",
                              colBg(i),
                              EMPTY_VALUES.has(value) ? "text-muted-foreground" : "font-medium text-foreground",
                            )}
                          >
                            {value}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </Fragment>
            ))}

            <tr className="print:hidden">
              <td className="pt-5" />
              {items.map((item, i) => (
                <td
                  key={item.id}
                  onMouseEnter={onEnter(i)}
                  className={cn("rounded-b-xl px-5 pt-4 pb-5 transition-colors", colBg(i))}
                >
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    render={<Link href={`/course/${item.slug}`} target="_blank" rel="noopener noreferrer" />}
                  >
                    View Course
                  </Button>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={clear}
        className="print:hidden mt-6 text-xs text-muted-foreground"
      >
        Clear all
      </Button>
    </div>
  );
}
