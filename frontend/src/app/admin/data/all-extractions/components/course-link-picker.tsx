"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { allExtractionsApi } from "../apis";

const SEARCH_LIMIT = 10;
const DEBOUNCE_MS = 300;

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
  const [options, setOptions] = useState<ComboboxOption[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const excludeRef = useRef(excludeIds);
  excludeRef.current = excludeIds;

  const search = useCallback((query: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await allExtractionsApi.getCourses(jobId, { search: query.trim() || undefined, limit: SEARCH_LIMIT });
        setOptions(
          res.data
            .filter((c) => !excludeRef.current.includes(c.id))
            .map((c) => ({ value: c.id, label: c.name })),
        );
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
  }, [jobId]);

  useEffect(() => {
    search("");
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search]);

  return (
    <Combobox
      options={options}
      value=""
      onChange={onSelect}
      onQueryChange={search}
      placeholder={disabled ? "All courses linked" : "Link a course…"}
      searchPlaceholder="Type to search courses…"
      loading={loading}
      disabled={disabled}
      className={className}
    />
  );
}
