import { ArrowRight } from "lucide-react";

/** "View all N units →" style footer link inside a summary card. */
export function SummaryCardLink({ onClick, children }: Readonly<{ onClick: () => void; children: React.ReactNode }>) {
  return (
    <button type="button" onClick={onClick} className="group/link mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
      {children}
      <ArrowRight className="h-3 w-3 transition-transform group-hover/link:translate-x-0.5" />
    </button>
  );
}
