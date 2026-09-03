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
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
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
              <Pencil className="h-4 w-4" />
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
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
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
              className="gap-1.5 opacity-100 transition-opacity group-focus-within/card:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/card:opacity-100"
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {count === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
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
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-foreground">{value || "—"}</p>
    </div>
  );
}
