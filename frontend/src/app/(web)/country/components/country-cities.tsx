import type { CSSProperties } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "../../components/reveal";
import { getCityFallbackImage } from "../hero-fallback";
import type { CountryDetail } from "../types";

const SECONDS_PER_CITY = 7; // ~40px/s at these tile widths, regardless of how many cities there are

function CityTile({
  city,
  countrySlug,
  clone,
}: Readonly<{ city: CountryDetail["cities"][number]; countrySlug: string; clone: boolean }>) {
  const image = city.thumbnail_image_url ?? city.hero_image_url ?? getCityFallbackImage(city.id);
  return (
    <Link
      href={`/city/${countrySlug}/${city.slug}`}
      aria-hidden={clone || undefined}
      tabIndex={clone ? -1 : undefined}
      // mr-4, not the parent's gap: the track must be perfectly periodic for the -50% loop.
      className="relative mr-4 h-56 w-52 shrink-0 overflow-hidden rounded-2xl bg-muted shadow-sm sm:h-72 sm:w-64"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt="" className="h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center px-4 pb-5 text-center text-white">
        <p className="text-sm font-bold drop-shadow-sm sm:text-base">{city.name}</p>
        {city.population_label && <p className="mt-1 text-xs text-white/85 drop-shadow-sm">Pop. {city.population_label}</p>}
      </div>
      {city.is_featured && <Badge className="absolute top-1 left-1/2 -translate-x-1/2">Featured</Badge>}
    </Link>
  );
}

export function CountryCities({ country }: Readonly<{ country: CountryDetail }>) {
  const cities = [...country.cities].sort((a, b) => Number(b.is_featured) - Number(a.is_featured));
  if (cities.length === 0) return null;

  // CSS marquee rather than a scroll container nudged from JS: no rAF, no measuring, and it
  // cannot silently stall the way fractional scrollLeft writes do. Hover pauses it (see
  // .animate-marquee-x), and the row is rendered twice so the wrap is invisible.
  const track = [...cities, ...cities];

  return (
    <Reveal>
      <div className="mb-6 flex items-center gap-2.5">
        <h2 className="text-2xl font-bold">Cities &amp; Places</h2>
        <Badge variant="secondary">{cities.length} cities</Badge>
      </div>

      {/* marquee-viewport: under prefers-reduced-motion the animation stops, and globals.css
          turns this back into a real horizontal scroller so the cities past the fold stay
          reachable instead of being clipped by overflow-hidden. */}
      <div className="marquee-viewport -mx-4 overflow-hidden px-4 pb-3">
        <div
          className="animate-marquee-x flex w-max"
          style={{ "--marquee-duration": `${cities.length * SECONDS_PER_CITY}s` } as CSSProperties}
        >
          {track.map((city, i) => (
            <CityTile
              key={`${city.id}-${i >= cities.length ? "clone" : "real"}`}
              city={city}
              countrySlug={country.slug}
              clone={i >= cities.length}
            />
          ))}
        </div>
      </div>
    </Reveal>
  );
}
