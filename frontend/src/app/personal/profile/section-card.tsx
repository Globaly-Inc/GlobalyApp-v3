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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title}
          {badge}
        </CardTitle>
        {onEdit && (
          <CardAction>
            <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label={`Edit ${title}`}>
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
}: Readonly<{
  icon: ComponentType<{ className?: string }>;
  title: string;
  count: number;
  onAdd: () => void;
  children: React.ReactNode;
  emptyText: string;
}>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {title}
          {count > 0 && <Badge variant="secondary">{count}</Badge>}
        </CardTitle>
        <CardAction>
          <Button variant="ghost" size="icon-sm" onClick={onAdd} aria-label={`Add ${title}`}>
            <Plus className="h-4 w-4" />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        {count === 0 ? <p className="text-sm text-muted-foreground">{emptyText}</p> : children}
      </CardContent>
    </Card>
  );
}

export function Field({ label, value }: Readonly<{ label: string; value: React.ReactNode }>) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{value || "—"}</p>
    </div>
  );
}
