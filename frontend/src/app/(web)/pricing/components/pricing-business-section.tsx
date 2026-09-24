import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { planCards } from "../data";

export function PricingBusinessSection({
  annual,
  setAnnual,
}: Readonly<{ annual: boolean; setAnnual: (v: boolean) => void }>) {
  return (
    <section className="bg-background py-20">
      <div className="container mx-auto px-4">
        <div className="mb-10 text-center">
          <h2 className="mb-3 text-3xl font-bold md:text-4xl">Choose your plan</h2>
          <p className="mb-6 text-muted-foreground">Start with a 14-day Pro trial. No credit card required.</p>
          <div className="flex items-center justify-center gap-3">
            <span className={`text-sm font-medium ${!annual ? "text-foreground" : "text-muted-foreground"}`}>
              Monthly
            </span>
            <Switch checked={annual} onCheckedChange={setAnnual} />
            <span className={`text-sm font-medium ${annual ? "text-foreground" : "text-muted-foreground"}`}>
              Annual
            </span>
            {annual && <Badge className="border-0 bg-emerald-100 text-xs text-emerald-700">Save up to 20%</Badge>}
          </div>
        </div>

        <div className="mx-auto grid max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {planCards.map((card, i) => {
            const price = annual ? card.annualMonthly : card.monthly;
            const isPopular = card.isPopular;
            // V2 sent tiers 1–3 to `/business/subscription`, a live checkout flow
            // that doesn't exist in v3 (out of scope). Route everyone to sign-up,
            // and Enterprise to sales — same two destinations the page's final
            // CTA already uses.
            const cta = i === 0 ? "Get started free" : i === 4 ? "Contact sales" : "Start free trial";

            return (
              <Card key={card.name} className={`relative ${isPopular ? "shadow-lg ring-2 ring-primary" : ""}`}>
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground">Most popular</Badge>
                  </div>
                )}
                <CardContent className="flex h-full flex-col p-5">
                  <h3 className="mb-1 text-lg font-bold">{card.name}</h3>
                  <div className="mb-3">
                    <span className="text-3xl font-bold">${price}</span>
                    {i > 0 && <span className="text-sm text-muted-foreground"> / mo</span>}
                  </div>
                  {card.credits > 0 && (
                    <p className="mb-1 text-sm font-medium text-primary">{card.credits.toLocaleString()} credits/mo</p>
                  )}
                  <p className="mb-4 text-xs text-muted-foreground">+ {card.personalCredits} cr per member</p>
                  <ul className="mb-5 flex-1 space-y-2">
                    {card.highlights.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className={`w-full ${isPopular ? "btn-gold" : ""}`}
                    variant={isPopular ? "default" : "outline"}
                    render={i === 4 ? <a href="mailto:sales@globalyapp.com" /> : <Link href="/auth/sign-up" />}
                  >
                    {cta}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
