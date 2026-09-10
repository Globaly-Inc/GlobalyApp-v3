"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { Badge } from "@/components/ui/badge";
import { categoriesApi } from "@/app/admin/platform/categories/apis";

// Closed list of 11 rows — one fetch returns all of them, same as components/lookup-combobox.tsx.
const SEARCH_LIMIT = 50;
const DEBOUNCE_MS = 300;

export type DegreeLevelOption = { slug: string; name: string };

/** Multi-select over the seeded degree levels. Value is a list of slugs; empty means all. */
export function DegreeLevelPicker({
  value,
  onChange,
  className,
}: Readonly<{
  value: DegreeLevelOption[];
  onChange: (next: DegreeLevelOption[]) => void;
  className?: string;
}>) {
  const [options, setOptions] = useState<ComboboxOption[]>([]);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchedRef = useRef(false);

  const fetchOptions = useCallback(async (query: string) => {
    setLoading(true);
    try {
      const res = await categoriesApi.getLookups("degree-levels", {
        search: query.trim() || undefined,
        limit: SEARCH_LIMIT,
      });
      setOptions(res.data.map((l) => ({ value: l.slug, label: l.name })));
    } catch {
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, []);

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

  const selected = new Set(value.map((v) => v.slug));

  return (
    <div className="flex flex-col gap-1.5">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((level) => (
            <Badge key={level.slug} className="gap-1 bg-primary/10 text-xs text-primary">
              {level.name}
              <button
                type="button"
                className="cursor-pointer"
                title={`Remove ${level.name}`}
                onClick={() => onChange(value.filter((v) => v.slug !== level.slug))}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <Combobox
        options={options.filter((o) => !selected.has(o.value))}
        value=""
        onChange={(slug) => {
          const option = options.find((o) => o.value === slug);
          if (option) onChange([...value, { slug: option.value, name: option.label }]);
        }}
        onQueryChange={search}
        multiple
        placeholder="All degree levels"
        searchPlaceholder="Type to search levels…"
        emptyText="No degree levels found"
        loading={loading}
        className={className}
      />
    </div>
  );
}
