import Link from "next/link";
import { ArrowRight, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold">Top Institutions in {countryName}</h2>
        <Button
          variant="outline"
          className="h-10 gap-1.5"
          render={<Link href={`/search?tab=institutions&country=${encodeURIComponent(countryName)}`} />}
        >
          View All <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
      {institutions.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {institutions.map((inst) => (
            <Link key={inst.id} href={`/institution/${inst.slug ?? inst.id}`}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted">
                    {inst.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={inst.logo_url}
                        alt={inst.business_name}
                        className="h-full w-full rounded-lg object-contain p-1"
                      />
                    ) : (
                      <Building2 className="h-6 w-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{inst.business_name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[inst.city, inst.country_name].filter(Boolean).join(", ")}
                    </p>
                    <Badge variant="secondary" className="mt-1 text-xs">
                      {inst.service_count ?? 0} services
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
          <Building2 className="h-12 w-12 opacity-30" />
          <p>No institutions listed yet for {countryName}</p>
          <Button variant="outline" className="h-10" render={<Link href="/search?tab=institutions" />}>
            Browse All Institutions
          </Button>
        </div>
      )}
    </Reveal>
  );
}
