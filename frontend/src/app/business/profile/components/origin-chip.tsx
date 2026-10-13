import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type Origin = "extracted" | "manual";

/** Where a record came from: found by the website extraction, or added by hand. Shared by the
 * Services, Scholarships and Branches tabs so the three read the same. */
export function OriginChip({ origin }: Readonly<{ origin: Origin }>) {
  return origin === "extracted" ? (
    <Badge variant="outline" className="shrink-0 border-info/30 bg-info/10 text-xs text-info" title="Found by the website extraction">
      <Sparkles className="animate-twinkle size-2.5" />
      Extracted
    </Badge>
  ) : (
    <Badge variant="outline" className="shrink-0 border-chart-4/30 bg-chart-4/10 text-xs text-chart-4" title="Added by hand">
      Manual
    </Badge>
  );
}
