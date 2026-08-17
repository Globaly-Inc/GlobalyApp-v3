"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { ApiError } from "@/lib/api/http";
import { placesApi } from "../../apis";
import type { PlaceDetails } from "../../apis/types";

export function AddressAutocomplete({
  value,
  onChange,
  onResolved,
  countryIso2,
}: Readonly<{
  value: string;
  onChange: (address: string) => void;
  onResolved: (details: PlaceDetails) => void;
  countryIso2?: string | null;
}>) {
  const [suggestions, setSuggestions] = useState<ComboboxOption[]>([]);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleQueryChange = (query: string) => {
    clearTimeout(searchTimerRef.current);
    if (!query.trim()) {
      setSuggestions([]);
      return;
    }
    searchTimerRef.current = setTimeout(async () => {
      try {
        const predictions = await placesApi.autocomplete(query, countryIso2);
        setSuggestions(predictions.map((p) => ({ value: p.placeId, label: p.description })));
      } catch {
        setSuggestions([]);
      }
    }, 300);
  };

  const handleChange = async (newValue: string) => {
    const isSuggestion = suggestions.some((s) => s.value === newValue);
    if (!isSuggestion) {
      onChange(newValue);
      return;
    }
    try {
      const details = await placesApi.getDetails(newValue);
      onChange(details.address);
      onResolved(details);
    } catch (e) {
      const err = e as ApiError;
      toast.error("Couldn't look up that address", { description: err.message });
    }
  };

  return (
    <Combobox
      options={suggestions}
      value={value}
      onChange={handleChange}
      onQueryChange={handleQueryChange}
      creatable
      placeholder="Start typing an address"
      searchPlaceholder="Search address"
      emptyText="No matches — keep typing or press Enter to use as-is"
      contentClassName="w-96"
    />
  );
}
