"use client";

import { ExternalLink, FileText, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/components/feed/utils";
import { cn } from "@/lib/utils";
import { ACTIONS } from "@/app/business/profile/components/portal-ui/portal-ui";
import type { SiteUrl } from "../../apis/types";
import { SITE_URL_CATEGORIES } from "./site-url-categories";

function splitUrl(url: string): { host: string; path: string } {
  try {
    const u = new URL(url);
    return { host: u.host, path: `${u.pathname}${u.search}${u.hash}` };
  } catch {
    return { host: "", path: url };
  }
}

/** One crawled page (mockup `.pg`): category dot + label, host-muted mono URL, always-visible actions. */
export function SiteUrlRow({
  row,
  index,
  viewOnly,
  refreshing,
  opening,
  onRefresh,
  onView,
}: Readonly<{
  row: SiteUrl;
  index: number;
  viewOnly: boolean;
  /** The re-pull request for this row is in flight. */
  refreshing: boolean;
  opening: boolean;
  onRefresh: () => void;
  onView: () => void;
}>) {
  const cat = row.category ? SITE_URL_CATEGORIES[row.category] : null;
  const { host, path } = splitUrl(row.url);

  return (
    <div
      className="animate-row-rise grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b px-3.5 py-2.75 transition-colors last:border-b-0 hover:bg-muted/60 sm:grid-cols-[110px_minmax(0,1fr)_auto]"
      style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}
    >
      <span className="col-span-full inline-flex min-w-0 items-center gap-1.5 text-[11.5px] font-semibold sm:col-span-1">
        <i className={cn("h-2 w-2 shrink-0 rounded-[3px]", cat?.dot ?? "bg-muted-foreground/40")} />
        <span className="truncate">{cat?.label ?? "Unclassified"}</span>
      </span>
      <div className="flex min-w-0 items-baseline gap-1.5">
        <a
          href={row.url}
          target="_blank"
          rel="noopener noreferrer"
          title={row.url}
          className="truncate font-mono text-[13px] font-medium hover:text-primary"
        >
          {host && <span className="text-muted-foreground">{host}</span>}
          {path}
        </a>
        <ExternalLink className="h-3 w-3 shrink-0 self-center text-muted-foreground" aria-hidden />
      </div>
      <div className={ACTIONS}>
        {row.category_source === "admin" && (
          <ShieldCheck className="mr-1 h-3.5 w-3.5 text-emerald-500" aria-label="Category set by an admin" />
        )}
        <span className="mr-1 hidden whitespace-nowrap font-mono text-[11px] font-medium text-muted-foreground md:inline" title={new Date(row.created_at).toLocaleString()}>
          found {relativeTime(row.created_at)}
        </span>
        {!viewOnly && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-7.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onRefresh}
            disabled={refreshing}
            title="Read this page again"
            aria-label="Read this page again"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="ml-0.5 h-7 gap-1.5 rounded-[10px] bg-card px-2.5 text-xs font-semibold"
          disabled={opening}
          onClick={onView}
          title="See what was extracted from this page"
        >
          {opening ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="size-3.25" />}
          View
        </Button>
      </div>
    </div>
  );
}
