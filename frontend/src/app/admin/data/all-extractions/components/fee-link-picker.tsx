"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { allExtractionsApi } from "../apis";
import { feeAmount } from "../utils";

const SEARCH_LIMIT = 10;
const DEBOUNCE_MS = 300;

export function FeeLinkPicker({
  jobId,
  value,
  onChange,
  className,
}: Readonly<{
  jobId: string;
  value: string;
  onChange: (feeId: string) => void;
  className?: string;
}>) {
  const [options, setOptions] = useState<ComboboxOption[]>([]);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchedRef = useRef(false);

  const fetchOptions = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const res = await allExtractionsApi.getCourseFees(jobId, { search: query.trim() || undefined, limit: SEARCH_LIMIT });
      setOptions(res.data.map((f) => ({ value: f.id, label: f.name ? `${f.name} — ${feeAmount(f)}` : feeAmount(f) })));
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  const search = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchOptions(query), DEBOUNCE_MS);
  }, [fetchOptions]);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchOptions("");
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [fetchOptions]);

  return (
    <Combobox
      options={options}
      value={value}
      onChange={onChange}
      onQueryChange={search}
      placeholder="Select a fee to link"
      searchPlaceholder="Type to search fees…"
      emptyText="No fees found"
      loading={loading}
      className={className}
    />
  );
}
