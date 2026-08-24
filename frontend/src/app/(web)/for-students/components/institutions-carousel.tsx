import Link from "next/link";
import { ArrowRight, Building, MapPin } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal } from "../../components/reveal";
import { AutoScrollRow } from "../../components/auto-scroll-row";
import type { SearchBusiness } from "../../search/types";

export function InstitutionsCarousel({ institutions, loading }: Readonly<{ institutions: SearchBusiness[]; loading: boolean }>) {
  return (
    <section className="py-16 bg-muted/30">
      <div className="container mx-auto px-4">
        <Reveal>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground">
              Get Access To <span className="highlight-text active">Institutions Across the Globe</span>
            </h2>
            <Link href="/search?tab=institutions" className="text-sm text-primary font-medium flex items-center gap-1 hover:underline shrink-0 ml-4">
              Explore more <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </Reveal>

        <AutoScrollRow className="flex gap-4 pb-4">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="flex-shrink-0 w-48 h-56 rounded-xl" />)
            : institutions.map((inst, idx) => {
                const location = [inst.city, inst.country_name].filter(Boolean).join(", ");
                return (
                  <Reveal key={inst.id} delay={idx * 0.07} className="flex-shrink-0">
                    <Link
                      href={`/institution/${inst.slug}`}
                      className="group block w-44 md:w-48 bg-background border border-border rounded-xl p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="aspect-square rounded-lg overflow-hidden bg-muted mb-3 flex items-center justify-center p-2">
                        {inst.logo_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={inst.logo_url} alt={inst.business_name} className="w-full h-full object-contain transition-transform group-hover:scale-105" />
                        ) : (
                          <Building className="h-8 w-8 text-muted-foreground" />
                        )}
                      </div>
                      <h3 className="font-semibold text-sm line-clamp-1 mb-1">{inst.business_name}</h3>
                      {location && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-2">
                          <MapPin className="h-2.5 w-2.5" />
                          <span className="line-clamp-1">{location}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between mt-auto pt-2 border-t border-border/50">
                        <span className="text-[10px] font-medium text-primary uppercase tracking-wider">
                          {inst.course_count || 0} courses
                        </span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground group-hover:text-primary transition-colors" />
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
