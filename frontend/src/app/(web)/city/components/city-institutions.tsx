import Link from "next/link";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getInstitutions } from "../../search/api";
import { BusinessCard } from "../../search/components/business-card";

export async function CityInstitutions({ cityName }: Readonly<{ cityName: string }>) {
  const { data: institutions } = await getInstitutions({ city: cityName }).catch(() => ({ data: [] }));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold">Institutions in {cityName}</h2>
        <Button variant="outline" className="h-10" render={<Link href={`/search?tab=institutions&city=${encodeURIComponent(cityName)}`} />}>
          View All
        </Button>
      </div>
      {institutions.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {institutions.map((inst) => (
            <BusinessCard key={inst.id} business={inst} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
          <Building2 className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No institutions listed in {cityName} yet.</p>
          <Button variant="outline" className="h-10" render={<Link href="/search?tab=institutions" />}>
            Browse All Institutions
          </Button>
        </div>
      )}
    </div>
  );
}
