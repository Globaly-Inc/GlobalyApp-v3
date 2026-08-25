import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/** The bordered-header card every section of a public profile sits in (ported from V1). */
export function ProfileSection({
  icon: Icon, title, count, children,
}: Readonly<{ icon: LucideIcon; title: string; count?: number; children: React.ReactNode }>) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <Icon className="h-5 w-5 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {count != null && <Badge variant="secondary" className="ml-auto text-xs">{count}</Badge>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

/** Scraped rows often store bare hostnames — the browser would treat those as relative paths. */
export function externalUrl(url: string): string {
  return url.startsWith("http") ? url : `https://${url}`;
}
