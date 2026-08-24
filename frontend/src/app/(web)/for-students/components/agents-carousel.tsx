import Link from "next/link";
import { ArrowRight, MapPin, UserCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal } from "../../components/reveal";
import type { SearchBusiness } from "../../search/types";

// V2 links each card to /agent/:slug; v3 has no agent detail route yet, so cards point at the
// education-agencies tab of /search instead (the real tab key — not "agents", see search/types.ts).
export function AgentsCarousel({ agents, loading }: Readonly<{ agents: SearchBusiness[]; loading: boolean }>) {
  return (
    <section className="py-16 bg-muted/30">
      <div className="container mx-auto px-4">
        <Reveal className="text-center mb-12">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3">
            Get Guidance from <span className="highlight-text active">Verified Professionals</span>
          </h2>
          <p className="text-muted-foreground text-sm max-w-xl mx-auto">
            Connect with trust-scored and certified education consultants who will guide you every step of the way
          </p>
        </Reveal>

        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="flex-shrink-0 w-64 h-48 rounded-xl" />)
            : agents.map((agent, idx) => {
                const location = [agent.city, agent.country_name].filter(Boolean).join(", ");
                return (
                  <Reveal key={agent.id} delay={idx * 0.07} className="flex-shrink-0">
                    <Link
                      href="/search?tab=education-agencies"
                      className="group block w-60 md:w-64 bg-background border border-border rounded-xl p-5 hover:shadow-md transition-shadow h-full flex flex-col"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted flex items-center justify-center p-1.5 border border-border/50">
                          {agent.logo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={agent.logo_url} alt={agent.business_name} className="w-full h-full object-contain" />
                          ) : (
                            <Users className="h-6 w-6 text-muted-foreground" />
                          )}
                        </div>
                        <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50 border-emerald-100 flex items-center gap-1 text-[10px]">
                          <UserCheck className="h-2.5 w-2.5" /> Verified
                        </Badge>
                      </div>
                      <h3 className="font-semibold text-sm line-clamp-1 mb-1">{agent.business_name}</h3>
                      {location && (
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground mb-4">
                          <MapPin className="h-2.5 w-2.5" />
                          <span className="line-clamp-1">{location}</span>
                        </div>
                      )}
                      <div className="mt-auto flex items-center justify-between pt-3 border-t border-border/50">
                        <div className="flex items-center gap-1.5">
                          <div className="flex -space-x-1.5">
                            {Array.from({ length: 3 }).map((_, i) => (
                              <div
                                key={i}
                                className="w-4 h-4 rounded-full border-2 border-background bg-muted overflow-hidden"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={`https://i.pravatar.cc/100?img=${idx * 3 + i}`} alt="" />
                              </div>
                            ))}
                          </div>
                          <span className="text-[10px] text-muted-foreground">300+ students helped</span>
                        </div>
                        <span className="h-7 w-7 rounded-full flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                          <ArrowRight className="h-3.5 w-3.5" />
                        </span>
                      </div>
                    </Link>
                  </Reveal>
                );
              })}
        </div>

        <Reveal className="text-center mt-10">
          <Button variant="outline" className="rounded-full px-8" render={<Link href="/search?tab=education-agencies" />}>
            Explore all Agents
          </Button>
        </Reveal>
      </div>
    </section>
  );
}
