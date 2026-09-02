import Link from "next/link";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Reveal } from "../../components/reveal";
import type { SearchBusiness } from "../../search/types";

export function CountryInstitutions({
  countryName,
  institutions,
}: Readonly<{ countryName: string; institutions: SearchBusiness[] }>) {
  return (
    <Reveal>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold">Top Institutions in {countryName}</h2>
        <Button variant="outline" className="h-10" render={<Link href={`/search?tab=institutions&country=${encodeURIComponent(countryName)}`} />}>
          View All
        </Button>
      </div>
      {institutions.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {institutions.map((inst) => (
            <Card key={inst.id} className="relative transition-shadow hover:shadow-md">
              {inst.slug && (
                <Link href={`/institution/${inst.slug}`} target = "_blank" className="absolute inset-0 z-10" aria-label={inst.business_name} />
              )}
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted">
                  {inst.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={inst.logo_url} alt={inst.business_name} className="h-full w-full rounded-lg object-contain p-1" />
                  ) : (
                    <Building2 className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{inst.business_name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[inst.city, inst.country_name].filter(Boolean).join(", ")}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
          <Building2 className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No institutions listed yet for {countryName}</p>
          <Button variant="outline" className="h-10" render={<Link href="/search?tab=institutions" />}>
            Browse All Institutions
          </Button>
        </div>
      )}
    </Reveal>
  );
}
