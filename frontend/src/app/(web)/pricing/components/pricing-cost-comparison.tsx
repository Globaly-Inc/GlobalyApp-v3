import { Card, CardContent } from "@/components/ui/card";
import { traditionalCosts, globalyCosts } from "../data";

export function PricingCostComparison() {
  return (
    <section className="bg-background py-20">
      <div className="container mx-auto px-4">
        <div className="mb-12 text-center">
          <p className="mb-3 text-xs tracking-[0.3em] text-muted-foreground uppercase">Why Globaly</p>
          <h2 className="mb-3 text-3xl font-bold md:text-4xl">
            Competitors charge $30–$150 per lead. We charge $4.
          </h2>
          <p className="mx-auto max-w-xl text-muted-foreground">
            The international education industry built its pricing model on opacity. We didn&apos;t.
          </p>
        </div>

        <div className="mx-auto grid max-w-4xl gap-8 md:grid-cols-2">
          <Card className="border-destructive/30">
            <CardContent className="p-6">
              <h3 className="mb-4 text-lg font-bold text-destructive">Traditional platforms</h3>
              <div className="space-y-3">
                {traditionalCosts.map((c) => (
                  <div key={c.label} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{c.label}</span>
                    <span className="font-medium text-destructive">{c.value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-lg bg-destructive/5 p-3 text-center">
                <p className="text-xs text-muted-foreground">Typical annual spend</p>
                <p className="text-xl font-bold text-destructive">$15,000–$60,000</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-emerald-300 ring-2 ring-emerald-200">
            <CardContent className="p-6">
              <h3 className="mb-4 text-lg font-bold text-emerald-600">Globaly</h3>
              <div className="space-y-3">
                {globalyCosts.map((c) => (
                  <div key={c.label} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{c.label}</span>
                    <span className="font-medium text-emerald-600">{c.value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-center">
                <p className="text-xs text-muted-foreground">Typical annual spend on Growth plan</p>
                <p className="text-xl font-bold text-emerald-600">$1,188–$3,000</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mx-auto mt-10 max-w-md rounded-2xl bg-[hsl(var(--purple-dark))] p-6 text-center text-white">
          <p className="mb-1 text-xs tracking-wider text-white/50 uppercase">
            Average saving vs traditional platforms
          </p>
          <p className="text-4xl font-bold text-[hsl(var(--gold))]">$12,000–$57,000</p>
          <p className="text-sm text-white/60">per year, per business</p>
        </div>
      </div>
    </section>
  );
}
