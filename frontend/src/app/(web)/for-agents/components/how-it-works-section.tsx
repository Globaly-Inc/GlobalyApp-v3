"use client";

import Link from "next/link";
import { ArrowRight, UserPlus, CheckCircle2, Handshake, Inbox, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "../../components/reveal";
import { useStepperProgress } from "../../components/use-stepper-progress";
import { WavyTimelineConnector } from "../../components/wavy-timeline-connector";

const HOW_IT_WORKS: Array<{
  step: string;
  icon: typeof UserPlus;
  title: string;
  desc: string;
  cta?: string;
  ctaLink?: string;
}> = [
  {
    step: "01",
    icon: UserPlus,
    title: "Join Globaly",
    desc: "Connect with institutions and students from around the world.",
    cta: "Get Started",
    ctaLink: "/auth/sign-up",
  },
  {
    step: "02",
    icon: CheckCircle2,
    title: "Setup or Claim Your Business",
    desc: "Setup your business profile and level up your presence to students and institutions globally.",
  },
  {
    step: "03",
    icon: Handshake,
    title: "Connect with Institutions",
    desc: "Represent institutions and provide consultation to students.",
    cta: "Explore Institutions",
    ctaLink: "/search?tab=institutions",
  },
  {
    step: "04",
    icon: Inbox,
    title: "Get verified enquiries",
    desc: "Establish your business network and provide services throughout the world.",
  },
  {
    step: "05",
    icon: Rocket,
    title: "Unlock your potential leads",
    desc: "Handle genuine leads from real students and increase your profitability.",
    cta: "Start Now",
    ctaLink: "/auth/sign-up",
  },
];

export function HowItWorksSection() {
  const { activeIndex, setStepRef } = useStepperProgress();

  return (
    <section className="py-16 bg-muted/30">
      <div className="container mx-auto px-4">
        <Reveal className="text-center mb-16">
          <h2 className="text-2xl md:text-3xl font-bold mb-3">
            How It <span className="highlight-text active">Works</span>
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Create your business, add partnerships, get student enquiries and grow your business worldwide
          </p>
        </Reveal>

        <div className="relative mx-auto max-w-4xl">
          <WavyTimelineConnector steps={HOW_IT_WORKS.length} />
          <span className="absolute top-0 bottom-0 left-1/2 hidden w-px -translate-x-1/2 bg-primary/15 md:block" aria-hidden="true" />
          <span
            className="absolute top-0 left-1/2 hidden w-px -translate-x-1/2 bg-primary transition-[height] duration-500 ease-out md:block"
            style={{ height: `${(activeIndex / Math.max(HOW_IT_WORKS.length - 1, 1)) * 100}%` }}
            aria-hidden="true"
          />
          <div className="relative space-y-16 md:space-y-24">
            {HOW_IT_WORKS.map((step, i) => {
              const isRight = i % 2 === 1;
              const text = (
                <div className={`space-y-3 text-center md:text-left ${isRight ? "md:order-2 md:text-left" : "md:order-1 md:text-right"}`}>
                  <h3 className="text-2xl font-bold">{step.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{step.desc}</p>
                  {step.cta && (
                    <Button
                      variant="link"
                      className={`px-0 text-primary ${isRight ? "justify-start" : "md:ml-auto md:justify-end"}`}
                      render={<Link href={step.ctaLink!} />}
                    >
                      {step.cta} <ArrowRight className="ml-1 h-4 w-4" />
                    </Button>
                  )}
                </div>
              );
              const icon = (
                <div className={`flex justify-center ${isRight ? "md:order-1 md:justify-end" : "md:order-2 md:justify-start"}`}>
                  <div className="flex h-28 w-28 items-center justify-center rounded-full bg-primary/5">
                    <step.icon strokeWidth={1.25} className="h-14 w-14 text-primary" />
                  </div>
                </div>
              );
              const isActive = i <= activeIndex;
              return (
                <Reveal key={step.step} direction={isRight ? "right" : "left"}>
                  <div ref={setStepRef(i)} className="relative grid grid-cols-1 items-center gap-6 md:grid-cols-2 md:gap-16">
                    <span
                      className={`absolute top-1/2 left-1/2 z-10 hidden h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-xs font-bold shadow-md transition-colors duration-300 md:flex ${
                        isActive ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground ring-1 ring-primary/20"
                      }`}
                    >
                      {step.step}
                    </span>
                    {text}
                    {icon}
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
