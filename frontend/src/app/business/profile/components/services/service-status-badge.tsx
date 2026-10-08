import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { BusinessService } from "../../apis/types";

/** Live only when approved AND published — an unapproved course never shows "Published".
 * Keyed on the state so the badge pops in again whenever it changes. */
export function ServiceStatusBadge({ s }: Readonly<{ s: BusinessService }>) {
  let state: { key: string; label: string; tone: string; dot: string; title?: string };
  if (s.approval_status === "pending") {
    state = {
      key: "pending", label: "Awaiting approval", dot: "animate-ai-pulse bg-amber-500",
      tone: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
      title: s.is_published ? "Goes live as soon as it's approved." : "Waiting for approval.",
    };
  } else if (s.approval_status === "needs_changes") {
    state = {
      key: "needs_changes", label: "Needs changes", dot: "bg-red-500",
      tone: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300",
      title: "A problem was found with this course — check its details.",
    };
  } else if (s.is_published) {
    state = {
      key: "published", label: "Published", dot: "bg-emerald-500",
      tone: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300",
    };
  } else {
    state = { key: "draft", label: "Draft", dot: "bg-muted-foreground/50", tone: "text-muted-foreground" };
  }
  return (
    <Badge key={state.key} variant="outline" className={cn("animate-pop-in gap-1.5 text-[10px]", state.tone)} title={state.title}>
      <span className={cn("size-1.5 rounded-full", state.dot)} /> {state.label}
    </Badge>
  );
}
