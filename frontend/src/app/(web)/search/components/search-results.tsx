"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getCourses, getEducationAgencies, getInstitutions, getMigrationAgents, getScholarshipsSearch,
  getServices, getStudentJobs, getVisaServices, type SearchFilterParams,
} from "../api";
import type {
  FeePeriod, Paginated, SearchBusiness, SearchCourse, SearchJob, SearchScholarship, SearchService, SearchTabKey,
} from "../types";
import { CourseCard } from "./course-card";
import { BusinessCard } from "./business-card";
import { InstitutionCard } from "./institution-card";
import { JobCard } from "./job-card";
import { ScholarshipSearchCard } from "./scholarship-search-card";
import { ServiceSearchCard } from "./service-search-card";

/** Placeholder in the shape of a result card, held at the bottom of the list while the next page loads. */
function ResultSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex gap-3">
        <Skeleton className="h-24 flex-1" />
        <Skeleton className="h-24 w-28 shrink-0" />
      </div>
    </div>
  );
}

const FETCHERS: Record<SearchTabKey, (p: SearchFilterParams) => Promise<Paginated<unknown>>> = {
  courses: getCourses,
  institutions: getInstitutions,
  "education-agencies": getEducationAgencies,
  "visa-services": getVisaServices,
  "migration-agents": getMigrationAgents,
  jobs: getStudentJobs,
  scholarships: getScholarshipsSearch,
  services: getServices,
};

/**
 * The results column: server-rendered page 1, then more pages appended as the reader scrolls.
 *
 * Mount this with a `key` derived from the active query so a filter or tab change remounts it —
 * otherwise the accumulated pages from the previous query would stay on screen.
 */
export function SearchResults({
  tab,
  initial,
  totalPages,
  filters,
  feePeriod,
}: Readonly<{
  tab: SearchTabKey;
  initial: unknown[];
  totalPages: number;
  filters: SearchFilterParams;
  feePeriod: FeePeriod;
}>) {
  const [items, setItems] = useState(initial);
  const [page, setPage] = useState(filters.page ?? 1);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const hasMore = page < totalPages;

  const loadMore = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    const next = page + 1;
    try {
      const res = await FETCHERS[tab]({ ...filters, page: next });
      setItems((prev) => [...prev, ...res.data]);
      setPage(next);
    } catch {
      // Stop the observer from retrying in a loop — the reader taps Retry instead.
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [filters, page, tab]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || failed || loading) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) loadMore(); },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [failed, hasMore, loading, loadMore]);

  return (
    <>
      <div className="space-y-4">
        {tab === "courses" &&
          (items as SearchCourse[]).map((c) => <CourseCard key={c.id} course={c} feePeriod={feePeriod} />)}
        {tab === "jobs" && (items as SearchJob[]).map((j) => <JobCard key={j.id} job={j} />)}
        {tab === "scholarships" &&
          (items as SearchScholarship[]).map((s) => <ScholarshipSearchCard key={s.id} scholarship={s} />)}
        {tab === "services" && (items as SearchService[]).map((s) => <ServiceSearchCard key={s.id} service={s} />)}
        {tab === "institutions" &&
          (items as SearchBusiness[]).map((b) => <InstitutionCard key={b.id} institution={b} />)}
        {(tab === "education-agencies" || tab === "visa-services" || tab === "migration-agents") &&
          (items as SearchBusiness[]).map((b) => <BusinessCard key={b.id} business={b} />)}
      </div>

      {hasMore && (
        <div ref={sentinel} className="pt-4">
          {failed ? (
            <div className="py-4 text-center space-y-2">
              <p className="text-sm text-muted-foreground">Couldn’t load more results.</p>
              <Button variant="outline" size="sm" onClick={loadMore}>Try again</Button>
            </div>
          ) : (
            <div className="space-y-4" aria-hidden>
              <ResultSkeleton />
              <ResultSkeleton />
            </div>
          )}
          <span className="sr-only" role="status">{failed ? "" : "Loading more results…"}</span>
        </div>
      )}
    </>
  );
}
