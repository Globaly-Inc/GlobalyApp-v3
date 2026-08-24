import Link from "next/link";
import { MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "../../components/reveal";
import { AutoScrollRow } from "../../components/auto-scroll-row";
import { getCityFallbackImage } from "../hero-fallback";
import type { CountryDetail } from "../types";

export function CountryCities({ country }: Readonly<{ country: CountryDetail }>) {
  const cities = country.cities;
  if (cities.length === 0) return null;

  return (
    <Reveal>
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold">Cities &amp; Places</h2>
        <Badge variant="secondary">{cities.length} cities</Badge>
      </div>
      <AutoScrollRow className="flex gap-4 pb-3">
        {cities.map((city) => {
          const image = city.thumbnail_image_url ?? city.hero_image_url ?? getCityFallbackImage(city.id);
          return (
            <Link key={city.id} href={`/city/${country.slug}/${city.slug}`} className="flex-shrink-0">
              <div className="group w-52">
                <div className="relative h-32 overflow-hidden rounded-xl bg-muted">
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={image}
                      alt={city.name}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <MapPin className="h-8 w-8 text-muted-foreground opacity-30" />
                    </div>
                  )}
                  {city.is_featured && (
                    <div className="absolute top-2 left-2">
                      <Badge className="text-xs">Featured</Badge>
                    </div>
                  )}
                </div>
                <div className="mt-2 px-1">
                  <p className="text-sm font-semibold">{city.name}</p>
                  {city.population_label && (
                    <p className="text-xs text-muted-foreground">Pop. {city.population_label}</p>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </AutoScrollRow>
    </Reveal>
  );
}
