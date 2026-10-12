import { Badge } from "@/components/ui/badge";
import { initials, relativeTime } from "@/components/feed/utils";
import { cn } from "@/lib/utils";
import type { ActivityLogEntry } from "../../apis/types";
import { describeActivity } from "../../utils/activity-format";

const MAX_CHANGES = 5;

/** One audit entry: what happened (icon + sentence), to what, which fields, by whom and when. */
export function ActivityRow({ entry }: Readonly<{ entry: ActivityLogEntry }>) {
  const { icon: Icon, title, target, changes } = describeActivity(entry);
  const portal = entry.source === "portal";
  const name = `${entry.admin_first_name ?? ""} ${entry.admin_last_name ?? ""}`.trim() || (portal ? "Portal user" : "Admin");
  const destructive = /^(Deleted|Removed|Cancelled)/.test(title);

  return (
    <div className="flex gap-3 rounded-lg border p-3">
      <div className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
        destructive ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary",
      )}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-medium">{title}</span>
          {target && <> · <span className="text-muted-foreground">{target}</span></>}
        </p>
        {title.startsWith("Updated") && !target && changes.length === 0 && entry.details && Object.keys(entry.details).length <= 1 && (
          <p className="mt-0.5 text-xs text-muted-foreground">No details were recorded for this entry.</p>
        )}
        {changes.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <span className="text-xs text-muted-foreground">Changed:</span>
            {changes.slice(0, MAX_CHANGES).map((c) => (
              <Badge key={c} variant="secondary" className="text-[10px] font-normal capitalize">{c}</Badge>
            ))}
            {changes.length > MAX_CHANGES && (
              <span className="text-xs text-muted-foreground" title={changes.slice(MAX_CHANGES).join(", ")}>
                +{changes.length - MAX_CHANGES} more
              </span>
            )}
          </div>
        )}
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[9px] font-semibold text-foreground">
            {initials(entry.admin_first_name, entry.admin_last_name)}
          </span>
          <span>{name}</span>
          <Badge variant="outline" className={cn("h-4 px-1.5 text-[9px]", portal ? "border-violet-200 text-violet-700 dark:border-violet-900 dark:text-violet-300" : "")}>
            {portal ? "Portal" : "Superadmin"}
          </Badge>
          <span>·</span>
          <time dateTime={entry.created_at} title={new Date(entry.created_at).toLocaleString()}>{relativeTime(entry.created_at)}</time>
        </div>
      </div>
    </div>
  );
}
