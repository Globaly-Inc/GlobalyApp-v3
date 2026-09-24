"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { studentFeatures, earnCards, aiCosts, SEARCHABLE_FEATURE_INDEX } from "../data";
import { usePlatformStats } from "../../hooks/use-platform-stats";
import { formatStatValue } from "../../types";

export function PricingStudentSection() {
  const { stats } = usePlatformStats();

  // Everything a student can search from one box: the three catalogs plus marketplace services.
  const features = studentFeatures.map((f, i) => {
    if (i !== SEARCHABLE_FEATURE_INDEX || !stats) return f;
    const listings = stats.courses + stats.institutions + stats.educationCounselors + stats.serviceListings;
    return {
      text: `Search & compare ${formatStatValue(listings)} listings`,
      sub: `Courses, institutions, education counselors across ${formatStatValue(stats.countries)} countries`,
    };
  });

  return (
    <>
      {/* Student free forever */}
      <section className="bg-background py-20">
        <div className="container mx-auto max-w-3xl px-4 text-center">
          <Badge className="mb-4 border-0 bg-emerald-100 px-4 py-1 text-sm text-emerald-700">Free forever</Badge>
          <h2 className="mb-3 text-3xl font-bold md:text-4xl">
            Study at home or overseas without paying a single cent to Globaly.
          </h2>
          <p className="mx-auto mb-8 max-w-xl text-muted-foreground">
            We believe every student deserves access to the best education guidance — regardless of budget. Your
            profile, your applications, your AI counsellor, your entire education journey. Free.
          </p>

          <Card className="mx-auto max-w-lg text-left">
            <CardContent className="p-6">
              <p className="mb-4 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Everything included at $0
              </p>
              <div className="space-y-4">
                {features.map((f) => (
                  <div key={f.text} className="flex gap-3">
                    <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                    <div>
                      <p className="text-sm font-medium">{f.text}</p>
                      <p className="text-xs text-muted-foreground">{f.sub}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button className="btn-gold rounded-full px-8" render={<Link href="/auth/sign-up" />}>
              Create free account
            </Button>
            <Button variant="outline" className="rounded-full px-8" render={<a href="#earn-credits" />}>
              How to earn credits
            </Button>
          </div>
        </div>
      </section>

      {/* Earn credits */}
      <section id="earn-credits" className="bg-muted/30 py-20">
        <div className="container mx-auto px-4">
          <div className="mb-10 text-center">
            <p className="mb-3 text-xs tracking-[0.3em] text-muted-foreground uppercase">Globaly credits</p>
            <h2 className="mb-2 text-3xl font-bold">Earn credits just by using the platform.</h2>
            <p className="mx-auto max-w-xl text-muted-foreground">
              Credits unlock AI tools that give you an edge in your application. You can earn them for free — or top
              up any time.
            </p>
          </div>

          <div className="mx-auto grid max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {earnCards.map((c) => (
              <Card key={c.title} className="transition-shadow hover:shadow-md">
                <CardContent className="p-5">
                  <span className="mb-3 block text-2xl">{c.emoji}</span>
                  <div className="mb-1 flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-primary">{c.amount}</span>
                    <span className="text-xs text-muted-foreground">{c.unit}</span>
                  </div>
                  <h3 className="mb-1 font-semibold">{c.title}</h3>
                  <p className="mb-3 text-sm text-muted-foreground">{c.desc}</p>
                  <Badge variant="outline" className="text-xs">
                    {c.tag}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* AI cost strip */}
      <section className="bg-[hsl(var(--purple-dark))] py-10 text-white">
        <div className="container mx-auto px-4">
          <p className="mb-6 text-center text-xs tracking-wider text-white/50 uppercase">What credits unlock</p>
          <div className="mx-auto grid max-w-3xl grid-cols-2 gap-4 md:grid-cols-4">
            {aiCosts.map((c) => (
              <div key={c.label} className="rounded-xl bg-white/5 p-4 text-center">
                <p className="mb-1 text-xs font-medium text-white/60 uppercase">{c.label}</p>
                <p className="text-2xl font-bold">{c.cost}</p>
                <p className="text-xs text-white/40">{c.dollar}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-center text-xs text-white/40">
            Your monthly free grant of 10 credits = 1 AI counselling session + 2 AI assists every month, completely
            free.
          </p>
        </div>
      </section>
    </>
  );
}
