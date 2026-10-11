"use client";

import { Building2, Globe, Hash, Mail, MapPin, Phone, Trash2, Type, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { EditableField, type EditableFieldProps } from "./editable-field";
import { RowActors } from "./row-actors";
import type { AgentFull } from "../apis/types";

// EditableField keeps its own click-to-edit affordance — this just gives each
// field a visual anchor (icon tile), matching Branches/Institution tabs' treatment.
function Field({ icon: Icon, className, ...field }: Readonly<EditableFieldProps & { icon: LucideIcon }>) {
  return (
    <div className={cn("flex items-start gap-2.5 rounded-lg border border-border bg-muted/20 p-2", className)}>
      <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <EditableField {...field} className="flex-1" />
    </div>
  );
}

export function AgentCard({
  agent,
  selected,
  onToggleSelect,
  onDelete,
  onSaveField,
}: Readonly<{
  agent: AgentFull;
  selected: boolean;
  onToggleSelect: () => void;
  onDelete: () => void;
  onSaveField: (column: string, next: string | null) => Promise<unknown>;
}>) {
  const field = (icon: LucideIcon, label: string, column: keyof AgentFull, span: string, multiline = false) => (
    <Field
      icon={icon}
      label={label}
      value={agent[column] as string | null}
      onSave={(v) => onSaveField(column, v)}
      multiline={multiline}
      className={span}
    />
  );
  return (
    <Card className="group overflow-hidden">
      <div className="-mt-4 flex items-center justify-between gap-2 rounded-t-xl border-b bg-primary/5 px-4 py-3">
        <div className="flex items-center gap-3">
          <Checkbox checked={selected} onCheckedChange={onToggleSelect} />
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Users className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold text-foreground">{agent.name || agent.country || "Unnamed agent"}</span>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="cursor-pointer text-destructive hover:text-destructive"
          title="Delete agent"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <CardContent className="p-4">
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-6">
          {field(Type, "Agent / Agency Name", "name", "col-span-2 md:col-span-3")}
          {field(Mail, "Email", "email", "col-span-2 md:col-span-3")}
          {field(Phone, "Phone", "phone", "col-span-2 md:col-span-3")}
          {field(Globe, "Country", "country", "col-span-2 md:col-span-3")}
          {field(Globe, "Website", "website", "col-span-2 md:col-span-3")}
          {field(Building2, "City", "city", "col-span-2 md:col-span-2")}
          {field(MapPin, "State / Region", "state", "col-span-2 md:col-span-2")}
          {field(Hash, "Postcode", "postcode", "col-span-2 md:col-span-2")}
          {field(MapPin, "Address", "address", "col-span-2 md:col-span-6", true)}
        </div>
        <RowActors row={agent} className="border-t border-border pt-2" />
      </CardContent>
    </Card>
  );
}
