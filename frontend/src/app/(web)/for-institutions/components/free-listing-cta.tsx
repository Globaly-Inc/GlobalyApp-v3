import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Reveal } from "../../components/reveal";

export function FreeListingCta() {
  return (
    <section className="py-16 bg-[hsl(38,92%,96%)]">
      <div className="container mx-auto px-4">
        <div className="max-w-2xl mx-auto text-center">
          <Reveal direction="right">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              Publish Your Courses &amp; Access{" "}
              <span className="highlight-text active">Verified Agents</span>{" "}
              <span className="text-[hsl(var(--gold))]">FREE for a Limited Time 🎉</span>
            </h2>
            <p className="text-muted-foreground mb-6 leading-relaxed">
              For a limited time, list your institution, manage your course data, and start
              connecting with verified education and migration agents worldwide — no fees, no
              restrictions.
            </p>
            <Button
              size="lg"
              className="rounded-full px-8"
              style={{ background: "hsl(var(--gold))", color: "hsl(var(--purple-dark))", fontWeight: 700 }}
              render={<Link href="/auth/sign-up" />}
            >
              Claim My Free Institution Profile
            </Button>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
