import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "../../components/reveal";
import { SearchResultsMockup } from "../../components/mockups/search-results-mockup";
// Parked with the eligibility checker: import { EligibilityCheckerMockup } from "../../components/mockups/eligibility-checker-mockup";
import { VerifiedProfessionalsMockup } from "../../components/mockups/verified-professionals-mockup";
import { ProfileBuilderMockup } from "../../components/mockups/profile-builder-mockup";
import { HOW_IT_WORKS } from "../static-content";

const STEP_VISUALS = [SearchResultsMockup, VerifiedProfessionalsMockup, ProfileBuilderMockup];

export function HowItWorks() {
  return (
    <section className="py-16 bg-background">
      <div className="container mx-auto px-4">
        <Reveal className="text-center mb-12">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3">
            How Globalyapp <span className="highlight-text active">Works</span>
          </h2>
          <p className="text-muted-foreground text-sm max-w-xl mx-auto">
            Follow these simple steps to start your global education journey
          </p>
        </Reveal>

        <div className="space-y-16">
          {HOW_IT_WORKS.map((step, i) => {
            const Visual = STEP_VISUALS[i] ?? SearchResultsMockup;
            return (
              <Reveal key={step.step} direction="left" delay={0.1}>
                <div className="flex flex-col md:flex-row md:items-center gap-8 md:gap-12 text-left">
                  <div className="flex-1 space-y-4">
                    <div className="flex items-center gap-2 text-primary font-bold text-xl">
                      <span className="bg-primary/10 w-8 h-8 rounded-full flex items-center justify-center text-sm">
                        {step.step}
                      </span>
                      <span className="uppercase tracking-widest text-xs">Step {step.step}</span>
                    </div>
                    <h3 className="text-2xl font-bold text-foreground leading-tight">{step.title}</h3>
                    <p className="text-muted-foreground text-sm leading-relaxed max-w-md">{step.desc}</p>
                    {step.link && (
                      <Button
                        variant="link"
                        className="p-0 h-auto text-primary font-semibold hover:underline justify-start"
                        render={<Link href={step.link.href} />}
                      >
                        {step.link.label} <ArrowRight className="ml-1 h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <div className="flex-1 w-full">
                    <div className="bg-muted/30 rounded-2xl p-4 md:p-6 flex items-center justify-center shadow-inner">
                      <Visual />
                    </div>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
