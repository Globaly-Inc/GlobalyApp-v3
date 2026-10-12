"use client";

import { toast } from "sonner";
import { CategoryExtraFields } from "@/app/admin/platform/businesses/components/services/category-extra-fields";
import type { Category } from "@/app/admin/platform/categories/apis/types";
import { ApiError } from "@/lib/api/http";
import { useServiceEditor } from "./service-editor-context";

/** Keys the Course details card already edits — everything else in the category's schema shows here. */
const SHOWN_ELSEWHERE = ["degree_level", "area_of_study", "awarded_by"];

/** A business service's remaining category fields, with their own Save. On a new service there's
 *  nothing to save yet — Create saves them along with the rest. */
export function ServiceExtraFields({
  serviceId, category, values, setValues,
}: Readonly<{
  serviceId?: string;
  category?: Category;
  values: Record<number, unknown>;
  setValues: (updater: (v: Record<number, unknown>) => Record<number, unknown>) => void;
}>) {
  const { api } = useServiceEditor();
  const save = async () => {
    if (!serviceId) return;
    try {
      await api.updateServiceFieldValues(serviceId, Object.entries(values).map(([id, value]) => ({ schema_field_id: Number(id), value })));
      toast.success("Details updated");
    } catch (e) {
      toast.error("Couldn't update details", { description: (e as ApiError).message });
    }
  };
  return (
    <CategoryExtraFields
      fields={(category?.schema_fields ?? []).filter((f) => !SHOWN_ELSEWHERE.includes(f.key))}
      values={values}
      onChangeField={(id, v) => setValues((f) => ({ ...f, [id]: v }))}
      onSave={save}
    />
  );
}
