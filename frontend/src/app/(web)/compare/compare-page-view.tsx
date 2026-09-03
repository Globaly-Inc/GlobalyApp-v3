"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, BookOpen, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InstitutionLogo } from "@/components/institution-logo";
import { useAuthState } from "@/app/auth/store/auth-slice";
import { useCurrency } from "../components/currency-context";
import { Money } from "../components/money";
import { useCompareTray } from "../search/use-compare-tray";
import { COMPARE_GROUPS } from "../search/compare-rows";
import { getCourseBySlug } from "../search/api";
import type { CourseDetail } from "../search/types";

export function ComparePageView({
  basePath = "/compare",
  exploreHref = "/search?tab=courses",
}: Readonly<{ basePath?: string; exploreHref?: string }> = {}) {
  const { user, initializing } = useAuthState();
  const { currency } = useCurrency();
  const router = useRouter();
  const searchParams = useSearchParams();

  const { items, add, remove, clear } = useCompareTray();

  // Seed store when opened in a new tab — store is in-memory, doesn't survive tab boundary.
  // Primary: localStorage (set by CompareTray before opening the tab — works for all courses).
  // Fallback: ?slugs= param (for slug-based courses from the search page).
  useEffect(() => {
    if (items.length > 0) return;
    const stored = localStorage.getItem("compare_items");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          parsed.forEach((item) => add(item));
          localStorage.removeItem("compare_items");
          return;
        }
      } catch { /* fall through to slug param */ }
    }
    const slugs = searchParams.get("slugs");
    if (!slugs) return;
    slugs.split(",").filter(Boolean).forEach((slug) => add({ id: slug, slug, name: slug }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [details, setDetails] = useState<Record<string, CourseDetail>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const firstColRef = useRef<HTMLTableCellElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const COLUMN_WIDTH = 320;

  const updateScrollState = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 0);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  };

  useEffect(() => {
    updateScrollState();
  }, [items.length]);

  // Tracks slugs already requested — separate from `details` state so Strict Mode's double-invoke
  // of this effect on mount can't fire the same fetches twice (see AGENTS.md's fetch-on-mount rule).
  const requestedSlugs = useRef(new Set<string>());
  const [retryTick, setRetryTick] = useState(0);
  useEffect(() => {
    const missing = items.filter((i) => !requestedSlugs.current.has(i.slug));
    if (missing.length === 0) return;
    missing.forEach((i) => requestedSlugs.current.add(i.slug));
    let cancelled = false;
    void Promise.allSettled(missing.map((i) => getCourseBySlug(i.slug))).then((results) => {
      if (cancelled) return;
      let hasFailure = false;
      setDetails((prev) => {
        const next = { ...prev };
        missing.forEach((item, idx) => {
          const result = results[idx];
          if (result?.status === "fulfilled" && result.value) {
            next[item.slug] = result.value;
          } else {
            requestedSlugs.current.delete(item.slug);
            hasFailure = true;
          }
        });
        return next;
      });
      if (hasFailure) setRetryTick((t) => t + 1);
    });
    return () => {
      cancelled = true;
      missing.forEach((i) => requestedSlugs.current.delete(i.slug));
    };
  }, [items, retryTick]);

  const scrollByColumn = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    // Measured from the rendered column so "next" always lands exactly on a full course boundary.
    const step = firstColRef.current?.offsetWidth ?? COLUMN_WIDTH;
    // Advance by a full page of however many columns are actually visible, not just one.
    const columnsPerPage = Math.max(1, Math.round(el.clientWidth / step));
    const currentIndex = Math.round(el.scrollLeft / step);
    el.scrollTo({ left: (currentIndex + dir * columnsPerPage) * step, behavior: "smooth" });
  };

  // Only the portal's own compare route (/personal/explore/compare) requires a signed-in user —
  // the public /compare route is a guest-facing feature, same as the search page it's reached from.
  const requiresAuth = basePath.startsWith("/personal");

  useEffect(() => {
    if (requiresAuth && !initializing && !user) {
      router.replace(`/auth/sign-in?redirect=${basePath}`);
    }
  }, [requiresAuth, initializing, user, router, basePath]);

  if (requiresAuth && !initializing && !user) return null;

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
        <Button render={<Link href={exploreHref} />}>Explore Courses</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl print:max-w-none print:p-8">
      <style>{"@media print { @page { size: landscape; margin: 0; } }"}</style>
      <div className="mb-6 hidden print:block">
        <div className="flex items-center justify-between">
          <Image src="/globalyapp-logo.png" alt="Globalyapp" width={727} height={157} className="h-8 w-auto" />
          <span className="text-xs text-muted-foreground">
            {new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
          </span>
        </div>
        <h1 className="mt-3 text-lg font-semibold text-foreground">Compare Courses</h1>
      </div>
      <div className="sticky top-16 z-10 mb-6 flex items-center justify-between bg-background py-3 print:hidden">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" render={<Link href={exploreHref} />}>
            <ArrowLeft className="size-4" /> Back
          </Button>
          <h1 className="text-lg font-semibold text-foreground">Compare List</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => window.print()}>
            Generate PDF
          </Button>
          <button
            type="button"
            onClick={() => scrollByColumn(-1)}
            disabled={!canPrev}
            aria-label="Scroll to previous course"
            className="flex size-8 cursor-pointer items-center justify-center rounded-full border border-border text-muted-foreground disabled:cursor-not-allowed disabled:opacity-40 enabled:hover:bg-accent"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollByColumn(1)}
            disabled={!canNext}
            aria-label="Scroll to next course"
            className="flex size-8 cursor-pointer items-center justify-center rounded-full border border-border text-muted-foreground disabled:cursor-not-allowed disabled:opacity-40 enabled:hover:bg-accent"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={updateScrollState}
        className="scrollbar-none overflow-x-auto print:overflow-visible"
      >
        <table
          className="table-fixed border-separate border-spacing-0 rounded-xl border border-border text-sm print:w-full!"
          style={{ width: `${Math.max(items.length, 3) * COLUMN_WIDTH + 176}px` }}
        >
          <thead>
            <tr>
              <th className="w-44 border-b border-r border-border p-0 text-center align-middle text-sm font-semibold text-foreground">
                <div className="flex h-full items-center justify-center px-5 py-5">Compare Courses</div>
              </th>
              {items.map((item, i) => (
                <th
                  key={item.id}
                  ref={i === 0 ? firstColRef : undefined}
                  className="min-w-[220px] border-b border-r border-border px-5 pb-5 pt-5 align-top text-left last:border-r-0"
                >
                  <InstitutionLogo
                    name={item.institutionName ?? item.name}
                    logoUrl={item.institutionLogoUrl}
                    fallbackIcon
                    className="mx-auto mb-3 size-16 rounded-xl"
                  />

                  <Link
                    href={`/course/${item.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="line-clamp-2 text-center text-sm font-semibold leading-snug text-foreground hover:underline print:line-clamp-none"
                  >
                    {item.name}
                  </Link>
                  {item.institutionName && (
                    <p className="mt-1 truncate text-center text-xs text-muted-foreground print:truncate-none">{item.institutionName}</p>
                  )}
                  <p className="mt-1 text-center text-sm font-semibold text-foreground">
                    {item.annualTuition != null ? (
                      <Money amount={item.annualTuition} currency={item.feeCurrency ?? "AUD"} />
                    ) : (
                      "Fees on enquiry"
                    )}
                  </p>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {COMPARE_GROUPS.map((group) => (
              <Fragment key={group.label}>
                <tr>
                  <td
                    colSpan={items.length + 1}
                    className="border-b border-border bg-primary/5 py-2.5 pl-3 text-sm font-semibold text-foreground print:bg-transparent"
                  >
                    {group.label}
                  </td>
                </tr>

                {group.label === "Course Details" && (
                  <tr>
                    <td className="border-b border-r border-border py-3 pl-3 pr-6 text-xs font-medium text-foreground">
                      Branch
                    </td>
                    {items.map((item) => (
                      <td
                        key={item.id}
                        className="border-b border-r border-border px-5 py-3 text-sm last:border-r-0"
                      >
                        {item.branches?.length ? (
                          <div className="flex flex-col gap-1">
                            {item.branches.map((branch) => (
                              <span key={branch} className="font-medium text-muted-foreground">{branch}</span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                )}

                {group.rows.map((row) => (
                  <tr key={row.label}>
                    <td className="border-b border-r border-border py-3 pl-3 pr-6 text-xs font-medium text-foreground">
                      {row.label}
                    </td>
                    {items.map((item) => {
                      const value = row.get(item, details[item.slug], currency);
                      return (
                        <td
                          key={item.id}
                          className="border-b border-r border-border px-5 py-3 text-sm font-medium text-muted-foreground last:border-r-0"
                        >
                          {value}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}

            <tr className="print:hidden">
              <td className="border-r border-border" />
              {items.map((item) => (
                <td key={item.id} className="border-r border-border px-5 py-4 text-center last:border-r-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full border-destructive text-destructive hover:bg-primary/5"
                    onClick={() => remove(item.id)}
                  >
                    Remove From List
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
