import { GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";

/** 40×30 tag before a scholarship's name (mockup `.covm`): what it covers at a glance. */
export function CoverageTag({ type }: Readonly<{ type: string | null }>) {
  // ponytail: partial tuition has no stored percentage, so it reads "Part" where the mockup shows "50%".
  const [text, tone] =
    type === "full_tuition" ? ["100%", "bg-success/10 text-success"]
    : type === "stipend" || type === "living_allowance" ? ["$", "bg-warning/10 text-warning"]
    : type === "partial_tuition" ? ["Part", "bg-primary/10 text-primary"]
    : [null, "bg-primary/10 text-primary"];
  return (
    <span className={cn("grid h-7.5 w-10 shrink-0 place-items-center rounded-lg font-mono text-xs font-bold", tone)}>
      {text ?? <GraduationCap className="h-4 w-4" />}
    </span>
  );
}
