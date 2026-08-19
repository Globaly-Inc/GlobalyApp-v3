import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { safeUrl } from "@/lib/safe-url";
import type { CityDetail } from "../types";

export function CityHero({ city }: Readonly<{ city: CityDetail }>) {
  const heroImage = safeUrl(city.hero_image_url);

  return (
    <section className="relative h-[440px] overflow-hidden">
      {heroImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={heroImage} alt={city.name} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/40 to-primary/10" />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/50 to-black/80" />
      <div className="relative flex h-full flex-col items-center justify-center px-4 text-center text-white">
        <div className="mb-4 flex items-center gap-2 text-sm text-white/60">
          <Link href="/" className="hover:text-white">Home</Link>
          <ChevronRight className="h-3 w-3" />
          <Link href={`/country/${city.country.slug}`} className="hover:text-white">
            {city.country.flag_emoji} {city.country.name}
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span>{city.name}</span>
        </div>
        <h1 className="mb-3 text-4xl font-bold md:text-6xl">{city.name}</h1>
        <p className="mb-2 max-w-xl text-lg text-white/80">{city.country.name} · Study Destination</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <Button className="h-10 gap-1.5 shadow-lg" render={<Link href={`/search?tab=courses&country=${encodeURIComponent(city.country.name)}&city=${encodeURIComponent(city.name)}`} />}>
            Browse Courses <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-10 border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
            render={<Link href={`/search?tab=institutions&country=${encodeURIComponent(city.country.name)}&city=${encodeURIComponent(city.name)}`} />}
          >
            Find Institutions
          </Button>
        </div>
      </div>
    </section>
  );
}
