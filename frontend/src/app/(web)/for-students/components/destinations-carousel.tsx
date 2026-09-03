import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Money } from "../../components/money";
import { Reveal } from "../../components/reveal";
import { AutoScrollRow } from "../../components/auto-scroll-row";
import type { Destination } from "../../data/destinations";
import { COUNTRY_FALLBACKS, FLAG_URL } from "../static-content";

/**
 * Live tuition range when the country row has one, otherwise the static per-country fallback.
 * The live range goes through <Money> so it follows the navbar currency; the fallback is a
 * pre-formatted string with no amount to convert.
 */
function TuitionLabel({ country, fallback }: Readonly<{ country: Destination; fallback?: string }>) {
  const { tuitionMin, tuitionMax } = country;
  if (tuitionMin && tuitionMax) {
    return <Money amount={tuitionMin} to={tuitionMax} currency={country.tuitionCurrency ?? "USD"} />;
  }
  return fallback ?? "";
}

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
                Whether Studying domestic or international, explore Universities, Courses, costs, and scholarships to
                guide your academic path
              </p>
            </div>
          </div>
        </Reveal>

        <AutoScrollRow className="flex gap-4 pb-4">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="flex-shrink-0 w-56 h-52 rounded-xl" />)
            : countries.map((country, idx) => {
                const fb = COUNTRY_FALLBACKS[country.name];
                const countryCode = country.code ?? fb?.code ?? "";
                // A count with nothing behind it is 0, not unknown — unlike the two cost rows below.
                const institutionCount = country.institutionsLabel ?? fb?.institutions ?? "0";
                const tuition = <TuitionLabel country={country} fallback={fb?.tuition} />;
                const livingStr = country.livingCostLabel ?? fb?.living ?? "";
                return (
                  <Reveal key={country.id} delay={idx * 0.07} className="flex-shrink-0">
                    <Link
                      href={`/country/${country.slug}`}
                      className="group relative rounded-2xl overflow-hidden border border-border bg-card shadow-sm transition-shadow duration-300 hover:shadow-lg w-[200px] md:w-[220px] cursor-pointer flex flex-col h-full"
                    >
                      <div className="relative h-[280px] md:h-[300px] overflow-hidden rounded-t-2xl">
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
                        {countryCode && (
                          <div className="absolute top-3 left-3">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={FLAG_URL(countryCode)}
                              alt={country.name}
                              className="w-8 h-5 rounded shadow"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = "none";
                              }}
                            />
                          </div>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-3 py-2">
                          <p className="text-white font-semibold text-sm">{country.name}</p>
                        </div>
                      </div>
                      <div className="p-3 space-y-1 flex-1">
                        {/* Every card carries all three rows so cards keep a uniform height. The two
                            cost rows keep a dash when empty: "0" there would read as "free", which is
                            a claim, whereas an institution count of 0 is simply the truth. */}
                        {[
                          { label: "Institutions", value: institutionCount },
                          { label: "Avg. Tuition", value: tuition },
                          { label: "Living Cost", value: livingStr },
                        ].map((stat) => (
                          <div key={stat.label} className="flex justify-between text-xs">
                            <span className="text-muted-foreground">{stat.label}</span>
                            <span className="font-semibold text-foreground text-right">{stat.value || "—"}</span>
                          </div>
                        ))}
                      </div>
                    </Link>
                  </Reveal>
                );
              })}
        </AutoScrollRow>
      </div>
    </section>
  );
}
