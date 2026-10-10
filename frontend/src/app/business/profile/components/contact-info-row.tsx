"use client";

import type { LucideIcon } from "lucide-react";
import { Copy, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * One line of the portal's Contact card: icon tile, label, value, and a copy button that shows on
 * hover/focus. The public site keeps its own ContactRow; this one adds the "+ Add …" empty state.
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
      <a href={href} target="_blank" rel="noopener noreferrer" className="break-words text-[13.5px] font-semibold text-primary hover:underline">
        {value}
      </a>
    );
  } else if (value) {
    content = <p className="break-words text-[13.5px] font-semibold">{value}</p>;
  } else if (onAdd) {
    content = (
      <button type="button" onClick={onAdd} className="inline-flex cursor-pointer items-center gap-1 text-[13px] font-semibold text-primary hover:underline">
        <Plus className="size-3.5" /> Add {label.toLowerCase()}
      </button>
    );
  } else {
    content = <p className="text-[13px] italic text-muted-foreground">Not set</p>;
  }

  return (
    <div className="group/row flex items-center gap-3 border-b py-2.5 first:pt-0 last:border-b-0 last:pb-0">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <span className="block text-[11.5px] text-muted-foreground">{label}</span>
        {content}
      </div>
      {value && (
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Copy ${label.toLowerCase()}`}
          className="opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:opacity-100"
          onClick={copy}
        >
          <Copy />
        </Button>
      )}
    </div>
  );
}
