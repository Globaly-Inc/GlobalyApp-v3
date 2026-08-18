import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Reveal } from "../../components/reveal";

const HOW_IT_WORKS: Array<{
  step: string;
  emoji: string;
  title: string;
  desc: string;
  cta?: string;
  ctaLink?: string;
}> = [
  {
    step: "01",
    emoji: "📝",
    title: "Join Globaly",
    desc: "Connect with institutions and students from around the world.",
    cta: "Get Started",
    ctaLink: "/auth/sign-up",
  },
  {
    step: "02",
    emoji: "✅",
    title: "Setup or Claim Your Business",
    desc: "Setup your business profile and level up your presence to students and institutions globally.",
  },
  {
    step: "03",
    emoji: "🤝",
    title: "Connect with Institutions",
    desc: "Represent institutions and provide consultation to students.",
    cta: "Explore Institutions",
    ctaLink: "/search?tab=institutions",
  },
  {
    step: "04",
    emoji: "📥",
    title: "Get verified enquiries",
    desc: "Establish your business network and provide services throughout the world.",
  },
  {
    step: "05",
    emoji: "🚀",
    title: "Unlock your potential leads",
    desc: "Handle genuine leads from real students and increase your profitability.",
    cta: "Start Now",
    ctaLink: "/auth/sign-up",
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
        <div className="space-y-12 max-w-2xl mx-auto">
          {HOW_IT_WORKS.map((step) => (
            <Reveal key={step.step} direction="left" delay={0.1}>
              <div className="space-y-4 text-left">
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
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
