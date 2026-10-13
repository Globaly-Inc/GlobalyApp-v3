"use client";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { FALLBACK_FEATURE_META, FEATURE_META, FEATURE_MODULES, MODULE_LABELS } from "../const";
import type { FeatureUsage } from "../apis/types";
import { FeatureCard } from "./feature-card";

export function FeatureUsagePanel({ features }: Readonly<{ features: FeatureUsage[] }>) {
  return (
    <section>
      <h2 className="mb-4 font-heading text-lg font-medium">Feature usage by module</h2>
      <Accordion multiple defaultValue={[...FEATURE_MODULES]}>
        {FEATURE_MODULES.map((module) => {
          const items = features.filter(
            (f) => (FEATURE_META[f.key] ?? FALLBACK_FEATURE_META).module === module,
          );
          if (items.length === 0) return null;
          return (
            <AccordionItem key={module} value={module} className="mb-4 rounded-lg border border-border bg-card px-5 shadow-sm last:border-b">
              <AccordionTrigger className="hover:no-underline">
                <span className="font-heading text-base font-medium">{MODULE_LABELS[module]}</span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
                  {items.map((f) => (
                    <FeatureCard key={f.key} feature={f} />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </section>
  );
}
