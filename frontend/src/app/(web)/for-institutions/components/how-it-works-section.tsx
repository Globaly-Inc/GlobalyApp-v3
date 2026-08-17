import { Reveal } from "../../components/reveal";
import { HOW_IT_WORKS } from "../static/for-institutions-content";

export function HowItWorksSection() {
  return (
    <section className="py-16 bg-background">
      <div className="container mx-auto px-4">
        <Reveal className="text-center mb-12">
          <h2 className="text-2xl md:text-3xl font-bold mb-3">
            How It <span className="highlight-text active">Works</span>
          </h2>
          <p className="text-muted-foreground text-sm max-w-xl mx-auto">
            Follow these simple steps to expand your global reach
          </p>
        </Reveal>
        <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-6">
          {HOW_IT_WORKS.map((step, i) => (
            <Reveal key={step.title} direction={i % 2 === 0 ? "left" : "right"} delay={0.1}>
              <div className="bg-muted/20 border border-border rounded-2xl p-6 h-full flex flex-col text-center items-center hover:border-primary/30 hover:shadow-md transition-all">
                <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                  <step.Icon className="h-7 w-7 text-primary" />
                </div>
                <h3 className="font-bold mb-2">{step.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
