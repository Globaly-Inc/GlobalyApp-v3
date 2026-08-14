"use client";

import { useEffect, useRef, useState } from "react";
import { countriesApi } from "../apis";
import type { City } from "../apis/types";

// Deliberately not the shared Popover (which portals + positions via a CSS `transform`) —
// that transform promotes the popup to its own compositor layer, and in this environment's
// software-rendered Chromium, GPU-composited text renders corrupted (verified: identical
// text outside the transformed layer renders crisp). Plain absolute positioning avoids the
// transform entirely, so text stays on the normal paint path.
export function CitiesDropdown({ countryId, cityCount }: Readonly<{ countryId: number; cityCount: number }>) {
  const [open, setOpen] = useState(false);
  const [cities, setCities] = useState<City[] | null>(null);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleToggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !cities && !loading) {
      setLoading(true);
      try {
        setCities(await countriesApi.getCitiesByCountry(countryId));
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div ref={containerRef} className="relative inline-block">
      <button type="button" onClick={handleToggle} className="text-xs font-medium text-primary hover:underline">
        {cityCount} {cityCount === 1 ? "city" : "cities"} ▾
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-64 w-56 overflow-y-auto rounded-lg border border-border bg-popover p-2.5 text-sm text-popover-foreground shadow-md">
          {loading && <p className="text-xs text-muted-foreground">Loading…</p>}
          {!loading && cities?.length === 0 && <p className="text-xs text-muted-foreground">No cities yet.</p>}
          {!loading && cities?.map((city) => (
            <p key={city.id} className="truncate text-sm">{city.name}</p>
          ))}
        </div>
      )}
    </div>
  );
}
