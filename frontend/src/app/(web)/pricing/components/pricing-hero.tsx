import { ArrowDown, GraduationCap, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Audience } from "../data";
import { trustStats } from "../data";

export function PricingHero({
  audience,
  setAudience,
}: Readonly<{ audience: Audience; setAudience: (a: Audience) => void }>) {
  return (
    <>
      <section className="relative overflow-hidden bg-[hsl(var(--purple-dark))] py-20 text-white">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20" />
        <div className="container relative z-10 mx-auto px-4 text-center">
          <p className="mb-4 text-xs font-medium tracking-[0.3em] text-white/60 uppercase">
            Transparent pricing — no hidden fees
          </p>
          <h1 className="mb-4 text-4xl leading-tight font-bold md:text-5xl lg:text-6xl">
            Simple, transparent pricing for <em className="text-[hsl(var(--gold))] not-italic">everyone</em>.
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-lg text-white/70">
            Always free for students. Businesses get started free and pay only for premium tools. No hidden fees. No
            contracts.
          </p>

          <div className="mb-10 flex items-center justify-center gap-3">
            <Button
              variant={audience === "students" ? "default" : "ghost"}
              className={
                audience === "students"
                  ? "btn-gold"
                  : "border border-white/50 bg-transparent text-white/90 hover:bg-white/20 hover:text-white"
              }
              onClick={() => setAudience("students")}
            >
              <GraduationCap className="mr-2 h-4 w-4" /> I&apos;m a student
            </Button>
            <Button
              variant={audience === "business" ? "default" : "ghost"}
              className={
                audience === "business"
                  ? "btn-gold"
                  : "border border-white/50 bg-transparent text-white/90 hover:bg-white/20 hover:text-white"
              }
              onClick={() => setAudience("business")}
            >
              <Building2 className="mr-2 h-4 w-4" /> I&apos;m a business
            </Button>
          </div>

          <a href="#content" className="inline-flex items-center gap-2 text-sm text-white/50 transition-colors hover:text-white/80">
            <ArrowDown className="h-4 w-4 animate-bounce" /> Scroll to explore
          </a>
        </div>
      </section>

      <section className="border-b bg-muted/50">
        <div className="container mx-auto px-4 py-6">
          <div className="grid grid-cols-2 gap-6 text-center md:grid-cols-4">
            {trustStats.map((s) => (
              <div key={s.label}>
                <p className="text-2xl font-bold text-foreground">{s.value}</p>
                <p className="text-sm text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
