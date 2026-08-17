import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal } from "../../components/reveal";
import { HOW_IT_WORKS } from "../static-content";

export function HowItWorks() {
  return (
    <section className="py-16 bg-background">
      <div className="container mx-auto px-4">
        <Reveal className="text-center mb-12">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3">
            How Globaly.app <span className="highlight-text active">Works</span>
          </h2>
          <p className="text-muted-foreground text-sm max-w-xl mx-auto">
            Follow these simple steps to start your global education journey
          </p>
        </Reveal>

        <div className="space-y-12 max-w-2xl mx-auto">
          {HOW_IT_WORKS.map((step) => (
            <Reveal key={step.step} direction="left" delay={0.1}>
              <div className="space-y-4 text-left">
                <div className="flex items-center gap-2 text-primary font-bold text-xl">
                  <span className="bg-primary/10 w-8 h-8 rounded-full flex items-center justify-center text-sm">{step.step}</span>
                  <span className="uppercase tracking-widest text-xs">Step {step.step}</span>
                </div>
                <h3 className="text-2xl font-bold text-foreground leading-tight">{step.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed max-w-md">{step.desc}</p>
                {step.link && (
                  <Button variant="link" className="p-0 h-auto text-primary font-semibold hover:underline justify-start" render={<Link href={step.link.href} />}>
                    {step.link.label} <ArrowRight className="ml-1 h-3 w-3" />
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
