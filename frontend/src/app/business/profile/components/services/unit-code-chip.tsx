import { cn } from "@/lib/utils";

/** Mono study-unit code chip — primary tint for compulsory, violet for elective. */
export function UnitCodeChip({ elective, className, children }: Readonly<{ elective: boolean; className?: string; children: React.ReactNode }>) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-md px-2 py-1 text-center font-mono text-xs font-semibold",
        elective ? "bg-chart-4/10 text-chart-4" : "bg-primary/10 text-primary",
        className,
      )}
    >
      {children}
    </span>
  );
}
