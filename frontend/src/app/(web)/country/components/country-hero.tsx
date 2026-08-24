import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCountryHeroImage } from "../hero-fallback";
import type { CountryDetail } from "../types";

export function CountryHero({ country }: Readonly<{ country: CountryDetail }>) {
  const hero = getCountryHeroImage(country);
  return (
    <section className="relative h-[480px] overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={hero} alt={country.name} className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/50 to-black/80" />
      <div className="relative flex h-full flex-col items-center justify-center px-4 text-center text-white">
        <div className="mb-4 flex items-center gap-2 text-sm text-white/60">
          <Link href="/" className="transition-colors hover:text-white">
            Home
          </Link>
          <span>/</span>
          <span className="text-white/80">Countries</span>
          <span>/</span>
          <span>{country.name}</span>
        </div>
        <span className="mb-4 text-7xl drop-shadow-lg">{country.flag_emoji ?? "🌍"}</span>
        <h1 className="mb-3 text-4xl font-bold md:text-6xl">Study in {country.name}</h1>
        <p className="mb-6 max-w-xl text-lg text-white/80">
          {country.why_study_here ?? "Explore world-class education opportunities"}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button
            size="lg"
            className="gap-1.5 shadow-lg"
            render={<Link href={`/search?tab=courses&country=${encodeURIComponent(country.name)}`} />}
          >
            Browse Courses <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="border-white bg-transparent text-white hover:bg-white/10 hover:text-white"
            render={<Link href={`/search?tab=institutions&country=${encodeURIComponent(country.name)}`} />}
          >
            Find Institutions
          </Button>
        </div>
      </div>
    </section>
  );
}
