import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { creditCosts, creditPacks } from "../data";

export function PricingCreditsExplainer() {
  return (
    <section className="bg-[hsl(var(--purple-dark))] py-20 text-white">
      <div className="container mx-auto px-4">
        <div className="mb-12 text-center">
          <p className="mb-3 text-xs tracking-[0.3em] text-white/50 uppercase">Globaly credits</p>
          <h2 className="mb-3 text-3xl font-bold md:text-4xl">One currency. Every action on Globaly.</h2>
          <p className="mx-auto max-w-xl text-white/60">
            Credits are the universal currency for anything that costs on Globaly. Buy them once — they never
            expire. Subscription credits top up automatically each month.
          </p>
        </div>

        <div className="grid items-start gap-10 md:grid-cols-2">
          {/* Cost pills */}
          <div className="space-y-3">
            {creditCosts.map((c) => (
              <div key={c.label} className="flex items-center gap-4 rounded-xl bg-white/5 p-4">
                <span className="text-xl">{c.emoji}</span>
                <span className="flex-1 text-sm">{c.label}</span>
                <Badge className="border-0 bg-white/10 font-mono text-white">{c.cr}</Badge>
                <span className="text-xs text-white/50">{c.aud}</span>
              </div>
            ))}
          </div>

          {/* Wallet summary + packs */}
          <div className="space-y-6">
            <Card className="border-white/10 bg-white/5">
              <CardContent className="p-6">
                <p className="mb-2 text-xs tracking-wider text-white/50 uppercase">Business wallet</p>
                <p className="mb-3 text-3xl font-bold">
                  300 <span className="text-lg font-normal text-white/60">credits available</span>
                </p>
                <div className="flex gap-4 text-sm text-white/60">
                  <span>
                    Subscription: <strong className="text-white">300 cr</strong>
                  </span>
                  <span>
                    Purchased: <strong className="text-white">0 cr</strong>
                  </span>
                </div>
              </CardContent>
            </Card>

            <div>
              <p className="mb-3 text-sm font-semibold tracking-wider text-white/80 uppercase">
                Top up with a credit pack
              </p>
              <div className="grid grid-cols-3 gap-3">
                {creditPacks.map((p) => (
                  <div
                    key={p.cr}
                    className="rounded-xl border border-white/10 bg-white/5 p-3 text-center transition-colors hover:border-white/20"
                  >
                    <p className="text-lg font-bold">{p.cr.toLocaleString()} cr</p>
                    <p className="text-xl font-bold text-[hsl(var(--gold))]">${p.price}</p>
                    {p.save && (
                      <Badge className="mt-1 border-0 bg-emerald-500/20 text-xs text-emerald-300">
                        Save {p.save}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-center text-xs text-white/40">
                Purchased credits never expire · Subscription credits reset monthly
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
