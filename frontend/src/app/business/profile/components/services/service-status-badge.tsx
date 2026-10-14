import { cn } from "@/lib/utils";
import type { BusinessService } from "../../apis/types";

/** Live only when approved AND published — an unapproved course never shows "Published".
 * Keyed on the state so the badge pops in again whenever it changes. */
export function ServiceStatusBadge({ s }: Readonly<{ s: BusinessService }>) {
  let state: { key: string; label: string; tone: string; dot?: string; title?: string };
  if (s.approval_status === "pending") {
    state = {
      key: "pending", label: "Awaiting approval", dot: "animate-ai-pulse",
      tone: "bg-warning/10 text-warning",
      title: s.is_published ? "Goes live as soon as it's approved." : "Waiting for approval.",
    };
  } else if (s.approval_status === "needs_changes") {
    state = {
      key: "needs_changes", label: "Needs changes",
      tone: "bg-destructive/10 text-destructive",
      title: "A problem was found with this course — check its details.",
    };
  } else if (s.is_published) {
    state = { key: "published", label: "Published", tone: "bg-success/10 text-success" };
  } else {
    state = { key: "draft", label: "Draft", tone: "bg-muted text-muted-foreground" };
  }
  return (
    <span key={state.key} title={state.title} className={cn("animate-pop-in inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-[9px] py-[3px] text-xs font-semibold", state.tone)}>
      <span className={cn("size-1.5 rounded-full bg-current", state.dot)} /> {state.label}
    </span>
  );
}
