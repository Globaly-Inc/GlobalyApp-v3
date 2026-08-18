import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Reveal } from "../../components/reveal";
import { FAQS } from "../static/for-institutions-content";

export function FaqSection() {
  return (
    <section className="py-16 bg-muted/30">
      <div className="container mx-auto px-4 max-w-3xl">
        <Reveal className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl font-bold">
            Frequently Asked <span className="highlight-text active">Questions</span>
          </h2>
        </Reveal>
        <Accordion className="w-full">
          {FAQS.map((faq, i) => (
            <AccordionItem key={faq.q} value={`faq-${i}`} className="border-b-border/50">
              <AccordionTrigger className="text-left font-semibold hover:no-underline">
                {faq.q}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed">
                {faq.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
