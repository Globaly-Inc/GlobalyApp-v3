import type { Metadata } from "next";
import { SearchView, type SearchViewParams } from "@/app/(web)/search/search-view";
import { CompareTray } from "@/app/(web)/search/components/compare-tray";

export const metadata: Metadata = { title: "Explore — Globaly" };

/**
 * The public /search surface, pointed back at this route so searching, filtering and paging keep the
 * user inside the portal shell.
 *
 * The tray is mounted here rather than in the portal layout because /personal/ai mounts its own — one
 * per surface, never two on a page. It is offset to clear the shell's AI launcher and mobile nav.
 */
export default async function ExplorePage({
  searchParams,
}: Readonly<{ searchParams: Promise<SearchViewParams> }>) {
  return (
    <>
      <SearchView params={await searchParams} basePath="/personal/explore" />
      <CompareTray positionClass="bottom-36 right-4 md:bottom-20" />
    </>
  );
}
