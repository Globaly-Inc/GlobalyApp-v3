import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Reveal } from "../../components/reveal";
import { DashboardKPIMockup } from "../../components/mockups/dashboard-kpi-mockup";

export function FreeListingCta() {
  return (
    <section className="py-16 bg-[hsl(38,92%,96%)]">
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <Reveal direction="left">
            <DashboardKPIMockup />
          </Reveal>
          <Reveal direction="right">
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              Publish Your Courses &amp; Access{" "}
              <span className="highlight-text active">Verified Education Counselors</span>{" "}
              <span className="text-[hsl(var(--gold))]">FREE for a Limited Time 🎉</span>
            </h2>
            <p className="text-muted-foreground mb-6 leading-relaxed">
              For a limited time, list your institution, manage your course data, and start
              connecting with verified education and migration agents worldwide — no fees, no
              restrictions.
            </p>
            <Button
              size="lg"
              className="h-11 rounded-full px-8"
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
