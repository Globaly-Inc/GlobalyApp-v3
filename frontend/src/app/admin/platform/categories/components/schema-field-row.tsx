"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { SchemaField, SchemaFieldInput, SchemaFieldType } from "../apis/types";
import { SchemaFieldBookingOptions } from "./schema-field-booking-options";

/**
 * One field being configured, whether it is already saved or still a draft.
 *
 * Copy here is deliberately non-technical: an admin configuring Airport Pickup reads "What should the
 * customer tell the provider?", never "schema field" or "JSON". The extra controls (hint text, default,
 * bounds) and the booking-only field types are shown only for an **Other** Service Category — the
 * business and service category forms render by key and would ignore them, and the server rejects the
 * booking-only types for those entity types anyway.
 */

const CORE_TYPES: { value: SchemaFieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Yes / No" },
  { value: "date", label: "Date" },
  { value: "select", label: "Dropdown" },
  { value: "multi_select", label: "Multi-select" },
];

const BOOKING_TYPES: { value: SchemaFieldType; label: string }[] = [
  { value: "long_text", label: "Long text" },
  { value: "time", label: "Time" },
  { value: "datetime", label: "Date & time" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "radio", label: "Radio" },
  { value: "checkbox", label: "Checkboxes" },
];

const OPTION_TYPES = ["select", "multi_select", "radio", "checkbox"];

export function SchemaFieldRow({
  field,
  isDraft,
  isBooking,
  isFirst,
  isLast,
  onLocalChange,
  onSave,
  onDelete,
  onMove,
}: Readonly<{
  field: SchemaField | SchemaFieldInput;
  isDraft: boolean;
  isBooking: boolean;
  isFirst: boolean;
  isLast: boolean;
  /** Update the row in place without a request — used while typing. */
  onLocalChange: (patch: Partial<SchemaFieldInput>) => void;
  /** Persist. A draft keeps everything local until it is created, so this is a no-op for drafts. */
  onSave: (patch: Partial<SchemaFieldInput>) => void;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
}>) {
  const [newOption, setNewOption] = useState("");

  const types = isBooking ? [...CORE_TYPES, ...BOOKING_TYPES] : CORE_TYPES;
  const needsOptions = OPTION_TYPES.includes(field.type);

  // Typing edits locally and persists on blur; a discrete choice persists immediately.
  const edit = (patch: Partial<SchemaFieldInput>) => onLocalChange(patch);
  const commit = (patch: Partial<SchemaFieldInput>) => (isDraft ? onLocalChange(patch) : onSave(patch));

  /**
   * The server refuses to store a dropdown-style field with no options, so switching an existing text
   * field to one is held locally until the first option exists — otherwise the change would 400 and snap
   * back, and there would be no way to ever turn a text field into a dropdown.
   */
  const changeType = (type: SchemaFieldType) => {
    const pending = OPTION_TYPES.includes(type) && (field.options ?? []).length === 0;
    if (pending) onLocalChange({ type });
    else commit({ type });
  };

  const addOption = () => {
    const value = newOption.trim();
    if (!value || (field.options ?? []).map(String).includes(value)) return;
    // Type goes with it, so a type change that was waiting on an option is persisted by the same request.
    commit({ type: field.type, options: [...(field.options ?? []), value] });
    setNewOption("");
  };

  return (
    <Card size="sm">
      <CardContent className="space-y-3">
        <div className="flex items-start gap-2">
          <div className="mt-1 flex shrink-0 flex-col">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              aria-label="Move up"
              disabled={isDraft || isFirst}
              onClick={() => onMove(-1)}
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              aria-label="Move down"
              disabled={isDraft || isLast}
              onClick={() => onMove(1)}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">{isBooking ? "What to ask for" : "Label"}</Label>
              <Input
                className="h-9"
                value={field.label}
                placeholder={isBooking ? "e.g. Pickup date" : "e.g. Field of Study"}
                onChange={(e) => edit({ label: e.target.value, key: field.key || toKey(e.target.value) })}
                onBlur={() => commit({ label: field.label, key: field.key })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Reference name</Label>
              <Input
                className="h-9"
                value={field.key}
                placeholder="pickup_date"
                onChange={(e) => edit({ key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })}
                onBlur={() => commit({ key: field.key })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Field type</Label>
              <Select value={field.type} onValueChange={(v) => changeType(String(v) as SchemaFieldType)}>
                <SelectTrigger className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {types.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button variant="ghost" size="icon" className="mt-1 shrink-0" aria-label="Remove field" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-6 pl-6">
          <label className="flex items-center gap-2 text-xs">
            <Switch checked={field.is_required ?? false} onCheckedChange={(v) => commit({ is_required: v })} />
            Required
          </label>
          {/* Filterable and Default drive listing filters and profile defaults — meaningless for a
              booking question, so an Other Service Category admin is not shown them. */}
          {!isBooking && (
            <>
              <label className="flex items-center gap-2 text-xs">
                <Switch checked={field.filterable ?? false} onCheckedChange={(v) => commit({ filterable: v })} />
                Filterable
              </label>
              <label className="flex items-center gap-2 text-xs">
                <Switch checked={field.is_default ?? false} onCheckedChange={(v) => commit({ is_default: v })} />
                Default
              </label>
            </>
          )}
        </div>

        {needsOptions && (
          <div className="space-y-2 pl-6">
            <Label className="text-xs">Options</Label>
            <div className="flex flex-wrap gap-1.5">
              {(field.options ?? []).map((option, index) => (
                <Badge key={String(option)} variant="secondary" className="h-6 gap-1 pr-1">
                  {option}
                  <button
                    type="button"
                    aria-label={`Remove ${option}`}
                    className="ml-0.5 hover:text-destructive"
                    onClick={() => commit({ options: (field.options ?? []).filter((_, i) => i !== index) })}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex max-w-xs gap-2">
              <Input
                value={newOption}
                onChange={(e) => setNewOption(e.target.value)}
                placeholder="Add option…"
                className="h-8 text-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addOption();
                  }
                }}
              />
              <Button type="button" variant="outline" size="sm" className="h-8" onClick={addOption}>
                Add
              </Button>
            </div>
            {(field.options ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground">Add at least one option so the customer has something to pick.</p>
            )}
          </div>
        )}


        {isBooking && (
          <SchemaFieldBookingOptions field={field} onLocalChange={edit} onCommit={commit} />
        )}
      </CardContent>
    </Card>
  );
}

export function toKey(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}
