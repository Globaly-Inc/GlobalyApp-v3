import { Card } from "@/components/ui/card";
import { Reveal } from "../../components/reveal";
import { WHY_JOIN } from "../static/for-institutions-content";

export function WhyJoinSection() {
  return (
    <section className="py-16 bg-primary/5">
      <div className="container mx-auto px-4">
        <Reveal className="text-center mb-12">
          <h2 className="text-2xl md:text-3xl font-bold mb-3">
            Why Institutions Join <span className="highlight-text active">Globalyapp?</span>
          </h2>
          <p className="text-muted-foreground">
            Take charge of your students, education counselor network, and course data in one smart platform.
          </p>
        </Reveal>
        {/* Two per row: four cards in a 3-column grid leave a lone card orphaned on the second. */}
        <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {WHY_JOIN.map((item, i) => (
            <Reveal key={item.title} delay={i * 0.1}>
              <Card className="p-6 border border-border hover:border-primary/30 hover:shadow-md transition-all h-full">
                <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <item.Icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </Card>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
