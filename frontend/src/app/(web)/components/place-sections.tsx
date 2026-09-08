import Link from "next/link";
import { ArrowRight, Briefcase, Building2, GraduationCap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { amountLabel } from "@/lib/utils";
import { Reveal } from "./reveal";
import type { SearchBusiness, SearchCourse } from "../search/types";

/**
 * The listing strips shared by the country and city detail pages — same cards either way, only
 * the place name and the search scope change. One copy, because the two pages drifted apart the
 * last time each owned its own version.
 */
type PlaceScope = "country" | "city";
type PlaceProps = Readonly<{
  placeName: string;
  scope: PlaceScope;
  /** City scope only: the country the city sits in, so the search lands on both filters. */
  countryName?: string;
}>;

/**
 * A city link carries `country` as well as `city` — same as the city hero's buttons. City names
 * repeat across countries (Newcastle, Perth), so city alone can widen the result set instead of
 * narrowing it.
 */
const searchHref = (tab: string, { placeName, scope, countryName }: PlaceProps) => {
  const qs = new URLSearchParams({ tab });
  if (scope === "city") {
    if (countryName) qs.set("country", countryName);
    qs.set("city", placeName);
  } else {
    qs.set("country", placeName);
  }
  return `/search?${qs}`;
};

function SectionHeader({
  title,
  href,
  label = "View All",
  withArrow = true,
}: Readonly<{ title: string; href: string; label?: string; withArrow?: boolean }>) {
  return (
    <div className="mb-6 flex items-center justify-between gap-3">
      <h2 className="text-2xl font-bold">{title}</h2>
      <Button variant="outline" className="h-10 shrink-0" render={<Link href={href} />}>
        {label} {withArrow && <ArrowRight className="h-4 w-4" />}
      </Button>
    </div>
  );
}

function BusinessTile({ business, href }: Readonly<{ business: SearchBusiness; href?: string }>) {
  const Icon = href ? Building2 : Briefcase;
  return (
    <Card className="relative transition-shadow hover:shadow-md">
      {href && <Link href={href} target="_blank" className="absolute inset-0 z-10" aria-label={business.business_name} />}
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted">
          {business.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={business.logo_url} alt={business.business_name} className="h-full w-full rounded-lg object-contain p-1" />
          ) : (
            <Icon className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{business.business_name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[business.city, business.country_name].filter(Boolean).join(", ")}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function PlaceInstitutions({
  placeName,
  scope,
  countryName,
  institutions,
}: PlaceProps & Readonly<{ institutions: SearchBusiness[] }>) {
  return (
    <Reveal>
      <SectionHeader
        title={`Top Institutions in ${placeName}`}
        href={searchHref("institutions", { placeName, scope, countryName })}
        withArrow={false}
      />
      {institutions.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {institutions.map((inst) => (
            <BusinessTile
              key={inst.id}
              business={inst}
              href={inst.slug ? `/institution/${inst.slug}` : undefined}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
          <Building2 className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No institutions listed yet for {placeName}</p>
          <Button variant="outline" className="h-10" render={<Link href="/search?tab=institutions" />}>
            Browse All Institutions
          </Button>
        </div>
      )}
    </Reveal>
  );
}

export function PlaceServices({ placeName, scope, countryName, courses }: PlaceProps & Readonly<{ courses: SearchCourse[] }>) {
  if (courses.length === 0) return null;

  return (
    <Reveal>
      <SectionHeader title={`Popular Services in ${placeName}`} href={searchHref("courses", { placeName, scope, countryName })} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {courses.map((course) => (
          <Link key={course.id} href={`/course/${course.slug}`}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardContent className="p-4">
                <div className="mb-2 flex items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-primary" />
                  <span className="truncate text-xs text-muted-foreground">{course.awarding_institution}</span>
                </div>
                <p className="text-sm font-semibold">{course.name}</p>
                <div className="mt-2 flex items-center gap-2">
                  {course.subject_area && <Badge variant="outline" className="text-xs">{course.subject_area}</Badge>}
                  {course.international_fee_total && (
                    <span className="text-xs text-muted-foreground">
                      {amountLabel(course.international_fee_total, course.international_currency)}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </Reveal>
  );
}

export function PlaceCounselors({ placeName, scope, countryName, agents }: PlaceProps & Readonly<{ agents: SearchBusiness[] }>) {
  if (agents.length === 0) return null;

  return (
    <Reveal>
      <SectionHeader
        title={`Top Education Counselors for ${placeName}`}
        href={searchHref("education-agencies", { placeName, scope, countryName })}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent) => (
          <BusinessTile key={agent.id} business={agent} />
        ))}
      </div>
    </Reveal>
  );
}
