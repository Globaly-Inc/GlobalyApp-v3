/** Chip look shared by both Scholarships tables (mockup `.chip` + its tones). */
export const CHIP = "inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-transparent px-2.5 py-0.5 text-[11px] font-semibold";
export const CHIP_OUTLINE = "border-border text-muted-foreground";
export const CHIP_WARN = "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
export const CHIP_OK = "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";

/** "Applies to" chip per applicable_to value. */
export const APPLIES: Record<string, [string, string]> = {
  both: ["All students", "bg-primary/10 text-primary"],
  domestic: ["Domestic", CHIP_OK],
  international: ["International", "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"],
};

export const fmtDeadline = (d: string) => new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
