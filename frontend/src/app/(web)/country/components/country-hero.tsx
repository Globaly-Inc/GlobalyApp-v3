import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCountryHeroImage } from "../hero-fallback";
import type { CountryDetail } from "../types";

export function CountryHero({ country }: Readonly<{ country: CountryDetail }>) {
  const hero = getCountryHeroImage(country);
  return (
    <section className="relative min-h-0 flex-1 overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={hero} alt={country.name} className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/50 to-black/80" />
      <div className="relative flex h-full flex-col items-center justify-center px-4 text-center text-white">
        <p className="mb-3 text-xs text-white/60 sm:mb-4 sm:text-sm">
          <Link href="/" className="hover:text-white">Home</Link> / Countries / {country.name}
        </p>
        <div className="mb-3 text-5xl drop-shadow-lg sm:mb-4 sm:text-6xl md:text-7xl">{country.flag_emoji ?? "🌍"}</div>
        <h1 className="mb-3 text-3xl font-bold sm:text-4xl md:text-5xl lg:text-6xl">Study in {country.name}</h1>
        <p className="mb-6 max-w-xl text-base text-white/80 sm:text-lg">
          {country.why_study_here ?? "Explore world-class education opportunities"}
        </p>
        <div className="flex w-full max-w-sm flex-col justify-center gap-3 sm:max-w-none sm:flex-row sm:flex-wrap">
          <Button
            className="h-10 w-full gap-1.5 shadow-lg sm:w-auto"
            render={<Link href={`/search?tab=courses&country=${encodeURIComponent(country.name)}`} />}
          >
            Browse Courses <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            className="h-10 w-full border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white sm:w-auto"
            render={<Link href={`/search?tab=institutions&country=${encodeURIComponent(country.name)}`} />}
          >
            Find Institutions
          </Button>
        </div>
      </div>
    </section>
  );
}
