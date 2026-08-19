import { redirect } from "next/navigation";

/** Scholarships now live as a tab on the unified /search page, matching Jobs/Courses/etc. */
export default async function ScholarshipsRedirectPage({
  searchParams,
}: Readonly<{ searchParams: Promise<Record<string, string | undefined>> }>) {
  const params = await searchParams;
  const qs = new URLSearchParams({ tab: "scholarships" });
  if (params.q) qs.set("search", params.q);
  if (params.country) qs.set("country", params.country);
  if (params.basis) qs.set("basis", params.basis);
  if (params.degreeLevel) qs.set("degree_level", params.degreeLevel);
  redirect(`/search?${qs.toString()}`);
}
