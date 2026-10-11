"use client";

import { Tabs, TabsCount, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** Optional trailing tally — rendered muted so the label stays the thing you read first. */
  count?: number;
}

/**
 * In-page section switcher (admin Categories and Users, personal enquiries, business lists…). Built on `ui/tabs`, so it
 * has real tab semantics and arrow-key movement; the page renders the matching section itself.
 */
export function SectionTabs<T extends string>({
  options,
  value,
  onChange,
  className,
}: Readonly<{ options: readonly SegmentOption<T>[]; value: T; onChange: (value: T) => void; className?: string }>) {
  return (
    <Tabs value={value} onValueChange={(next) => onChange(next as T)} className={cn("mb-4", className)}>
      <TabsList>
        {options.map((opt) => (
          <TabsTrigger key={opt.value} value={opt.value}>
            {opt.label}
            {opt.count != null && <TabsCount>{opt.count}</TabsCount>}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
