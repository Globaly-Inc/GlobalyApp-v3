import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Reveal } from "../../components/reveal";
import { SignupFormMockup } from "../../components/mockups/signup-form-mockup";
import { ProfileBuilderMockup } from "../../components/mockups/profile-builder-mockup";
import { PartnershipConnectMockup } from "../../components/mockups/partnership-connect-mockup";
import { EnquiryUnlockMockup } from "../../components/mockups/enquiry-unlock-mockup";
import { DashboardKPIMockup } from "../../components/mockups/dashboard-kpi-mockup";

const HOW_IT_WORKS: Array<{
  step: string;
  emoji: string;
  title: string;
  desc: string;
  cta?: string;
  ctaLink?: string;
  visual: ReactNode;
}> = [
  {
    step: "01",
    emoji: "📝",
    title: "Join Globaly",
    desc: "Connect with institutions and students from around the world.",
    cta: "Get Started",
    ctaLink: "/auth/sign-up",
    visual: <SignupFormMockup />,
  },
  {
    step: "02",
    emoji: "✅",
    title: "Setup or Claim Your Business",
    desc: "Setup your business profile and level up your presence to students and institutions globally.",
    visual: <ProfileBuilderMockup />,
  },
  {
    step: "03",
    emoji: "🤝",
    title: "Connect with Institutions",
    desc: "Represent institutions and provide consultation to students.",
    cta: "Explore Institutions",
    ctaLink: "/search?tab=institutions",
    visual: <PartnershipConnectMockup />,
  },
  {
    step: "04",
    emoji: "📥",
    title: "Get verified enquiries",
    desc: "Establish your business network and provide services throughout the world.",
    visual: <EnquiryUnlockMockup />,
  },
  {
    step: "05",
    emoji: "🚀",
    title: "Unlock your potential leads",
    desc: "Handle genuine leads from real students and increase your profitability.",
    cta: "Start Now",
    ctaLink: "/auth/sign-up",
    visual: <DashboardKPIMockup />,
  },
];

export function HowItWorksSection() {
  return (
    <section className="py-16 bg-muted/30">
      <div className="container mx-auto px-4">
        <Reveal className="text-center mb-12">
          <h2 className="text-2xl md:text-3xl font-bold mb-3">
            How It <span className="highlight-text active">Works</span>
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Create your business, add partnerships, get student enquiries and grow your business worldwide
          </p>
        </Reveal>
        <div className="space-y-16">
          {HOW_IT_WORKS.map((step) => (
            <Reveal key={step.step} direction="left" delay={0.1}>
              <div className="grid md:grid-cols-2 gap-12 items-center text-left">
                <div className="space-y-4">
                  <div className="text-4xl mb-2">{step.emoji}</div>
                  <Badge variant="outline" className="text-primary border-primary/20">
                    Step {step.step}
                  </Badge>
                  <h3 className="text-2xl font-bold">{step.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{step.desc}</p>
                  {step.cta && (
                    <Button variant="link" className="px-0 text-primary" render={<Link href={step.ctaLink!} />}>
                      {step.cta} <ArrowRight className="ml-1 h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="rounded-2xl overflow-hidden shadow-xl bg-muted/30 flex items-center justify-center p-4 md:p-6">
                  {step.visual}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
