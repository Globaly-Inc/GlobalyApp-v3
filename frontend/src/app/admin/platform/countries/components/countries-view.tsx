"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Globe, Loader2, Plus, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { AdminSegmentedTabs } from "../../../components/admin-segmented-tabs";
import { ConfirmDeleteDialog } from "../../../components/confirm-delete-dialog";
import { countriesApi } from "../apis";
import { COUNTRY_FILTER_TABS, type CountryFilter } from "../const";
import { fetchCountries, removeCountry } from "../store/countries-slice";
import type { CountrySummary } from "../apis/types";
import { CountryRow } from "./country-row";

const PAGE_SIZE = 20;

function StatCard({ label, value }: Readonly<{ label: string; value: number }>) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

export function CountriesView() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const { countries, meta, stats, status } = useAppSelector((state) => state.platformCountries);
  const [filter, setFilter] = useState<CountryFilter>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState<CountrySummary | null>(null);
  const [busy, setBusy] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const params = { page, limit: PAGE_SIZE, search: debouncedSearch || undefined, filter };

  const lastFetchKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = JSON.stringify(params);
    if (lastFetchKeyRef.current === key) return;
    lastFetchKeyRef.current = key;
    dispatch(fetchCountries(params));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch, page, filter, debouncedSearch]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(value);
      setPage(1);
    }, 300);
  };

  const handleFilterChange = (next: CountryFilter) => {
    setFilter(next);
    setPage(1);
  };

  const handleToggle = async (country: CountrySummary, field: "is_active" | "is_featured", value: boolean) => {
    try {
      await countriesApi.updateCountry(country.id, { [field]: value });
      dispatch(fetchCountries(params));
    } catch {
      toast.error("Couldn't update country", { description: "Please try again." });
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    const result = await dispatch(removeCountry(deleting.id));
    setBusy(false);
    if (result.meta.requestStatus === "rejected") {
      toast.error("Something went wrong", { description: "Please try again." });
      return;
    }
    toast.success("Country deleted");
    setDeleting(null);
    dispatch(fetchCountries(params));
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Globe className="h-6 w-6" /> Countries &amp; Cities
          </h1>
          <p className="mt-1 text-muted-foreground">Manage destination countries and their cities. Data powers public country/city pages.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="gap-1.5"
            onClick={() => toast.info("AI seeding isn't available yet", { description: "Add countries and cities manually for now." })}
          >
            <Sparkles className="h-4 w-4" /> Seed with AI
          </Button>
          <Button className="gap-1.5" onClick={() => router.push("/admin/platform/countries/new")}>
            <Plus className="h-4 w-4" /> Add Country
          </Button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-4">
        <StatCard label="Total Countries" value={stats.total} />
        <StatCard label="Active" value={stats.active} />
        <StatCard label="Featured" value={stats.featured} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search countries..." className="h-10 pl-9" value={search} onChange={(e) => handleSearchChange(e.target.value)} />
        </div>
        <AdminSegmentedTabs options={COUNTRY_FILTER_TABS} value={filter} onChange={handleFilterChange} className="mb-0" />
      </div>

      {status === "loading" && countries.length === 0 ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="rounded-lg border border-border">
          <div className="grid grid-cols-[2fr_0.8fr_1.3fr_1.2fr_0.7fr_0.7fr_0.9fr] gap-3 border-b border-border px-4 pb-2 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Country</span>
            <span>Code</span>
            <span>Cities</span>
            <span>Media</span>
            <span>Active</span>
            <span>Featured</span>
            <span className="text-right">Actions</span>
          </div>
          {countries.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No countries found.</p>
          ) : (
            countries.map((country) => (
              <CountryRow
                key={country.id}
                country={country}
                onToggle={(field, value) => handleToggle(country, field, value)}
                onEdit={() => router.push(`/admin/platform/countries/${country.id}/edit`)}
                onDelete={() => setDeleting(country)}
              />
            ))
          )}
        </div>
      )}

      {meta.total > 0 && <Pagination page={meta.page} total={meta.total} limit={meta.limit} onPageChange={setPage} />}

      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        name={deleting?.name ?? ""}
        onConfirm={handleConfirmDelete}
        deleting={busy}
      />
    </div>
  );
}
