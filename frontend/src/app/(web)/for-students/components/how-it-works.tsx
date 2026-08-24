"use client";

import Link from "next/link";
import { ArrowRight, Search, ClipboardCheck, UserCheck, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "../../components/reveal";
import { useStepperProgress } from "../../components/use-stepper-progress";
import { WavyTimelineConnector } from "../../components/wavy-timeline-connector";
import { HOW_IT_WORKS } from "../static-content";

const STEP_ICONS = [Search, ClipboardCheck, UserCheck, GraduationCap];

export function HowItWorks() {
  const { activeIndex, setStepRef } = useStepperProgress();

  return (
    <section className="py-16 bg-background">
      <div className="container mx-auto px-4">
        <Reveal className="text-center mb-16">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3">
            How Globaly.app <span className="highlight-text active">Works</span>
          </h2>
          <p className="text-muted-foreground text-sm max-w-xl mx-auto">
            Follow these simple steps to start your global education journey
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
              const Icon = STEP_ICONS[i] ?? Search;
              const isRight = i % 2 === 1;
              const text = (
                <div className={`space-y-3 text-center md:text-left ${isRight ? "md:order-2 md:text-left" : "md:order-1 md:text-right"}`}>
                  <h3 className="text-2xl font-bold text-foreground leading-tight">{step.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{step.desc}</p>
                  {step.link && (
                    <Button
                      variant="link"
                      className={`p-0 h-auto text-primary font-semibold hover:underline ${isRight ? "justify-start" : "md:ml-auto md:justify-end"}`}
                      render={<Link href={step.link.href} />}
                    >
                      {step.link.label} <ArrowRight className="ml-1 h-3 w-3" />
                    </Button>
                  )}
                </div>
              );
              const icon = (
                <div className={`flex justify-center ${isRight ? "md:order-1 md:justify-end" : "md:order-2 md:justify-start"}`}>
                  <div className="flex h-28 w-28 items-center justify-center rounded-full bg-primary/5">
                    <Icon strokeWidth={1.25} className="h-14 w-14 text-primary" />
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
