import type { Metadata } from "next";
import { SearchView, type SearchViewParams } from "./search-view";

export const metadata: Metadata = {
  title: "Search Courses, Institutions & Jobs — Globaly",
  description: "Search verified courses, institutions, agencies, visa services, and student jobs worldwide.",
};

type SearchPageProps = Readonly<{ searchParams: Promise<SearchViewParams> }>;

/** V1 opens straight on the sticky search header, with no hero above it — so the view is the page. */
export default async function SearchPage({ searchParams }: SearchPageProps) {
  return <SearchView params={await searchParams} />;
}
