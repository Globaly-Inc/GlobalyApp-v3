import { BookOpen, Building2, Globe, Handshake, MapPin } from "lucide-react";
import { Reveal } from "../../components/reveal";
import { PLATFORM_STATS } from "../../const/index";

const STATS = [
  { value: PLATFORM_STATS.institutions, label: "Institutions", Icon: Building2 },
  { value: PLATFORM_STATS.courses, label: "Courses", Icon: BookOpen },
  { value: PLATFORM_STATS.agents, label: "Agents", Icon: Handshake },
  { value: PLATFORM_STATS.countries, label: "Countries", Icon: Globe },
  { value: PLATFORM_STATS.cities, label: "Cities", Icon: MapPin },
];

export function StatsBar() {
  return (
    <section className="py-8 bg-background border-b border-border">
      <div className="container mx-auto px-4">
        <div className="flex flex-wrap justify-center gap-8 md:gap-16">
          {STATS.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.08}>
              <div className="flex items-center gap-3 text-center">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <s.Icon className="h-5 w-5 text-primary" />
                </div>
                <div className="text-left">
                  <p className="text-xl font-bold text-foreground">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
