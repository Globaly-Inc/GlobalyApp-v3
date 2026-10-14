"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type BusinessesTab = "businesses" | "invites" | "services" | "claims";

/** The businesses list's tab, filters, sort and paging — each mirrored into the query string. */
export function useBusinessListParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [tab, setTabState] = useState<BusinessesTab>(() => (searchParams.get("tab") as BusinessesTab) || "businesses");
  const [search, setSearchState] = useState(() => searchParams.get("q") ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(() => searchParams.get("q") ?? "");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [statusFilter, setStatusFilterState] = useState(() => searchParams.get("status") ?? "all");
  const [categoryFilter, setCategoryFilterState] = useState(() => searchParams.get("category") ?? "all");
  const [sourceFilter, setSourceFilterState] = useState(() => searchParams.get("source") ?? "all");
  const [ownershipFilter, setOwnershipFilterState] = useState(() => searchParams.get("ownership") ?? "all");
  const [sort, setSortState] = useState(() => searchParams.get("sort") ?? "created_desc");
  const [page, setPageState] = useState(() => Number(searchParams.get("page")) || 1);
  const [limit, setLimitState] = useState(() => Number(searchParams.get("limit")) || 10);

  // Mutable snapshot of the query string, updated synchronously on every call so several
  // updateParam calls firing in the same tick (a filter change plus its page-reset) all build
  // on each other instead of the stale `searchParams` from this render.
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

  // Server-side filters change the result set, so a stale page would fall off the end.
  const resetPage = <T,>(set: (v: T) => void, v: T) => { set(v); setPage(1); };

  const setTab = (next: BusinessesTab) => {
    setTabState(next);
    updateParam("tab", next === "businesses" ? null : next);
  };

  const setLimit = (next: number) => {
    setLimitState(next);
    updateParam("limit", next === 10 ? null : String(next));
  };

  const setStatusFilter = (next: string) => {
    setStatusFilterState(next);
    updateParam("status", next === "all" ? null : next);
  };

  const setCategoryFilter = (next: string) => {
    setCategoryFilterState(next);
    updateParam("category", next === "all" ? null : next);
  };

  const setSourceFilter = (next: string) => {
    setSourceFilterState(next);
    updateParam("source", next === "all" ? null : next);
  };

  const setOwnershipFilter = (next: string) => {
    setOwnershipFilterState(next);
    updateParam("ownership", next === "all" ? null : next);
  };

  const setSort = (next: string) => {
    setSortState(next);
    updateParam("sort", next === "created_desc" ? null : next);
  };

  const handleSearchChange = (value: string) => {
    setSearchState(value);
    updateParam("q", value || null);
    setPage(1);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(value), 300);
  };

  const hasActiveFilters =
    search !== "" || statusFilter !== "all" || categoryFilter !== "all" || sourceFilter !== "all" || ownershipFilter !== "all" || sort !== "created_desc";

  const clearFilters = () => {
    handleSearchChange("");
    setStatusFilter("all");
    setCategoryFilter("all");
    setSourceFilter("all");
    setOwnershipFilter("all");
    setSort("created_desc");
  };

  return {
    tab, setTab,
    search, debouncedSearch, handleSearchChange,
    statusFilter, setStatusFilter,
    categoryFilter, setCategoryFilter,
    sourceFilter, setSourceFilter,
    ownershipFilter, setOwnershipFilter,
    sort, setSort,
    page, setPage,
    limit, setLimit,
    resetPage, hasActiveFilters, clearFilters,
  };
}
