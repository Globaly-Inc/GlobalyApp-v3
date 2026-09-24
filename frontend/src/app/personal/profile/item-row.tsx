import type { ComponentType, ReactNode } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ItemRow({
  title,
  titleBadge,
  subtitle,
  meta,
  imageUrl,
  icon: Icon,
  onEdit,
  onDelete,
}: Readonly<{
  title: string;
  titleBadge?: ReactNode;
  subtitle?: string | null;
  meta?: ReactNode;
  imageUrl?: string | null;
  icon?: ComponentType<{ className?: string }>;
  /** Omit both to render a read-only row with no action tray (preview mode). */
  onEdit?: () => void;
  onDelete?: () => void;
}>) {
  return (
    <div className="group flex items-stretch gap-3 rounded-lg border border-border p-4 transition-shadow hover:ring-1 hover:ring-primary/20">
      {(imageUrl || Icon) && (
        <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-primary/10 p-2">
          {imageUrl ? (
            <img src={imageUrl} alt="" className="h-full w-full object-contain" />
          ) : (
            Icon && <Icon className="h-6 w-6 text-primary" />
          )}
        </div>
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <div className={cn("flex flex-wrap items-center gap-2")}>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          {titleBadge}
        </div>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        {meta && <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">{meta}</div>}
      </div>
      {(onEdit || onDelete) && (
        // Visible by default — touch and keyboard users have no hover state to reveal these
        // otherwise. Only devices that actually support hover (a mouse) dim them until hover
        // or keyboard focus, via the `(hover: hover)` media feature rather than a screen-size
        // breakpoint, which would wrongly key this off viewport width instead of input type.
        <div
          className={cn(
            "flex shrink-0 items-center gap-1 opacity-100 transition-opacity group-focus-within:opacity-100",
            "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100",
          )}
        >
          {onEdit && (
            <Button variant="ghost" size="icon-xs" onClick={onEdit} aria-label="Edit">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {onDelete && (
            <Button variant="ghost" size="icon-xs" onClick={onDelete} aria-label="Delete" className="text-destructive hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
