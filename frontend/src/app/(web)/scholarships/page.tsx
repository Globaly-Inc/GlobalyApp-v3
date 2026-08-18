import Link from "next/link";
import type { Metadata } from "next";
import { GraduationCap, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getScholarships } from "./api";
import { ScholarshipCard } from "./components/scholarship-card";

export const metadata: Metadata = {
  title: "Scholarships — Globaly",
  description: "Browse scholarships from universities, governments, and foundations worldwide.",
};

function filterHref(q: string, country: string) {
  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  if (country) qs.set("country", country);
  const s = qs.toString();
  return s ? `/scholarships?${s}` : "/scholarships";
}

export default async function ScholarshipsPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ q?: string; country?: string; page?: string }> }>) {
  const { q = "", country = "", page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);

  // No dedicated facets endpoint (out of scope) — derive the country sidebar from an
  // unfiltered-by-country sample of the same list endpoint instead of a second one.
  const [{ data: scholarships, meta }, { data: allForCountries }] = await Promise.all([
    getScholarships({ page, q: q || undefined, country: country || undefined }),
    getScholarships({ q: q || undefined, limit: 100 }),
  ]);

  const countryCounts = new Map<string, number>();
  for (const s of allForCountries) {
    if (s.country) countryCounts.set(s.country, (countryCounts.get(s.country) ?? 0) + 1);
  }
  const countries = [...countryCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <GraduationCap className="h-6 w-6 text-primary" />
          <h1 className="text-3xl font-bold text-foreground">Scholarships</h1>
        </div>
        <p className="text-muted-foreground">
          Browse {meta.total} scholarship{meta.total !== 1 ? "s" : ""} from universities, governments, and foundations worldwide.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        <aside className="space-y-1">
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="font-semibold text-sm mb-3 text-foreground">Country</h3>
            <div className="space-y-1 max-h-96 overflow-y-auto">
              <Link
                href={filterHref(q, "")}
                scroll={false}
                className={`block px-2 py-1 text-sm rounded hover:bg-muted ${!country ? "bg-muted font-medium text-foreground" : "text-muted-foreground"}`}
              >
                All countries
              </Link>
              {countries.map(([name, count]) => (
                <Link
                  key={name}
                  href={filterHref(q, name)}
                  scroll={false}
                  className={`flex justify-between items-center px-2 py-1 text-sm rounded hover:bg-muted ${country === name ? "bg-muted font-medium text-foreground" : "text-muted-foreground"}`}
                >
                  <span>{name}</span>
                  <span className="text-xs text-muted-foreground">{count}</span>
                </Link>
              ))}
            </div>
          </div>
        </aside>

        <div className="space-y-4">
          <form action="/scholarships" method="GET" className="relative">
            {country && <input type="hidden" name="country" value={country} />}
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Search scholarships by title or provider…"
              className="w-full h-10 pl-9 pr-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </form>

          {scholarships.length === 0 ? (
            <div className="text-center py-20 rounded-xl border border-border bg-card">
              <GraduationCap className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground text-lg">No scholarships match your filters.</p>
              <Link href="/scholarships" className="mt-3 inline-block text-sm text-primary hover:underline">
                Clear filters
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {scholarships.map((s) => (
                <ScholarshipCard key={s.id} scholarship={s} />
              ))}
            </div>
          )}

          {meta.totalPages > 1 && (
            <nav aria-label="Scholarships pagination" className="flex items-center justify-center gap-2 pt-4">
              {page > 1 ? (
                <Link href={{ pathname: "/scholarships", query: { q, country, page: page - 1 } }} scroll={false}>
                  <Button variant="outline" size="sm">← Previous</Button>
                </Link>
              ) : (
                <Button variant="outline" size="sm" disabled>← Previous</Button>
              )}
              <span className="text-sm text-muted-foreground px-2">Page {page} of {meta.totalPages}</span>
              {page < meta.totalPages ? (
                <Link href={{ pathname: "/scholarships", query: { q, country, page: page + 1 } }} scroll={false}>
                  <Button variant="outline" size="sm">Next →</Button>
                </Link>
              ) : (
                <Button variant="outline" size="sm" disabled>Next →</Button>
              )}
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
