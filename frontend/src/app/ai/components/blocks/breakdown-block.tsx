"use client";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import type { ResponseBlock } from "../../apis/types";

type BreakdownBlockProps = {
  block: Extract<ResponseBlock, { type: "breakdown" }>;
};

/** Expandable sections — step-by-step guides, pros & cons, cost breakdowns. */
export function BreakdownBlock({ block }: BreakdownBlockProps) {
  return (
    <div className="w-full rounded-xl border bg-card px-4 shadow-xs">
      {block.title && <p className="border-b py-2.5 text-sm font-semibold">{block.title}</p>}
      <Accordion>
        {block.items.map((item, i) => (
          <AccordionItem key={i} value={String(i)}>
            <AccordionTrigger className="py-3 text-sm">{item.title}</AccordionTrigger>
            {item.description && (
              <AccordionContent className="text-sm text-muted-foreground">
                {item.description}
              </AccordionContent>
            )}
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
