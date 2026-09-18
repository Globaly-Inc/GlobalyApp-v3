import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/**
 * The bordered-header card every section of a public profile sits in (ported from V1). The
 * business portal renders its editable sections through this too, passing `action` for the
 * privacy pill and edit pencil V1 put at the right end of the same header row.
 *
 * `group/card` is for those actions: V1 faded the pencil in on card hover, so a caller can put
 * `opacity-0 group-hover/card:opacity-100` on it without owning the group itself.
 */
export function ProfileSection({
  icon: Icon, title, count, badge, action, children,
}: Readonly<{
  icon: LucideIcon;
  title: string;
  count?: number;
  /**
   * Sits inline with the title, after the count — where V1 put the Public/Private pill. Status
   * about the section reads as part of its heading; controls that act on it belong in `action`.
   */
  badge?: React.ReactNode;
  /** Right-aligned header controls — the edit pencil, "Add media", and the like. */
  action?: React.ReactNode;
  children: React.ReactNode;
}>) {
  return (
    <div className="group/card overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <Icon className="h-5 w-5 shrink-0 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {count != null && <Badge variant="secondary" className="text-xs">{count}</Badge>}
        {badge}
        {action && <div className="ml-auto flex shrink-0 items-center gap-1.5">{action}</div>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

/** Scraped rows often store bare hostnames — the browser would treat those as relative paths. */
export function externalUrl(url: string): string {
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}
