"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Link2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/combobox";
import type { JunctionSlug } from "../apis/types";

/** One linkable section: the rows already attached to this course + a picker to attach more. */
export function LinkSection<T extends { id: string }>({
  icon: Icon,
  title,
  junction,
  linked,
  available,
  labelOf,
  descriptionOf,
  metaOf,
  emptyText,
  linkLabel,
  busy,
  onLink,
  onUnlink,
  onCreate,
  searchPlaceholder,
  optionsHeading,
  renderRows,
  rowIcon,
  children,
  headerExtra,
}: Readonly<{
  icon: LucideIcon;
  title: string;
  junction: JunctionSlug;
  linked: T[];
  available: T[];
  labelOf: (item: T) => string;
  descriptionOf?: (item: T) => string | undefined;
  metaOf?: (item: T) => string | null;
  emptyText: string;
  linkLabel: string;
  busy: boolean;
  onLink: (junction: JunctionSlug, entityId: string) => void;
  onUnlink: (junction: JunctionSlug, entityId: string) => void;
  /** Set to allow typing a brand-new entity name in the picker. */
  onCreate?: (name: string) => void;
  searchPlaceholder?: string;
  optionsHeading?: string;
  /** Replaces the default row list — used where the design wants a custom layout. */
  renderRows?: (linked: T[], unlink: (id: string) => void) => React.ReactNode;
  rowIcon?: LucideIcon;
  children?: React.ReactNode;
  headerExtra?: React.ReactNode;
}>) {
  const [picking, setPicking] = useState(false);
  const unlinked = available.filter((a) => !linked.some((l) => l.id === a.id));
  const RowIcon = rowIcon ?? Icon;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold">
          <Icon className="h-3.5 w-3.5 text-primary" />
          {title}
        </h4>
        <div className="flex items-center gap-1.5">
          {headerExtra}
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs cursor-pointer"
            disabled={busy}
            onClick={() => setPicking((p) => !p)}
          >
            <Link2 className="h-3 w-3" />
            {linkLabel}
          </Button>
        </div>
      </div>

      {picking && (
        <Combobox
          options={unlinked.map((a) => ({ value: a.id, label: labelOf(a), description: descriptionOf?.(a) }))}
          value=""
          onChange={(picked) => {
            setPicking(false);
            // With `creatable` the combobox hands back raw text when nothing matched.
            if (unlinked.some((a) => a.id === picked)) onLink(junction, picked);
            else onCreate?.(picked);
          }}
          placeholder={unlinked.length || onCreate ? `Select ${title.toLowerCase()}…` : "Nothing left to link"}
          searchPlaceholder={searchPlaceholder}
          optionsHeading={optionsHeading}
          creatable={Boolean(onCreate)}
          disabled={unlinked.length === 0 && !onCreate}
          className="h-8 text-xs"
        />
      )}

      {children}

      {renderRows ? (
        renderRows(linked, (id) => onUnlink(junction, id))
      ) : linked.length === 0 && !children ? (
        <p className="rounded-md bg-muted/50 py-2 text-center text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        linked.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-sm">
            <span className="flex min-w-0 items-center gap-1.5">
              <RowIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{labelOf(item)}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {metaOf?.(item) && <span className="text-xs text-muted-foreground">{metaOf(item)}</span>}
              <Button
                variant="ghost"
                size="icon-xs"
                className="cursor-pointer"
                title="Unlink"
                disabled={busy}
                onClick={() => onUnlink(junction, item.id)}
              >
                <X className="h-3 w-3" />
              </Button>
            </span>
          </div>
        ))
      )}
    </section>
  );
}
