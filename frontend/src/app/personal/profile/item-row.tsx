import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ItemRow({
  title,
  subtitle,
  meta,
  imageUrl,
  onEdit,
  onDelete,
}: Readonly<{
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  /** Optional leading artwork — test rows show the logo from the platform test catalogue. */
  imageUrl?: string | null;
  onEdit: () => void;
  onDelete: () => void;
}>) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="size-8 shrink-0 rounded object-contain" />
      )}
      {/* flex-1 so the leading image and the text stay packed together on the left, actions on the right. */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate">{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
        {meta && <p className="text-xs text-muted-foreground mt-0.5">{meta}</p>}
      </div>
      <div className="flex shrink-0 gap-1">
        <Button variant="ghost" size="icon-xs" onClick={onEdit} aria-label="Edit">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={onDelete} aria-label="Delete">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
