import { Plus, X } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Reveal } from "./reveal";

export type Faq = { q: string; a: string };

/** Each question is its own rounded card with a plus/× toggle. */
export function FaqAccordion({ faqs }: Readonly<{ faqs: Faq[] }>) {
  return (
    <section className="py-16 bg-muted/30">
      <div className="container mx-auto px-4 max-w-2xl">
        <Reveal className="text-center mb-8">
          <h2 className="text-2xl md:text-3xl font-bold">
            Frequently Asked <span className="highlight-text active">Questions</span>
          </h2>
        </Reveal>

        <Accordion className="space-y-3">
          {faqs.map((faq, i) => (
            <Reveal key={faq.q} delay={Math.min(i, 6) * 0.05}>
              <AccordionItem
                value={`faq-${i}`}
                className="rounded-2xl bg-primary/5 px-5 overflow-hidden"
              >
                <AccordionTrigger className="group py-4 gap-3 hover:no-underline [&>svg:last-child]:hidden">
                  <span className="font-semibold text-sm">{faq.q}</span>
                  <Plus className="h-4 w-4 text-muted-foreground shrink-0 group-data-[panel-open]:hidden" />
                  <X className="h-4 w-4 text-foreground shrink-0 hidden group-data-[panel-open]:block" />
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed">{faq.a}</AccordionContent>
              </AccordionItem>
            </Reveal>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
