"use client";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { FALLBACK_FEATURE_META, FEATURE_META, FEATURE_MODULES, MODULE_LABELS } from "../const";
import type { FeatureUsage } from "../apis/types";
import { FeatureCard } from "./feature-card";

export function FeatureUsagePanel({ features }: Readonly<{ features: FeatureUsage[] }>) {
  return (
    <div className="mt-6">
      <h2 className="text-xl font-semibold mb-4">Feature usage by module</h2>
      <Accordion multiple defaultValue={[...FEATURE_MODULES]}>
        {FEATURE_MODULES.map((module) => {
          const items = features.filter(
            (f) => (FEATURE_META[f.key] ?? FALLBACK_FEATURE_META).module === module,
          );
          if (items.length === 0) return null;
          return (
            <AccordionItem key={module} value={module} className="border border-border rounded-lg mb-4 px-4 last:border-b">
              <AccordionTrigger className="hover:no-underline">
                <span className="text-lg font-semibold">{MODULE_LABELS[module]}</span>
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
    </div>
  );
}
