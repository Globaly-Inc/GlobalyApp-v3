import Link from "next/link";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CountryInstitutions({ countryName }: Readonly<{ countryName: string }>) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold">Top Institutions in {countryName}</h2>
        <Button variant="outline" className="h-10" render={<Link href={`/search?tab=institutions&country=${encodeURIComponent(countryName)}`} />}>
          View All
        </Button>
      </div>
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center">
        <Building2 className="h-10 w-10 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">No institutions listed yet for {countryName}</p>
        <Button variant="outline" className="h-10" render={<Link href="/search?tab=institutions" />}>
          Browse All Institutions
        </Button>
      </div>
    </div>
  );
}
