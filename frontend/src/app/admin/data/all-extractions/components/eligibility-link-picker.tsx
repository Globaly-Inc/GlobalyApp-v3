"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { allExtractionsApi } from "../apis";

const SEARCH_LIMIT = 10;
const DEBOUNCE_MS = 300;

export function EligibilityLinkPicker({
  jobId,
  value,
  onChange,
  className,
}: Readonly<{
  jobId: string;
  value: string;
  onChange: (eligibilityId: string) => void;
  className?: string;
}>) {
  const [options, setOptions] = useState<ComboboxOption[]>([]);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchedRef = useRef(false);

  const fetchOptions = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const res = await allExtractionsApi.getEligibilityRequirements(jobId, { search: query.trim() || undefined, limit: SEARCH_LIMIT });
      setOptions(res.data.map((e) => ({ value: e.id, label: e.name || "Unnamed requirement" })));
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  // Debounced — used for onQueryChange as the admin types.
  const search = useCallback((query: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchOptions(query), DEBOUNCE_MS);
  }, [fetchOptions]);

  // Undebounced, guarded to run once — Strict Mode's dev double-invoke would otherwise
  // fire this initial load twice.
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
      placeholder="Select a requirement to link"
      searchPlaceholder="Type to search eligibility requirements…"
      emptyText="No eligibility requirements found"
      loading={loading}
      className={className}
    />
  );
}
