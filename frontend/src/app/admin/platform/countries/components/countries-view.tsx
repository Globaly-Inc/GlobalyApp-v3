"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Globe, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar, SearchInput } from "@/components/ui/filter-bar";
import { ListSkeleton } from "@/components/ui/list-skeleton";
import { PageBody } from "@/components/ui/page-body";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Table, TableBody, TableCard, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { SectionTabs } from "@/components/section-tabs";
import { ConfirmDeleteDialog } from "../../../components/confirm-delete-dialog";
import { countriesApi } from "../apis";
import { COUNTRY_FILTER_TABS, type CountryFilter } from "../const";
import { fetchCountries, removeCountry } from "../store/countries-slice";
import type { CountrySummary } from "../apis/types";
import { COUNTRY_COLUMNS, CountryRow } from "./country-row";

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
    <PageBody>
      <PageHeader
        title={<><Globe /> Countries &amp; Cities</>}
        subtitle="Manage destination countries and their cities. Data powers public country/city pages."
      >
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
      </PageHeader>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Countries" value={stats.total} />
        <StatCard label="Active" value={stats.active} />
        <StatCard label="Featured" value={stats.featured} />
      </div>

      <SectionTabs options={COUNTRY_FILTER_TABS} value={filter} onChange={handleFilterChange} />

      <FilterBar>
        <SearchInput placeholder="Search countries..." value={search} onChange={(e) => handleSearchChange(e.target.value)} />
        <span className="shrink-0 px-2 text-sm text-muted-foreground">
          {meta.total} countr{meta.total === 1 ? "y" : "ies"}
        </span>
      </FilterBar>

      {status === "loading" && countries.length === 0 && <ListSkeleton count={6} itemClassName="h-14" />}
      {status !== "loading" && countries.length === 0 && (
        <EmptyState icon={Globe} title="No countries found." description={debouncedSearch ? "Try a different search." : undefined} />
      )}
      {countries.length > 0 && (
        // ponytail: overflow visible so the cities popover isn't clipped by the table's scroll box;
        // narrow screens drop columns instead of scrolling sideways.
        <TableCard className="overflow-visible [&>[data-slot=table-container]]:overflow-visible [&_th:first-child]:rounded-tl-lg [&_th:last-child]:rounded-tr-lg">
          <Table>
            <TableHeader>
              <TableRow>
                {COUNTRY_COLUMNS.map((col) => (
                  <TableHead key={col.label} className={"className" in col ? col.className : undefined}>
                    {"srOnly" in col ? <span className="sr-only">{col.label}</span> : col.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {countries.map((country) => (
                <CountryRow
                  key={country.id}
                  country={country}
                  onToggle={(field, value) => handleToggle(country, field, value)}
                  onEdit={() => router.push(`/admin/platform/countries/${country.id}/edit`)}
                  onDelete={() => setDeleting(country)}
                />
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}

      {meta.total > 0 && <Pagination page={meta.page} total={meta.total} limit={meta.limit} onPageChange={setPage} />}

      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        name={deleting?.name ?? ""}
        onConfirm={handleConfirmDelete}
        deleting={busy}
      />
    </PageBody>
  );
}
