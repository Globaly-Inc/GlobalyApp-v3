"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { categoriesApi } from "@/app/admin/platform/categories/apis";
import type { LookupKind } from "@/app/admin/platform/categories/apis/types";

// Both lookups this drives are CLOSED lists — 14 areas of study, 11 degree levels — so the
// first fetch has to return all of them. At 10 the tail of the list never arrived, and since
// Combobox only renders a value it can find among its options, every course in an area sorting
// past the tenth (Law, Personal Care and Fitness, Social Studies and Media, Travel and
// Hospitality) showed the placeholder as though it had no subject area at all.
const SEARCH_LIMIT = 50;
const DEBOUNCE_MS = 300;

export function LookupCombobox({
  kind,
  by = "name",
  value,
  onChange,
  placeholder = "Select…",
  pinnedOptions,
  creatable = false,
  className,
}: Readonly<{
  kind: LookupKind;
  /** What `value` holds. Slug for a column storing the link (subject_area_code); name otherwise. */
  by?: "name" | "slug";
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  pinnedOptions?: ComboboxOption[];
  creatable?: boolean;
  className?: string;
}>) {
  const [options, setOptions] = useState<ComboboxOption[]>([]);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchedRef = useRef(false);

  const fetchOptions = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const res = await categoriesApi.getLookups(kind, { search: query.trim() || undefined, limit: SEARCH_LIMIT });
      setOptions(res.data.map((l) => ({ value: by === "slug" ? l.slug : l.name, label: l.name })));
    } catch {
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, [kind, by]);

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
      options={pinnedOptions ? [...pinnedOptions, ...options] : options}
      value={value}
      onChange={onChange}
      onQueryChange={search}
      placeholder={placeholder}
      searchPlaceholder="Type to search…"
      loading={loading}
      creatable={creatable}
      className={className}
    />
  );
}
