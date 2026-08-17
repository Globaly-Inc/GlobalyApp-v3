"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { servicesApi } from "@/app/personal/earn/services/apis";
import type { BrowseResult, ServiceCategory } from "@/app/personal/earn/services/apis";
import { toMinorUnits } from "@/app/personal/earn/services/utils";
import { EMPTY_FILTERS, FilterSidebar, invalidRange, type SidebarFilters } from "./filter-sidebar";
import { ServiceRow } from "./service-row";

const PAGE_SIZE = 12;

/**
 * The public marketplace, laid out like the platform's other search surfaces: a search bar across the top, a
 * Filter & Refine rail on the left, and a result count above a list of rows.
 *
 * Read-only and unauthenticated, so it holds its own state rather than a Redux slice — the same call the app
 * already makes for `geoApi.getCountries()`. Nothing here needs to survive a route change.
 */
export function MarketplaceView() {
  // Seeded from ?search= so arriving from the hero switcher ("Other Services") keeps what was typed. A lazy
  // initializer, not an effect: the param is readable at first render, so there is nothing to synchronise.
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get("search")?.trim() ?? "";

  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [search, setSearch] = useState(initialSearch);
  const [filters, setFilters] = useState<SidebarFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // The API takes minor units; the sidebar collects what a person types. One conversion, here.
  const query = useMemo(
    () => ({
      search: search || undefined,
      category_id: filters.categoryId ?? undefined,
      country_id: filters.countryId ? Number(filters.countryId) : undefined,
      city_id: filters.cityId ? Number(filters.cityId) : undefined,
      min_price: toMinorUnits(filters.minPrice) ?? undefined,
      max_price: toMinorUnits(filters.maxPrice) ?? undefined,
      page,
      limit: PAGE_SIZE,
    }),
    [search, filters, page],
  );

  // Results are cached against the query that produced them, so "loading" is derived from a mismatch rather
  // than set synchronously inside the effect — and a stale result can never show for a query already changed.
  const queryKey = JSON.stringify(query);
  const [cache, setCache] = useState<{ key: string; data: BrowseResult | null; failed: boolean }>({
    key: "",
    data: null,
    failed: false,
  });

  const blocked = invalidRange(filters);
  const status: "loading" | "idle" | "failed" = blocked
    ? "idle"
    : cache.key !== queryKey
      ? "loading"
      : cache.failed
        ? "failed"
        : "idle";

  useEffect(() => {
    servicesApi.getPublicCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    // An inverted range is refused by the server too, so don't spend a request finding out.
    if (blocked || cache.key === queryKey) return;
    let cancelled = false;
    servicesApi
      .browse(query)
      .then((data) => !cancelled && setCache({ key: queryKey, data, failed: false }))
      // Stamping the key on failure too settles the state on "failed" instead of spinning forever.
      .catch(() => !cancelled && setCache({ key: queryKey, data: null, failed: true }));
    return () => {
      cancelled = true;
    };
  }, [queryKey, cache.key, query, blocked]);

  // Any filter change starts a new result set, so page 1 is the only sensible position.
  const applyFilters = (next: SidebarFilters) => {
    setFilters(next);
    setPage(1);
  };

  const services = blocked ? [] : (cache.data?.services ?? []);
  const meta = cache.data?.meta;
  const total = blocked ? 0 : (meta?.total ?? 0);

  return (
    <>
      {/* Search bar row, full width and sticky under the site header — the same shape the other search
          surfaces use. */}
      <div className="sticky top-16 z-30 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="container mx-auto px-3 py-4 sm:px-4">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(searchInput.trim());
              setPage(1);
            }}
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-12 rounded-full pl-11"
                value={searchInput}
                placeholder="Search services…"
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <Button type="submit" className="h-12 gap-2 rounded-full px-6">
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">Search</span>
            </Button>
          </form>
        </div>
      </div>

      <div className="container mx-auto px-3 py-6 sm:px-4">
        {/* The rail collapses below lg; a toggle keeps the filters reachable on a phone instead of pinning a
            tall sidebar above every result. */}
        <Button
          variant="outline"
          className="mb-4 w-full gap-2 lg:hidden"
          onClick={() => setFiltersOpen((open) => !open)}
        >
          <SlidersHorizontal className="h-4 w-4" />
          {filtersOpen ? "Hide filters" : "Filter & Refine"}
        </Button>

        <div className="grid gap-6 lg:grid-cols-[280px_1fr] lg:items-start">
          <div className={cn("lg:sticky lg:top-36", !filtersOpen && "hidden lg:block")}>
            <FilterSidebar categories={categories} value={filters} onChange={applyFilters} />
          </div>

          <div>
            <p className="mb-4 text-sm font-medium text-foreground">
              {status === "loading" ? "Searching…" : `${total} ${total === 1 ? "service" : "services"} found`}
            </p>

            {status === "loading" && (
              <div className="flex min-h-[40vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}

            {status === "failed" && (
              <div className="rounded-lg border border-border bg-card px-4 py-12 text-center">
                <p className="text-sm text-muted-foreground">We couldn&apos;t load services just now.</p>
                <Button
                  variant="outline"
                  className="mt-3"
                  onClick={() => setCache((c) => ({ ...c, key: "" }))}
                >
                  Try again
                </Button>
              </div>
            )}

            {status === "idle" && services.length === 0 && (
              <div className="rounded-lg border border-dashed border-border bg-card px-4 py-16 text-center">
                <p className="font-medium text-foreground">No services match that yet.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {blocked
                    ? "Check the price range."
                    : search || filters.categoryId || filters.countryId
                      ? "Try a different search, category or location."
                      : "Check back soon — students are just getting started."}
                </p>
              </div>
            )}

            {status === "idle" && services.length > 0 && (
              <>
                <div className="space-y-3">
                  {services.map((service) => (
                    <ServiceRow key={service.id} service={service} />
                  ))}
                </div>

                {meta && meta.totalPages > 1 && (
                  <div className="mt-8 flex items-center justify-center gap-3">
                    <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {meta.page} of {meta.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      disabled={page >= meta.totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
