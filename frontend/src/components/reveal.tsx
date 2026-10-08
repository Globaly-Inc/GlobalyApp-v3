import { cn } from "@/lib/utils";

/** Smoothly opens/closes its children (grid-rows 0fr→1fr). Closed content stays mounted but inert,
 * so it keeps its state and can't be tabbed into. */
export function Reveal({ open, className, children }: Readonly<{ open: boolean; className?: string; children: React.ReactNode }>) {
  return (
    <div
      inert={!open}
      className={cn(
        "grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none",
        open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
      )}
    >
      <div className={cn("min-h-0 overflow-hidden", className)}>{children}</div>
    </div>
  );
}
