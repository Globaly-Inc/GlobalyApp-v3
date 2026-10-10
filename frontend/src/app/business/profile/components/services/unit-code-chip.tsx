import { cn } from "@/lib/utils";

/** Mono study-unit code chip — primary tint for compulsory, violet for elective. */
export function UnitCodeChip({ elective, className, children }: Readonly<{ elective: boolean; className?: string; children: React.ReactNode }>) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-md px-2 py-1 text-center font-mono text-[11.5px] font-semibold",
        elective ? "bg-violet-500/10 text-violet-600 dark:text-violet-400" : "bg-primary/10 text-primary",
        className,
      )}
    >
      {children}
    </span>
  );
}
