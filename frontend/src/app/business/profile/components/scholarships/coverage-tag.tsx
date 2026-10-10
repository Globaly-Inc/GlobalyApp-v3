import { GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";

/** 40×30 tag before a scholarship's name (mockup `.covm`): what it covers at a glance. */
export function CoverageTag({ type }: Readonly<{ type: string | null }>) {
  // ponytail: partial tuition has no stored percentage, so it reads "Part" where the mockup shows "50%".
  const [text, tone] =
    type === "full_tuition" ? ["100%", "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"]
    : type === "stipend" || type === "living_allowance" ? ["$", "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"]
    : type === "partial_tuition" ? ["Part", "bg-primary/10 text-primary"]
    : [null, "bg-primary/10 text-primary"];
  return (
    <span className={cn("grid h-7.5 w-10 shrink-0 place-items-center rounded-lg font-mono text-[11px] font-bold", tone)}>
      {text ?? <GraduationCap className="h-4 w-4" />}
    </span>
  );
}
