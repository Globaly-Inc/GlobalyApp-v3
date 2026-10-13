import type { ComponentType } from "react";
import { Pencil, Plus } from "lucide-react";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function SectionCard({
  icon: Icon,
  title,
  badge,
  onEdit,
  children,
}: Readonly<{
  icon: ComponentType<{ className?: string }>;
  title: string;
  badge?: React.ReactNode;
  onEdit?: () => void;
  children: React.ReactNode;
}>) {
  return (
    <Card className="group/card">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          {title}
          {badge}
        </CardTitle>
        {onEdit && (
          <CardAction>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onEdit}
              aria-label={`Edit ${title}`}
              className="opacity-100 transition-opacity group-focus-within/card:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/card:opacity-100"
            >
              <Pencil />
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function OneToManySection({
  icon: Icon,
  title,
  count,
  onAdd,
  children,
  emptyText,
  badge,
}: Readonly<{
  icon: ComponentType<{ className?: string }>;
  title: string;
  count: number;
  onAdd?: () => void;
  children: React.ReactNode;
  emptyText: string;
  badge?: React.ReactNode;
}>) {
  return (
    <Card className="group/card">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          {title}
          {count > 0 && <Badge variant="secondary">{count}</Badge>}
          {badge}
        </CardTitle>
        {onAdd && (
          <CardAction>
            <Button
              variant="outline"
              size="sm"
              onClick={onAdd}
              aria-label={`Add ${title}`}
            >
              <Plus />
              Add
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {count === 0 ? (
          <p className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

export function Field({ label, value }: Readonly<{ label: string; value: React.ReactNode }>) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-words text-sm font-medium text-foreground">{value || "—"}</p>
    </div>
  );
}
