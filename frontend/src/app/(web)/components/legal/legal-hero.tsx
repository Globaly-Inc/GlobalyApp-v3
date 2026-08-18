import type { LucideIcon } from "lucide-react";
import { CalendarClock } from "lucide-react";

interface LegalHeroProps {
  icon: LucideIcon;
  title: string;
  description: string;
  lastUpdated: string;
}

export function LegalHero({ icon: Icon, title, description, lastUpdated }: Readonly<LegalHeroProps>) {
  return (
    <section className="relative overflow-hidden border-b border-border bg-linear-to-br from-primary/10 via-background to-primary/5 py-20">
      <div
        className="pointer-events-none absolute inset-0 text-primary/50 opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]"
        style={{ backgroundImage: "radial-gradient(currentColor 1.5px, transparent 1.5px)", backgroundSize: "28px 28px" }}
      />
      <div className="pointer-events-none absolute -top-24 -left-24 size-72 animate-pulse rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-24 top-10 size-72 animate-pulse rounded-full bg-primary/10 blur-3xl [animation-delay:1s]" />

      <div className="container relative mx-auto max-w-3xl px-4 text-center">
        <div className="mx-auto mb-6 flex size-16 animate-fade-in items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
          <Icon className="size-8" />
        </div>
        <h1 className="mb-4 animate-fade-in text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
        <p className="mx-auto mb-6 max-w-xl animate-fade-in text-muted-foreground">{description}</p>
        <div className="inline-flex animate-fade-in items-center gap-1.5 rounded-full bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground ring-1 ring-border">
          <CalendarClock className="size-3.5" />
          Last updated: {lastUpdated}
        </div>
      </div>
    </section>
  );
}
