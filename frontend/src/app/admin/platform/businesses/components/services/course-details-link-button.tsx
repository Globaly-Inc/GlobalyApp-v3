"use client";

import { DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Row-action shortcut from the admin services list into the service editor's Summary tab
 * (where price/category/description live) — replaces an earlier inline price-edit popover. */
export function CourseDetailsLinkButton({ onClick }: Readonly<{ onClick: () => void }>) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button size="icon-sm" variant="ghost" aria-label="Course Details" onClick={onClick}>
            <DollarSign className="h-4 w-4" />
          </Button>
        }
      />
      <TooltipContent>Course Details</TooltipContent>
    </Tooltip>
  );
}
