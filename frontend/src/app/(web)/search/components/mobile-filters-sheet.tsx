"use client";

import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function MobileFiltersSheet({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <Sheet>
      <SheetTrigger
        render={<Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0 md:hidden" />}
      >
        <SlidersHorizontal className="h-4 w-4" />
        <span className="sr-only">Filters</span>
      </SheetTrigger>
      <SheetContent side="left" className="overflow-y-auto">
        <SheetTitle className="sr-only">Filter &amp; Refine</SheetTitle>
        <div className="p-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
