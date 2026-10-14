/** Chip look shared by both Scholarships tables (mockup `.chip` + its tones). */
export const CHIP = "inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-transparent px-2.5 py-0.5 text-xs font-semibold";
export const CHIP_OUTLINE = "border-border text-muted-foreground";
export const CHIP_WARN = "bg-warning/10 text-warning";
export const CHIP_OK = "bg-success/10 text-success";

/** "Applies to" chip per applicable_to value. */
export const APPLIES: Record<string, [string, string]> = {
  both: ["All students", "bg-primary/10 text-primary"],
  domestic: ["Domestic", CHIP_OK],
  international: ["International", "bg-chart-4/10 text-chart-4"],
};

export const fmtDeadline = (d: string) => new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
