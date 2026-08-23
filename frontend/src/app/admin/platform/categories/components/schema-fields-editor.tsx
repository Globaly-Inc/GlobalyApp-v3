"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { categoriesApi } from "../apis";
import type { SchemaField, SchemaFieldInput } from "../apis/types";
import { SchemaFieldRow } from "./schema-field-row";

const emptyDraft: SchemaFieldInput = { label: "", key: "", type: "text", is_required: false, filterable: false, is_default: false };

const failed = (what: string) => (e: unknown) =>
  toast.error(what, { description: e instanceof Error ? e.message : "Please try again." });

/**
 * Configure what a category asks for.
 *
 * For an **Other** Service Category these rows are the booking requirements a Personal Portal user fills
 * in when requesting a service, and the order set here is the order they are asked in. For business and
 * service categories they are the profile fields they always were — same storage, same endpoints,
 * unchanged behaviour.
 */
export function SchemaFieldsEditor({
  kind,
  categoryId,
  onFieldsChange,
}: Readonly<{
  kind: "business" | "service" | "other-service";
  categoryId: number | null;
  /** Lets the parent show a live preview of what the customer will see. */
  onFieldsChange?: (fields: SchemaField[]) => void;
}>) {
  const [fields, setFields] = useState<SchemaField[]>([]);
  const [draft, setDraft] = useState<SchemaFieldInput | null>(null);
  // Starts true when there is a category to load, so the first paint says "Loading…" without an effect
  // reaching back into state. categoryId comes from the route and does not change without a remount.
  const [loading, setLoading] = useState(categoryId !== null);
  const isBooking = kind === "other-service";

  /**
   * On the create page there is no category to attach a field to yet, so every edit stays local and the
   * parent persists the list once the category itself exists. Same rows, same controls, no requests —
   * an admin should not have to save a half-configured category to find out what it will ask for.
   */
  const unsaved = categoryId === null;

  const publish = (rows: SchemaField[]) => {
    setFields(rows);
    onFieldsChange?.(rows);
  };

  useEffect(() => {
    if (categoryId === null) return;
    categoriesApi
      .getSchemaFields(kind, categoryId)
      .then((rows) => {
        setFields(rows);
        onFieldsChange?.(rows);
      })
      .catch(() => toast.error("Couldn't load the fields for this category"))
      .finally(() => setLoading(false));
    // onFieldsChange is a render-scoped callback; re-running on it would refetch every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, categoryId]);

  const saveField = async (id: number, patch: Partial<SchemaFieldInput>) => {
    const optimistic = fields.map((f) => (f.id === id ? { ...f, ...patch } : f));
    publish(optimistic);
    if (categoryId === null) return;
    try {
      const updated = await categoriesApi.updateSchemaField(id, patch);
      publish(optimistic.map((f) => (f.id === id ? updated : f)));
    } catch (e) {
      // Put back what the server still holds rather than leaving the screen lying about what was saved.
      failed("Couldn't save the field")(e);
      publish(await categoriesApi.getSchemaFields(kind, categoryId));
    }
  };

  const removeField = async (id: number) => {
    const previous = fields;
    publish(fields.filter((f) => f.id !== id));
    if (categoryId === null) return;
    try {
      await categoriesApi.deleteSchemaField(id);
    } catch (e) {
      publish(previous);
      failed("Couldn't remove the field")(e);
    }
  };

  const commitDraft = async () => {
    if (!draft?.label.trim() || !draft.key.trim()) return;
    if (fields.some((f) => f.key === draft.key)) {
      toast.error("That reference name is already used in this category");
      return;
    }
    if (categoryId === null) {
      // A negative id keeps React keys stable and cannot collide with a real one. The parent strips it
      // before creating the field for real.
      publish([...fields, { ...draft, id: -(fields.length + 1) }]);
      setDraft(null);
      return;
    }
    try {
      const row = await categoriesApi.createSchemaField(kind, categoryId, draft);
      publish([...fields, row]);
      setDraft(null);
      toast.success("Field added");
    } catch (e) {
      failed("Couldn't add the field")(e);
    }
  };

  /** Move one field one place. The whole resulting order is sent, since order is relative. */
  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    const reordered = [...fields];
    [reordered[index], reordered[target]] = [reordered[target]!, reordered[index]!];
    const previous = fields;
    publish(reordered);
    if (categoryId === null) return;
    try {
      publish(await categoriesApi.reorderSchemaFields(kind, categoryId, reordered.map((f) => f.id)));
    } catch (e) {
      publish(previous);
      failed("Couldn't change the order")(e);
    }
  };

  return (
    <div className="space-y-3">
      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!loading && fields.length === 0 && !draft && (
        <p className="text-sm text-muted-foreground">
          {isBooking
            ? "Nothing configured yet. Customers can request this service without answering any questions."
            : "No fields yet."}
        </p>
      )}

      {unsaved && fields.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {fields.length === 1 ? "1 field" : `${fields.length} fields`} will be saved with the category.
        </p>
      )}

      {fields.map((field, index) => (
        <SchemaFieldRow
          key={field.id}
          field={field}
          isDraft={false}
          isBooking={isBooking}
          isFirst={index === 0}
          isLast={index === fields.length - 1}
          onLocalChange={(patch) => setFields((prev) => prev.map((f) => (f.id === field.id ? { ...f, ...patch } : f)))}
          onSave={(patch) => void saveField(field.id, patch)}
          onDelete={() => void removeField(field.id)}
          onMove={(direction) => void move(index, direction)}
        />
      ))}

      {draft && (
        <>
          <SchemaFieldRow
            field={draft}
            isDraft
            isBooking={isBooking}
            isFirst
            isLast
            onLocalChange={(patch) => setDraft((d) => ({ ...(d ?? emptyDraft), ...patch }))}
            onSave={(patch) => setDraft((d) => ({ ...(d ?? emptyDraft), ...patch }))}
            onDelete={() => setDraft(null)}
            onMove={() => undefined}
          />
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={commitDraft} disabled={!draft.label.trim() || !draft.key.trim()}>
              Save field
            </Button>
          </div>
        </>
      )}

      {!draft && (
        <Button type="button" variant="outline" className="w-full gap-2" onClick={() => setDraft(emptyDraft)}>
          <Plus className="h-4 w-4" /> Add Field
        </Button>
      )}
    </div>
  );
}
