"use client";

import { useEffect, useState } from "react";
import { GripVertical, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { categoriesApi } from "../apis";
import type { SchemaField, SchemaFieldInput } from "../apis/types";

const FIELD_TYPES: { value: SchemaField["type"]; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "select", label: "Select" },
  { value: "multi_select", label: "Multi Select" },
  { value: "boolean", label: "Boolean" },
  { value: "date", label: "Date" },
];

function toKey(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

const emptyDraft: SchemaFieldInput = { label: "", key: "", type: "text", is_required: false, filterable: false, is_default: false };

export function SchemaFieldsEditor({
  kind,
  categoryId,
}: Readonly<{ kind: "business" | "service"; categoryId: number | null }>) {
  const [fields, setFields] = useState<SchemaField[]>([]);
  const [draft, setDraft] = useState<SchemaFieldInput | null>(null);
  const [newOption, setNewOption] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (categoryId === null) return;
    setLoading(true);
    categoriesApi
      .getSchemaFields(kind, categoryId)
      .then(setFields)
      .catch(() => toast.error("Couldn't load schema fields"))
      .finally(() => setLoading(false));
  }, [kind, categoryId]);

  const saveField = async (id: number, patch: Partial<SchemaFieldInput>) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    try {
      const updated = await categoriesApi.updateSchemaField(id, patch);
      setFields((prev) => prev.map((f) => (f.id === id ? updated : f)));
      toast.success("Field updated");
    } catch (e) {
      toast.error("Couldn't save field", { description: e instanceof Error ? e.message : "Please try again." });
    }
  };

  const removeField = async (id: number) => {
    const previous = fields;
    setFields((prev) => prev.filter((f) => f.id !== id));
    try {
      await categoriesApi.deleteSchemaField(id);
    } catch (e) {
      setFields(previous);
      toast.error("Couldn't remove field", { description: e instanceof Error ? e.message : "Please try again." });
    }
  };

  const commitDraft = async () => {
    if (!draft || categoryId === null || !draft.label.trim() || !draft.key.trim()) return;
    try {
      const row = await categoriesApi.createSchemaField(kind, categoryId, draft);
      setFields((prev) => [...prev, row]);
      setDraft(null);
      toast.success("Field added");
    } catch (e) {
      toast.error("Couldn't add field", { description: e instanceof Error ? e.message : "Please try again." });
    }
  };

  const addOption = (id: number, isDraft: boolean) => {
    const val = (newOption[id] || "").trim();
    if (!val) return;
    if (isDraft && draft) {
      setDraft({ ...draft, options: [...(draft.options ?? []), val] });
    } else {
      const field = fields.find((f) => f.id === id);
      if (field) void saveField(id, { options: [...(field.options ?? []), val] });
    }
    setNewOption((p) => ({ ...p, [id]: "" }));
  };

  const removeOption = (id: number, optIdx: number, isDraft: boolean) => {
    if (isDraft && draft) {
      setDraft({ ...draft, options: (draft.options ?? []).filter((_, i) => i !== optIdx) });
    } else {
      const field = fields.find((f) => f.id === id);
      if (field) void saveField(id, { options: (field.options ?? []).filter((_, i) => i !== optIdx) });
    }
  };

  if (categoryId === null) {
    return <p className="text-sm text-muted-foreground">Save the category first to add schema fields.</p>;
  }

  const rows: { key: number; isDraft: boolean; value: SchemaField | SchemaFieldInput }[] = [
    ...fields.map((f) => ({ key: f.id, isDraft: false, value: f })),
    ...(draft ? [{ key: -1, isDraft: true, value: draft }] : []),
  ];

  return (
    <div className="space-y-3">
      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {rows.map(({ key: rowKey, isDraft, value: field }) => (
        <Card key={rowKey} size="sm">
          <CardContent className="space-y-3">
            <div className="flex items-start gap-2">
              <GripVertical className="mt-2.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs">Label</Label>
                  <Input
                    className="h-9"
                    value={field.label}
                    onChange={(e) => {
                      const label = e.target.value;
                      const patch = { label, key: field.key || toKey(label) };
                      if (isDraft) setDraft({ ...(draft ?? emptyDraft), ...patch });
                      else setFields((prev) => prev.map((f) => (f.id === rowKey ? { ...f, ...patch } : f)));
                    }}
                    onBlur={() => (isDraft ? undefined : saveField(rowKey, { label: field.label, key: field.key }))}
                    placeholder="e.g. Field of Study"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Key</Label>
                  <Input
                    className="h-9"
                    value={field.key}
                    onChange={(e) => {
                      const key = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "");
                      if (isDraft) setDraft({ ...(draft ?? emptyDraft), key });
                      else setFields((prev) => prev.map((f) => (f.id === rowKey ? { ...f, key } : f)));
                    }}
                    onBlur={() => (isDraft ? undefined : saveField(rowKey, { key: field.key }))}
                    placeholder="field_of_study"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Type</Label>
                  <Select
                    value={field.type}
                    onValueChange={(v) => {
                      const type = String(v) as SchemaField["type"];
                      if (isDraft) setDraft({ ...(draft ?? emptyDraft), type });
                      else void saveField(rowKey, { type });
                    }}
                  >
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="mt-1 shrink-0"
                onClick={() => (isDraft ? setDraft(null) : removeField(rowKey))}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>

            <div className="flex items-center gap-6 pl-6">
              <label className="flex items-center gap-2 text-xs">
                <Switch
                  checked={field.is_required ?? false}
                  onCheckedChange={(v) =>
                    isDraft ? setDraft({ ...(draft ?? emptyDraft), is_required: v }) : void saveField(rowKey, { is_required: v })
                  }
                />
                Required
              </label>
              <label className="flex items-center gap-2 text-xs">
                <Switch
                  checked={field.filterable ?? false}
                  onCheckedChange={(v) =>
                    isDraft ? setDraft({ ...(draft ?? emptyDraft), filterable: v }) : void saveField(rowKey, { filterable: v })
                  }
                />
                Filterable
              </label>
              <label className="flex items-center gap-2 text-xs">
                <Switch
                  checked={field.is_default ?? false}
                  onCheckedChange={(v) =>
                    isDraft ? setDraft({ ...(draft ?? emptyDraft), is_default: v }) : void saveField(rowKey, { is_default: v })
                  }
                />
                Default
              </label>
            </div>

            {(field.type === "select" || field.type === "multi_select") && (
              <div className="space-y-2 pl-6">
                <Label className="text-xs">Options</Label>
                <div className="flex flex-wrap gap-1.5">
                  {(field.options ?? []).map((opt, oi) => (
                    <Badge key={opt} variant="secondary" className="h-6 gap-1 pr-1">
                      {opt}
                      <button type="button" onClick={() => removeOption(rowKey, oi, isDraft)} className="ml-0.5 hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex max-w-xs gap-2">
                  <Input
                    value={newOption[rowKey] ?? ""}
                    onChange={(e) => setNewOption((p) => ({ ...p, [rowKey]: e.target.value }))}
                    placeholder="Add option…"
                    className="h-8 text-xs"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addOption(rowKey, isDraft);
                      }
                    }}
                  />
                  <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => addOption(rowKey, isDraft)}>
                    Add
                  </Button>
                </div>
              </div>
            )}

            {isDraft && (
              <div className="flex justify-end pl-6">
                <Button type="button" size="sm" onClick={commitDraft} disabled={!field.label.trim() || !field.key.trim()}>
                  Save field
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {!draft && (
        <Button type="button" variant="outline" className="w-full gap-2" onClick={() => setDraft(emptyDraft)}>
          <Plus className="h-4 w-4" /> Add Field
        </Button>
      )}
    </div>
  );
}
