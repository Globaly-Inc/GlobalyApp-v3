"use client";

import { DollarSign, Eye, EyeOff, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DynamicIcon } from "@/components/dynamic-icon";
import { PriceEditPopover } from "@/app/admin/platform/businesses/components/services/price-edit-popover";
import type { BusinessService } from "../../apis/types";
import { formatServiceDate, formatServicePrice } from "../../utils";

/** Callbacks the Actions column fires. Omitted entirely for a read-only (institution) table. */
export type ServiceRowActions = {
  onEdit: (id: string) => void;
  onTogglePublish: (id: string, next: boolean) => void;
  onEditFees: (service: BusinessService) => void;
  onPriceSave: (id: string, price: number) => Promise<void>;
  onDelete: (service: BusinessService) => void;
};

const Dash = () => <span className="text-xs text-muted-foreground">—</span>;

function ActionsCell({ service, actions }: Readonly<{ service: BusinessService; actions: ServiceRowActions }>) {
  return (
    // Row click opens the editor, so every control here has to stop the event reaching it.
    <div className="flex min-w-[120px] items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <Button size="icon-sm" variant="ghost" aria-label="Edit service" onClick={() => actions.onEdit(service.id)}>
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={service.is_published ? "Unpublish service" : "Publish service"}
        onClick={() => actions.onTogglePublish(service.id, !service.is_published)}
      >
        {service.is_published ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </Button>
      {/* Courses price through their fee schedule inside the editor; everything else gets the
          quick fee dialog here, matching V1's placement of this button. */}
      {service.category_slug !== "courses" && (
        <Button size="icon-sm" variant="ghost" aria-label="Edit fees" onClick={() => actions.onEditFees(service)}>
          <DollarSign className="h-3.5 w-3.5" />
        </Button>
      )}
      <Button
        size="icon-sm"
        variant="ghost"
        className="text-destructive"
        aria-label="Delete service"
        onClick={() => actions.onDelete(service)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export function ServiceTableCell({
  service,
  column,
  actions,
}: Readonly<{ service: BusinessService; column: string; actions?: ServiceRowActions }>) {
  switch (column) {
    case "name":
      return (
        <div className="flex min-w-[280px] max-w-[360px] items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <DynamicIcon name={service.category_icon} fallback="Package" className="h-4 w-4 text-primary" />
          </div>
          <span className="line-clamp-2 text-sm font-medium whitespace-normal">{service.name}</span>
        </div>
      );
    case "actions":
      return actions ? <ActionsCell service={service} actions={actions} /> : null;
    case "category":
      return service.category_name ? (
        <Badge variant="secondary" className="text-xs">{service.category_name}</Badge>
      ) : <Dash />;
    case "degree_level":
      return service.degree_level ? <span className="text-xs">{service.degree_level}</span> : <Dash />;
    case "area_of_study":
      return service.area_of_study ? <span className="text-xs">{service.area_of_study}</span> : <Dash />;
    case "duration":
      return service.duration ? <span className="text-xs whitespace-nowrap">{service.duration}</span> : <Dash />;
    case "price":
      return (
        <div className="flex items-center gap-1 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
          <span className="text-xs font-medium">{formatServicePrice(service.price)}</span>
          {actions && <PriceEditPopover price={service.price} onSave={(next) => actions.onPriceSave(service.id, next)} />}
        </div>
      );
    case "status":
      return (
        <Badge variant={service.is_published ? "default" : "secondary"} className="text-xs">
          {service.is_published ? "Published" : "Draft"}
        </Badge>
      );
    case "description":
      return service.description ? (
        <span className="line-clamp-2 max-w-[220px] text-xs whitespace-normal text-muted-foreground">{service.description}</span>
      ) : <Dash />;
    case "created_at":
      return <span className="text-xs whitespace-nowrap text-muted-foreground">{formatServiceDate(service.created_at)}</span>;
    case "updated_at":
      return <span className="text-xs whitespace-nowrap text-muted-foreground">{formatServiceDate(service.updated_at)}</span>;
    default:
      return null;
  }
}
