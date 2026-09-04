"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { allExtractionsApi } from "../apis";

const PAGE_SIZE = 10;
const DEBOUNCE_MS = 300;

export function EligibilityLinkPicker({
  jobId,
  excludeIds,
  onSelect,
  className,
}: Readonly<{
  jobId: string;
  excludeIds: string[];
  onSelect: (option: { id: string; label: string }) => void;
  className?: string;
}>) {
  const [options, setOptions] = useState<ComboboxOption[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadedQueryRef = useRef("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  const fetchPage = useCallback(
    async (query: string, pageNum: number, append: boolean) => {
      const requestId = ++requestIdRef.current;
      (append ? setLoadingMore : setLoading)(true);
      try {
        const res = await allExtractionsApi.getEligibilityRequirements(jobId, {
          search: query.trim() || undefined,
          page: pageNum,
          limit: PAGE_SIZE,
        });
        if (requestId !== requestIdRef.current) return;
        const mapped = res.data.map((e) => ({ value: e.id, label: e.name || "Unnamed requirement" }));
        setOptions((prev) => (append ? [...prev, ...mapped] : mapped));
        setTotalPages(res.meta.totalPages);
        setPage(pageNum);
        loadedQueryRef.current = query;
      } finally {
        if (requestId === requestIdRef.current) (append ? setLoadingMore : setLoading)(false);
      }
    },
    [jobId],
  );

  // Debounced — used for onQueryChange as the admin types.
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

  return (
    <Combobox
      options={options.filter((o) => !excludeIds.includes(o.value))}
      value=""
      onChange={(id) => {
        const option = options.find((o) => o.value === id);
        if (option) onSelect({ id: option.value, label: option.label });
      }}
      onQueryChange={search}
      onLoadMore={() => fetchPage(loadedQueryRef.current, page + 1, true)}
      hasMore={page < totalPages}
      loadingMore={loadingMore}
      multiple
      placeholder="Select a requirement to link"
      searchPlaceholder="Type to search eligibility requirements…"
      emptyText="No eligibility requirements found"
      loading={loading}
      className={className}
    />
  );
}
