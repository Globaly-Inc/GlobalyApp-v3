"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { allExtractionsApi } from "../apis";

const PAGE_SIZE = 10;
const DEBOUNCE_MS = 300;

type Course = { id: string; name: string | null };

export function CourseLinkPicker({
  jobId,
  excludeIds,
  onSelect,
  disabled,
  className,
}: Readonly<{
  jobId: string;
  excludeIds: string[];
  onSelect: (courseId: string) => void;
  disabled?: boolean;
  className?: string;
}>) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadedQueryRef = useRef("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Load-more (append) staleness: a newer load-more, or a search that has since changed the
  // displayed query, both invalidate it. Search (replace) staleness: only a newer search does —
  // a load-more must never be able to discard a pending search's result, or the search response
  // gets silently dropped while the picker is left stuck in its loading state.
  const requestIdRef = useRef(0);
  const searchIdRef = useRef(0);

  const fetchPage = useCallback(
    async (query: string, pageNum: number, append: boolean) => {
      const requestId = ++requestIdRef.current;
      const searchId = append ? null : ++searchIdRef.current;
      (append ? setLoadingMore : setLoading)(true);
      try {
        const res = await allExtractionsApi.getCourses(jobId, {
          search: query.trim() || undefined,
          page: pageNum,
          limit: PAGE_SIZE,
        });
        const stale = append
          ? requestId !== requestIdRef.current || query !== loadedQueryRef.current
          : searchId !== searchIdRef.current;
        if (!stale) {
          setCourses((prev) => (append ? [...prev, ...res.data] : res.data));
          setTotalPages(res.meta.totalPages);
          setPage(pageNum);
          loadedQueryRef.current = query;
        }
      } finally {
        (append ? setLoadingMore : setLoading)(false);
      }
    },
    [jobId],
  );

  const search = useCallback(
    (query: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => fetchPage(query, 1, false), DEBOUNCE_MS);
    },
    [fetchPage],
  );

  useEffect(() => {
    search("");
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  const options: ComboboxOption[] = courses
    .filter((c) => !excludeIds.includes(c.id))
    .map((c) => ({ value: c.id, label: c.name ?? "Unnamed course" }));

  return (
    <Combobox
      options={options}
      value=""
      onChange={(courseId) => {
        setCourses((prev) => prev.filter((c) => c.id !== courseId));
        onSelect(courseId);
      }}
      onQueryChange={search}
      onLoadMore={() => fetchPage(loadedQueryRef.current, page + 1, true)}
      hasMore={page < totalPages}
      loadingMore={loadingMore}
      multiple
      placeholder={disabled ? "All courses linked" : "Link a course…"}
      searchPlaceholder="Type to search courses…"
      loading={loading}
      disabled={disabled}
      className={className}
    />
  );
}
