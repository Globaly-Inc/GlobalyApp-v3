"use client";

import { BookOpen, Building2, Globe, Handshake, MapPin, type LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal } from "../../components/reveal";
import { usePlatformStats } from "../../hooks/use-platform-stats";
import { formatStatValue, type PlatformStatKey } from "../../types";

/** Values come from GET /api/v3/platform-stats — `key` selects the count for each row. */
const STATS: { key: PlatformStatKey; label: string; Icon: LucideIcon }[] = [
  { key: "institutions", label: "Institutions", Icon: Building2 },
  { key: "courses", label: "Courses", Icon: BookOpen },
  { key: "educationCounselors", label: "Education Counselors", Icon: Handshake },
  { key: "countries", label: "Countries", Icon: Globe },
  { key: "cities", label: "Cities", Icon: MapPin },
];

export function StatsBar() {
  const { stats, loading } = usePlatformStats();

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
                  {loading ? (
                    <Skeleton className="h-7 w-12" />
                  ) : (
                    <p className="text-xl font-bold text-foreground">
                      {formatStatValue(stats?.[s.key])}
                    </p>
                  )}
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
