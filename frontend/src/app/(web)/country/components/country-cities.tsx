import Link from "next/link";
import { MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { CountryDetail } from "../types";

export function CountryCities({ country }: Readonly<{ country: CountryDetail }>) {
  if (country.cities.length === 0) return null;

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <h2 className="text-2xl font-bold">Cities &amp; Places</h2>
        <Badge variant="secondary">{country.cities.length} cities</Badge>
      </div>
      <div className="scrollbar-thin flex gap-4 overflow-x-auto pb-3">
        {country.cities.map((city) => {
          const image = city.thumbnail_image_url ?? city.hero_image_url ?? country.hero_image_url;
          return (
            <Link key={city.id} href={`/city/${country.slug}/${city.slug}`} className="group w-52 shrink-0">
              <div className="relative h-32 overflow-hidden rounded-xl bg-muted">
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={image} alt={city.name} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <MapPin className="h-8 w-8 text-muted-foreground/40" />
                  </div>
                )}
                {city.is_featured && <Badge className="absolute top-2 left-2">Featured</Badge>}
              </div>
              <p className="mt-2 text-sm font-semibold">{city.name}</p>
              {city.population_label && <p className="text-xs text-muted-foreground">Pop. {city.population_label}</p>}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
