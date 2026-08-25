import type { Metadata } from "next";
import { Search as SearchIcon } from "lucide-react";
import { SearchView, type SearchViewParams } from "./search-view";

export const metadata: Metadata = {
  title: "Search Courses, Institutions & Jobs — Globaly",
  description: "Search verified courses, institutions, agencies, visa services, and student jobs worldwide.",
};

type SearchPageProps = Readonly<{ searchParams: Promise<SearchViewParams> }>;

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;

  return (
    <div>
      <section className="bg-linear-to-br from-primary/5 via-background to-primary/10 py-12 border-b border-border">
        <div className="container max-w-6xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <SearchIcon className="h-6 w-6 text-primary" />
            <span className="text-sm font-medium text-primary uppercase tracking-widest">Search Globaly</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground">
            Find Your Path Abroad{params.country ? ` in ${params.country}` : ""}
          </h1>
        </div>
      </section>

      <SearchView params={params} />
    </div>
  );
}
