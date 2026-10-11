import { FileText, ImageOff, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { TableCell, TableRow } from "@/components/ui/table";
import type { GuideWithLeadCount } from "../apis/types";

/** Column headers for the rows below — kept beside the row so the two can't drift apart. */
export const GUIDE_COLUMNS = [
  { label: "Guide" },
  { label: "Status" },
  { label: "PDF", className: "hidden md:table-cell" },
  { label: "Leads", className: "hidden md:table-cell", numeric: true },
  { label: "Published", className: "w-px" },
  { label: "Actions", className: "w-px", srOnly: true },
] as const;

export function GuideRow({
  guide,
  onEdit,
  onDelete,
  onTogglePublish,
}: Readonly<{
  guide: GuideWithLeadCount;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePublish: (next: boolean) => void;
}>) {
  const thumb = guide.pdf_cover_image_url ?? guide.background_image_url;
  return (
    <TableRow>
      <TableCell primary>
        <div className="flex min-w-0 items-center gap-3">
          <div className="size-10 shrink-0 overflow-hidden rounded-md bg-muted">
            {thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumb} alt="" className="size-full object-cover" />
            ) : (
              <div className="flex size-full items-center justify-center text-muted-foreground">
                <ImageOff className="size-4" aria-hidden />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{guide.title}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {guide.country && <Badge variant="outline">{guide.country}</Badge>}
              <span className="truncate">/guides/{guide.slug}</span>
            </div>
            {/* Fallbacks for the PDF and Leads columns hidden below md. */}
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground md:hidden">
              {guide.pdf_url ? (
                <span className="inline-flex items-center gap-1"><FileText className="size-3" aria-hidden /> PDF</span>
              ) : (
                <Badge variant="warning">No PDF yet</Badge>
              )}
              <span>{guide.lead_count} leads</span>
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={guide.is_published ? "success" : "secondary"}>{guide.is_published ? "Published" : "Draft"}</Badge>
      </TableCell>
      <TableCell className="hidden md:table-cell">
        {guide.pdf_url ? (
          <span className="inline-flex items-center gap-1 text-muted-foreground"><FileText className="size-3.5" aria-hidden /> PDF</span>
        ) : (
          <Badge variant="warning">No PDF yet</Badge>
        )}
      </TableCell>
      <TableCell numeric className="hidden text-muted-foreground md:table-cell">{guide.lead_count}</TableCell>
      <TableCell>
        <Switch checked={guide.is_published} onCheckedChange={onTogglePublish} aria-label={`Published: ${guide.title}`} />
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${guide.title}`} onClick={onEdit}>
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Delete ${guide.title}`}
            className="text-muted-foreground hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
