"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/combobox";
import { cn } from "@/lib/utils";
import { geoApi, type Country } from "@/app/geo/apis";
import { servicesApi, type City, type ServiceCategory } from "@/app/personal/earn/services/apis";
import { toMinorUnits } from "@/app/personal/earn/services/utils";

export interface SidebarFilters {
  categoryId: number | null;
  countryId: string;
  cityId: string;
  minPrice: string;
  maxPrice: string;
}

export const EMPTY_FILTERS: SidebarFilters = {
  categoryId: null,
  countryId: "",
  cityId: "",
  minPrice: "",
  maxPrice: "",
};

/**
 * Filter & Refine.
 *
 * Every control maps to a filter the API actually implements — category, country, city, and a price range in
 * minor units. Nothing here is decorative: a control that looks like a filter and changes no results is worse
 * than an absent one.
 */
export function FilterSidebar({
  categories,
  value,
  onChange,
}: Readonly<{
  categories: ServiceCategory[];
  value: SidebarFilters;
  onChange: (next: SidebarFilters) => void;
}>) {
  const [countries, setCountries] = useState<Country[]>([]);
  // Cached against the country it belongs to, so a stale city list can never show for a new country and the
  // effect needs no synchronous setState of its own.
  const [cityCache, setCityCache] = useState<{ countryId: string; list: City[] }>({ countryId: "", list: [] });

  useEffect(() => {
    geoApi.getCountries().then(setCountries).catch(() => setCountries([]));
  }, []);

  useEffect(() => {
    const countryId = value.countryId;
    if (!countryId || cityCache.countryId === countryId) return;
    let cancelled = false;
    servicesApi
      .getCities(Number(countryId))
      .then((list) => !cancelled && setCityCache({ countryId, list }))
      .catch(() => !cancelled && setCityCache({ countryId, list: [] }));
    return () => {
      cancelled = true;
    };
  }, [value.countryId, cityCache.countryId]);

  const countryOptions = useMemo(
    () => countries.map((c) => ({ value: String(c.id), label: c.name })),
    [countries],
  );
  const cityOptions = useMemo(
    () =>
      cityCache.countryId === value.countryId
        ? cityCache.list.map((c) => ({ value: String(c.id), label: c.name }))
        : [],
    [cityCache, value.countryId],
  );

  const set = (patch: Partial<SidebarFilters>) => onChange({ ...value, ...patch });
  const active =
    value.categoryId !== null || !!value.countryId || !!value.cityId || !!value.minPrice || !!value.maxPrice;

  return (
    <aside className="rounded-lg border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold text-foreground">Filter &amp; Refine</h2>
        {active && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTERS)}
            className="cursor-pointer text-xs text-primary hover:underline"
          >
            Clear all
          </button>
        )}
      </div>

      <Section label="A. Destination">
        {/* flex + gap, never space-y — base-ui's focus guards inherit sibling margins and shift the layout
            when a Combobox popover opens (frontend/AGENTS.md). */}
        <div className="flex flex-col gap-2">
          <Combobox
            options={countryOptions}
            value={value.countryId}
            // Changing country drops the city: the old one belongs somewhere else.
            onChange={(next) => set({ countryId: next, cityId: "" })}
            placeholder="Country"
            searchPlaceholder="Search countries..."
          />
          <Combobox
            options={cityOptions}
            value={value.cityId}
            onChange={(next) => set({ cityId: next })}
            placeholder={value.countryId ? "City" : "Pick a country first"}
            searchPlaceholder="Search cities..."
            disabled={!value.countryId}
            loading={!!value.countryId && cityCache.countryId !== value.countryId}
          />
        </div>
      </Section>

      <Section label="B. Category">
        <ul className="space-y-1.5">
          <RadioRow checked={value.categoryId === null} onSelect={() => set({ categoryId: null })}>
            All services
          </RadioRow>
          {categories.map((c) => (
            <RadioRow
              key={c.id}
              checked={value.categoryId === c.id}
              onSelect={() => set({ categoryId: c.id })}
            >
              {c.name}
            </RadioRow>
          ))}
        </ul>
      </Section>

      <Section label="C. Price Range" last>
        <div className="flex items-center gap-2">
          <Input
            inputMode="decimal"
            placeholder="Min"
            value={value.minPrice}
            onChange={(e) => set({ minPrice: e.target.value })}
            aria-label="Minimum price"
          />
          <span className="text-muted-foreground">–</span>
          <Input
            inputMode="decimal"
            placeholder="Max"
            value={value.maxPrice}
            onChange={(e) => set({ maxPrice: e.target.value })}
            aria-label="Maximum price"
          />
        </div>
        {/* Listings are priced in several currencies and nothing here converts, so say what is compared. */}
        <p className="mt-2 text-xs text-muted-foreground">
          Compared against each listing&apos;s own currency — amounts are never converted.
        </p>
        {invalidRange(value) && (
          <p className="mt-1 text-xs text-destructive">The minimum can&apos;t be above the maximum.</p>
        )}
      </Section>
    </aside>
  );
}

/** True when both ends parse and are the wrong way round — the server refuses this too. */
export function invalidRange(f: SidebarFilters): boolean {
  const min = toMinorUnits(f.minPrice);
  const max = toMinorUnits(f.maxPrice);
  return min !== null && max !== null && min > max;
}

function Section({
  label,
  last,
  children,
}: Readonly<{ label: string; last?: boolean; children: React.ReactNode }>) {
  return (
    <div className={cn("border-t border-border pt-4", !last && "pb-4", "first-of-type:border-t-0 first-of-type:pt-0")}>
      <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-primary">{label}</p>
      {children}
    </div>
  );
}

function RadioRow({
  checked,
  onSelect,
  children,
}: Readonly<{ checked: boolean; onSelect: () => void; children: React.ReactNode }>) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className="flex w-full cursor-pointer items-center gap-2 text-left text-sm text-foreground"
      >
        <span
          className={cn(
            "flex size-4 shrink-0 items-center justify-center rounded-full border",
            checked ? "border-primary" : "border-input",
          )}
        >
          {checked && <span className="size-2 rounded-full bg-primary" />}
        </span>
        <span className={checked ? "font-medium" : undefined}>{children}</span>
      </button>
    </li>
  );
}
