import { Card } from "@/components/ui/card";
import { Reveal } from "../../components/reveal";
import { WHY_JOIN } from "../static/for-institutions-content";

export function WhyJoinSection() {
  return (
    <section className="py-16 bg-background">
      <div className="container mx-auto px-4">
        <Reveal className="text-center mb-12">
          <h2 className="text-2xl md:text-3xl font-bold mb-3">
            Why Institutions Join <span className="highlight-text active">Globaly.app?</span>
          </h2>
          <p className="text-muted-foreground">
            Take charge of your students, agent network, and course data in one smart platform.
          </p>
        </Reveal>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {WHY_JOIN.map((item, i) => (
            <Reveal key={item.title} delay={i * 0.1}>
              {/* V1's card is `rounded-lg border bg-card shadow-sm` and nothing else. V3's shared card adds
                  its own vertical padding, a flex gap between children, a ring and text-sm — neutralised
                  here rather than in the shared component, which the portals style around deliberately. */}
              <Card className="rounded-lg border border-border shadow-sm ring-0 py-0 gap-0 text-base p-6 hover:border-primary/30 hover:shadow-md transition-all h-full">
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
