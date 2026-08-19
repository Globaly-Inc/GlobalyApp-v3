import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PricingCta() {
  return (
    <section className="bg-[hsl(var(--purple-dark))] py-20 text-white">
      <div className="container mx-auto px-4 text-center">
        <Sparkles className="mx-auto mb-4 h-8 w-8 text-[hsl(var(--gold))]" />
        <h2 className="mb-3 text-3xl font-bold md:text-4xl">Start free. Grow when you&apos;re ready.</h2>
        <p className="mx-auto mb-8 max-w-lg text-white/60">
          No contract. No hidden fees. No surprise invoices. Just the platform — and the students — you&apos;ve been
          looking for.
        </p>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button size="lg" className="btn-gold rounded-full px-8 h-11" render={<Link href="/auth/sign-up" />}>
            Create your free account
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-11 rounded-full border-white/40 bg-transparent px-8 text-white hover:bg-white/10 hover:text-white"
            render={<a href="mailto:sales@globaly.app" />}
          >
            Talk to the team
          </Button>
        </div>
        <p className="mt-6 text-xs text-white/40">
          Students are always free · Businesses start free · 14-day Pro trial · No credit card required
        </p>
      </div>
    </section>
  );
}
