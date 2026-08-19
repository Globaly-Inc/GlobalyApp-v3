import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal } from "../../components/reveal";
import type { Destination } from "../../data/destinations";
import { COUNTRY_FALLBACKS, FLAG_URL } from "../static-content";

export function DestinationsCarousel({ countries, loading }: Readonly<{ countries: Destination[]; loading: boolean }>) {
  return (
    <section className="py-16 bg-background">
      <div className="container mx-auto px-4">
        <Reveal>
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-8">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
                Explore <span className="highlight-text active">Study Destinations</span>
              </h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Whether studying domestic or international, explore universities, courses, costs, and scholarships to
                guide your academic path
              </p>
            </div>
          </div>
        </Reveal>

        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="flex-shrink-0 w-56 h-52 rounded-xl" />)
            : countries.map((country, idx) => {
                const fb = COUNTRY_FALLBACKS[country.name];
                return (
                  <Reveal key={country.id} delay={idx * 0.07} className="flex-shrink-0">
                    <Link
                      href={`/country/${country.slug}`}
                      className="group relative rounded-2xl overflow-hidden w-[200px] md:w-[220px] cursor-pointer block"
                    >
                      {/* h-[280px]/md:h-[300px] and the country photograph, both as live renders them. V3 had
                          shrunk the tile to 220px and dropped the photo for a flag emoji on a flat panel. */}
                      <div className="relative h-[280px] md:h-[300px]">
                        {country.heroImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={country.heroImageUrl}
                            alt={country.name}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full bg-muted flex items-center justify-center text-6xl">
                            {country.flagEmoji}
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                        {fb?.code && (
                          <div className="absolute top-3 left-3">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={FLAG_URL(fb.code)} alt={country.name} className="w-8 h-5 rounded shadow" />
                          </div>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2">
                          <p className="text-white font-semibold text-sm">{country.name}</p>
                        </div>
                      </div>
                      <div className="p-3 space-y-1">
                        {fb?.institutions && (
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Institutions</span>
                            <span className="font-semibold text-foreground">{fb.institutions}</span>
                          </div>
                        )}
                        {fb?.tuition && (
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Avg. Tuition</span>
                            <span className="font-semibold text-foreground text-right">{fb.tuition}</span>
                          </div>
                        )}
                        {fb?.living && (
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Living Cost</span>
                            <span className="font-semibold text-foreground text-right">{fb.living}</span>
                          </div>
                        )}
                      </div>
                    </Link>
                  </Reveal>
                );
              })}
        </div>
      </div>
    </section>
  );
}
