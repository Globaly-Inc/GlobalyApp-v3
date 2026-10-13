"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { SortOrder } from "../const";

const DEFAULT_PAGE_SIZE = 10;

/** The job list's search/filter/sort/page state, mirrored into the query string so a reload restores it. */
export function useJobsListFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [searchQuery, setSearchQueryState] = useState(() => searchParams.get("q") ?? "");
  const [debouncedQuery, setDebouncedQuery] = useState(() => searchParams.get("q") ?? "");
  const [sortOrder, setSortOrderState] = useState<SortOrder>(() => (searchParams.get("sort") as SortOrder) || "newest");
  const [sourceFilter, setSourceFilterState] = useState(() => searchParams.get("source") ?? "all");
  const [statusFilter, setStatusFilterState] = useState(() => searchParams.get("status") ?? "all");
  const [businessCategoryFilter, setBusinessCategoryFilterState] = useState(() => searchParams.get("category") ?? "all");
  const [showDeclined, setShowDeclinedState] = useState(() => searchParams.get("declined") === "1");
  const [page, setPageState] = useState(() => Number(searchParams.get("page")) || 1);
  const [pageSize, setPageSizeState] = useState(() => Number(searchParams.get("per_page")) || DEFAULT_PAGE_SIZE);

  // Mutable snapshot of the query string, updated synchronously on every call so that
  // several updateParam calls firing in the same tick (e.g. a filter change plus the
  // page-reset effect below) all build on each other's changes instead of the stale
  // `searchParams` from this render — otherwise the later call clobbers the earlier one.
  const paramsRef = useRef(new URLSearchParams(searchParams.toString()));
  useEffect(() => {
    paramsRef.current = new URLSearchParams(searchParams.toString());
  }, [searchParams]);

  const updateParam = (key: string, value: string | null) => {
    const params = paramsRef.current;
    if (value === null || value === "") params.delete(key);
    else params.set(key, value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const setPage = (next: number) => {
    setPageState(next);
    updateParam("page", String(next));
  };

  const setPageSize = (next: number) => {
    setPageSizeState(next);
    updateParam("per_page", String(next));
  };

  const setSearchQuery = (next: string) => {
    setSearchQueryState(next);
    updateParam("q", next || null);
  };

  const setSortOrder = (next: SortOrder) => {
    setSortOrderState(next);
    updateParam("sort", next === "newest" ? null : next);
  };

  const setSourceFilter = (next: string) => {
    setSourceFilterState(next);
    updateParam("source", next === "all" ? null : next);
  };

  const setStatusFilter = (next: string) => {
    setStatusFilterState(next);
    updateParam("status", next === "all" ? null : next);
  };

  const setBusinessCategoryFilter = (next: string) => {
    setBusinessCategoryFilterState(next);
    updateParam("category", next === "all" ? null : next);
  };

  const setShowDeclined = (next: boolean) => {
    setShowDeclinedState(next);
    updateParam("declined", next ? "1" : null);
  };

  const hasActiveFilters =
    searchQuery !== "" || sortOrder !== "newest" || sourceFilter !== "all" || statusFilter !== "all" || businessCategoryFilter !== "all" || showDeclined;

  const clearFilters = () => {
    setSearchQuery("");
    setSortOrder("newest");
    setSourceFilter("all");
    setStatusFilter("all");
    setBusinessCategoryFilter("all");
    setShowDeclined(false);
  };

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 350);
    return () => clearTimeout(t);
  }, [searchQuery]);

  return {
    searchQuery, setSearchQuery, debouncedQuery,
    sortOrder, setSortOrder,
    sourceFilter, setSourceFilter,
    statusFilter, setStatusFilter,
    businessCategoryFilter, setBusinessCategoryFilter,
    showDeclined, setShowDeclined,
    page, setPage, pageSize, setPageSize,
    hasActiveFilters, clearFilters,
  };
}
