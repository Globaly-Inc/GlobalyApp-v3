import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type Origin = "extracted" | "manual";

/** Where a record came from: found by the website extraction, or added by hand. Shared by the
 * Services, Scholarships and Branches tabs so the three read the same. */
export function OriginChip({ origin }: Readonly<{ origin: Origin }>) {
  return origin === "extracted" ? (
    <Badge variant="outline" className="shrink-0 border-sky-200 bg-sky-50 text-[10px] text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300" title="Found by the website extraction">
      <Sparkles className="animate-twinkle size-2.5" />
      Extracted
    </Badge>
  ) : (
    <Badge variant="outline" className="shrink-0 border-violet-200 bg-violet-50 text-[10px] text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-300" title="Added by hand">
      Manual
    </Badge>
  );
}
