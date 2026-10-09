import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

export type TileParts = { top: string; main: string; bottom: string };

/** Calendar-page tile: month / day / year (or month / year for partial dates), or a plain
 * calendar icon when the intake has no date at all. `muted` for past or undated intakes. */
export function IntakeDateTile({ parts, muted = false, large = false }: Readonly<{ parts: TileParts | null; muted?: boolean; large?: boolean }>) {
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col items-center justify-center rounded-[10px] text-center leading-tight",
        large ? "min-h-16 w-[58px] py-2" : "min-h-12 w-11 py-1.5",
        muted || !parts ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground",
      )}
    >
      {parts ? (
        <>
          {parts.top && <span className="font-mono text-[10px] font-semibold uppercase tracking-wider opacity-85">{parts.top}</span>}
          <span className={cn("font-bold", large ? "text-[22px]" : "text-[17px]")}>{parts.main}</span>
          {parts.bottom && <span className="font-mono text-[9.5px] opacity-75">{parts.bottom}</span>}
        </>
      ) : (
        <Calendar className="h-5 w-5" aria-label="No date set" />
      )}
    </div>
  );
}
