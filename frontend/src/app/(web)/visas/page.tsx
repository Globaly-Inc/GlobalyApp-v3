import Link from "next/link";
import type { Metadata } from "next";
import { Plane, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { searchVisas } from "./api";
import { VisaCard } from "./components/visa-card";

export const metadata: Metadata = {
  title: "Visas — Globaly",
  description: "Browse visa subclasses by country, category and stream.",
};

function filterHref(q: string, country: string, category: string) {
  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  if (country) qs.set("country", country);
  if (category) qs.set("category", category);
  const s = qs.toString();
  return s ? `/visas?${s}` : "/visas";
}

export default async function VisasPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ q?: string; country?: string; category?: string }> }>) {
  const { q = "", country = "", category = "" } = await searchParams;

  // The backend has no facets endpoint for visas (V1 had none either — its pages
  // built the filter lists client-side from the same result set), so the sidebar
  // is derived from an unfiltered sample of the one list endpoint.
  const [visas, all] = await Promise.all([
    searchVisas({
      q: q || undefined,
      country: country || undefined,
      category: category || undefined,
    }),
    searchVisas({ q: q || undefined, limit: 100 }),
  ]);

  const countries = [...new Set(all.map((v) => v.country_code).filter(Boolean))].sort();
  const categories = [...new Set(all.map((v) => v.category).filter((c): c is string => !!c))].sort();

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2">
          <Plane className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">Visas</h1>
        </div>
        <p className="text-muted-foreground">
          {visas.length} visa subclass{visas.length !== 1 ? "es" : ""} published by immigration
          departments.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-4">
          <form action="/visas" className="rounded-xl border border-border bg-card p-4">
            <label htmlFor="visa-q" className="mb-2 block text-sm font-semibold text-foreground">
              Search
            </label>
            <div className="flex gap-2">
              <input
                id="visa-q"
                name="q"
                defaultValue={q}
                placeholder="Name or subclass"
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              />
              <Button type="submit" size="sm" aria-label="Search visas">
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </form>

          <FilterList
            title="Country"
            options={countries}
            selected={country}
            hrefFor={(value) => filterHref(q, value, category)}
          />
          <FilterList
            title="Category"
            options={categories}
            selected={category}
            hrefFor={(value) => filterHref(q, country, value)}
          />
        </aside>

        <div className="space-y-3">
          {visas.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card py-16 text-center text-sm text-muted-foreground">
              No visas match these filters.
            </div>
          ) : (
            visas.map((visa) => <VisaCard key={visa.service_id} visa={visa} />)
          )}
        </div>
      </div>
    </div>
  );
}

function FilterList({
  title,
  options,
  selected,
  hrefFor,
}: Readonly<{
  title: string;
  options: string[];
  selected: string;
  hrefFor: (value: string) => string;
}>) {
  if (options.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold text-foreground">{title}</h3>
      <div className="max-h-96 space-y-1 overflow-y-auto">
        <Link
          href={hrefFor("")}
          scroll={false}
          className={`block rounded px-2 py-1 text-sm hover:bg-muted ${!selected ? "bg-muted font-medium text-foreground" : "text-muted-foreground"}`}
        >
          All
        </Link>
        {options.map((option) => (
          <Link
            key={option}
            href={hrefFor(option)}
            scroll={false}
            className={`block rounded px-2 py-1 text-sm hover:bg-muted ${selected === option ? "bg-muted font-medium text-foreground" : "text-muted-foreground"}`}
          >
            {option}
          </Link>
        ))}
      </div>
    </div>
  );
}
