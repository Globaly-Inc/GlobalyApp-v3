import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type { Audience } from "../data";
import { faqs, studentFaqs } from "../data";

export function PricingFaq({ audience }: Readonly<{ audience: Audience }>) {
  const items = audience === "students" ? studentFaqs : faqs;

  return (
    <section className="bg-background py-20">
      <div className="container mx-auto max-w-4xl px-4">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-bold">FAQ</h2>
          <p className="text-muted-foreground">The honest answers to pricing questions.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {items.map((faq) => (
            <Accordion key={faq.q}>
              <AccordionItem value="q" className="rounded-xl border px-4">
                <AccordionTrigger className="text-left text-sm font-semibold hover:no-underline">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">{faq.a}</AccordionContent>
              </AccordionItem>
            </Accordion>
          ))}
        </div>
      </div>
    </section>
  );
}
