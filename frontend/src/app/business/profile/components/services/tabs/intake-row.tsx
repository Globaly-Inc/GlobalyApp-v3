import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { cn } from "@/lib/utils";
import { IntakeDateTile, type TileParts } from "./intake-date-tile";

export type IntakeStatus = "upcoming" | "past" | "undated";

const STATUS_BADGE: Record<IntakeStatus, React.ReactNode> = {
  upcoming: <Badge className="text-[10px]">Upcoming</Badge>,
  past: <Badge variant="secondary" className="text-[10px]">Ended</Badge>,
  undated: <Badge variant="outline" className="text-[10px] text-muted-foreground">Date not set</Badge>,
};

/** One intake in the list: date tile, name + status chip, the dates it has, and actions that
 * sit at ~55% opacity until the row is hovered or focused. */
export function IntakeRow({
  name,
  parts,
  status,
  dateBits,
  onEdit,
  onDelete,
}: Readonly<{
  name: string;
  parts: TileParts | null;
  status: IntakeStatus;
  dateBits: string[];
  onEdit: () => void;
  onDelete: () => Promise<void>;
}>) {
  return (
    <div
      className={cn(
        "group/row flex items-center gap-3.5 rounded-[14px] border bg-card p-3 transition-[transform,box-shadow,border-color,opacity] duration-200",
        "hover:-translate-y-px hover:border-primary/25 hover:shadow-[0_10px_28px_-16px_color-mix(in_oklab,var(--primary)_45%,transparent)]",
        status === "past" && "opacity-60 hover:opacity-100",
      )}
    >
      <IntakeDateTile parts={parts} muted={status !== "upcoming"} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold">{name}</p>
          {STATUS_BADGE[status]}
        </div>
        <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {dateBits.length > 0 ? dateBits.map((b) => <span key={b}>{b}</span>) : <span>No dates set yet — edit to add them</span>}
        </p>
      </div>
      <div className="flex items-center gap-1 opacity-55 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100">
        <Button size="icon-sm" variant="ghost" onClick={onEdit} aria-label="Edit intake">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <ConfirmDeleteButton onConfirm={onDelete} label="Delete intake" />
      </div>
    </div>
  );
}
