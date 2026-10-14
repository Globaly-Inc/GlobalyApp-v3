"use client";

import type { LucideIcon } from "lucide-react";
import { Copy, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DescriptionItem } from "@/components/ui/description-list";

/**
 * One item of the portal's Contact card: icon + label, value, and a copy button that shows on
 * hover/focus (always on touch). The public site keeps its own ContactRow; this one adds the "+ Add …" empty state.
 */
export function ContactInfoRow({
  icon: Icon, label, value, href, onAdd,
}: Readonly<{
  icon: LucideIcon;
  label: string;
  value: string | null | undefined;
  /** Renders the value as a link (the website). */
  href?: string;
  /** Opens the edit form from an empty row; omitted when read-only. */
  onAdd?: () => void;
}>) {
  const copy = () => {
    if (!value) return;
    if (!navigator.clipboard) {
      toast.error("Copy isn't available here");
      return;
    }
    navigator.clipboard.writeText(href ?? value).then(
      () => toast.success("Copied"),
      () => toast.error("Couldn't copy"),
    );
  };

  let content: React.ReactNode;
  if (value && href) {
    content = (
      <a href={href} target="_blank" rel="noopener noreferrer" className="break-words text-primary hover:underline">
        {value}
      </a>
    );
  } else if (value) {
    content = <span className="break-words">{value}</span>;
  } else if (onAdd) {
    content = (
      <button type="button" onClick={onAdd} className="inline-flex cursor-pointer items-center gap-1 text-primary hover:underline">
        <Plus className="size-3.5" /> Add {label.toLowerCase()}
      </button>
    );
  } else {
    content = <span className="font-normal text-muted-foreground">Not set</span>;
  }

  return (
    <DescriptionItem
      className="group/row"
      label={
        <span className="flex items-center gap-1.5">
          <Icon className="size-3.5 shrink-0" aria-hidden /> {label}
        </span>
      }
    >
      <span className="flex min-w-0 items-center gap-1">
        <span className="min-w-0 flex-1">{content}</span>
        {value && (
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={`Copy ${label.toLowerCase()}`}
            className="shrink-0 opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
            onClick={copy}
          >
            <Copy />
          </Button>
        )}
      </span>
    </DescriptionItem>
  );
}
