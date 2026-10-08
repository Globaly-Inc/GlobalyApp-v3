import { cn } from "@/lib/utils";

export function HowBranchesWork({ className }: Readonly<{ className?: string }>) {
  return (
    <div className={cn("flex flex-col gap-1 rounded-lg border border-border bg-muted/50 p-3", className)}>
      <p className="text-sm font-medium text-foreground">How branches work</p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        A branch is a new office linked to your primary business. It shares your business category and can access
        shared services from other offices. Each branch operates as its own entity with separate contact details,
        media, and team.
      </p>
    </div>
  );
}
