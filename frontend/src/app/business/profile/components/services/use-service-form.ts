"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Accreditation, Category, Lookup } from "@/app/admin/platform/categories/apis/types";
import { ApiError } from "@/lib/api/http";
import type { ServiceInput } from "../../apis/types";
import { useCourseFieldSearch } from "./use-course-field-search";
import { useServiceEditor } from "./service-editor-context";

type FormState = { name: string; service_category_id: number | null; description: string };

const EMPTY_FORM: FormState = { name: "", service_category_id: null, description: "" };

/** State and handlers of the business service form (ServiceFormView). */
export function useServiceForm(businessId: number, serviceId?: string) {
  const router = useRouter();
  const isEdit = !!serviceId;

  const { api, org: profile, services, servicesHref, readOnly, coursePreviewHref } = useServiceEditor(businessId);
  const [serviceCategories, setServiceCategories] = useState<Category[]>([]);
  const [degreeLevels, setDegreeLevels] = useState<Lookup[]>([]);
  const [areasOfStudy, setAreasOfStudy] = useState<Lookup[]>([]);
  const [accreditations, setAccreditations] = useState<Accreditation[]>([]);

  const toForm = (s: { name: string; service_category_id: number | null; description: string | null }): FormState => ({
    name: s.name,
    service_category_id: s.service_category_id,
    description: s.description ?? "",
  });

  const [form, setForm] = useState<FormState>(() => {
    const existing = serviceId ? services.find((s) => s.id === serviceId) : undefined;
    return existing ? toForm(existing) : EMPTY_FORM;
  });
  const [fieldValues, setFieldValues] = useState<Record<number, unknown>>({});
  const [isPublished, setIsPublished] = useState(() => services.find((s) => s.id === serviceId)?.is_published ?? false);
  const [saving, setSaving] = useState(false);
  const [generatingDescription, setGeneratingDescription] = useState(false);

  const { courseSearchLoading, debouncedSearchCourseField, courseFieldOptions } = useCourseFieldSearch({ api, degreeLevels, areasOfStudy, accreditations });

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    api.getServiceCategories().then((res) => setServiceCategories(res.data));
    api.getLookups("degree-levels").then((res) => setDegreeLevels(res.data));
    api.getLookups("areas-of-study").then((res) => setAreasOfStudy(res.data));
    api.getAccreditations().then((res) => setAccreditations(res.data));
    if (isEdit && serviceId) {
      if (!services.some((s) => s.id === serviceId)) {
        api.getService(serviceId).then((found) => { setForm(toForm(found)); setIsPublished(found.is_published); }).catch(() => {});
      }
      api.getServiceFieldValues(serviceId).then((values) => {
        const map: Record<number, unknown> = {};
        for (const v of values) map[v.schema_field_id] = v.value;
        setFieldValues(map);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const canSave = form.name.trim().length >= 2 && !!form.service_category_id;

  // Scoped to the SELECTED category: schema_fields are per-category rows (their own ids), so a
  // "degree_level" field on Academic Courses has a different id than one on, say, Diplomas —
  // merging across every category picked whichever category came first, silently mismatching
  // the id a value was saved under and leaving the combobox blank on edit.
  const selectedCategory = serviceCategories.find((c) => c.id === form.service_category_id);
  const schemaFieldIdByKey: Record<string, number> = {};
  for (const f of selectedCategory?.schema_fields ?? []) {
    schemaFieldIdByKey[f.key] = f.id;
  }

  const handleWriteWithAi = async () => {
    if (!form.name.trim()) {
      toast.error("Enter a service name first");
      return;
    }
    setGeneratingDescription(true);
    try {
      const categoryName = serviceCategories.find((c) => c.id === form.service_category_id)?.name;
      const { text } = await api.generateServiceDescription({
        name: form.name,
        category_name: categoryName,
        hint: form.description || undefined,
      });
      set("description", text);
    } catch (e) {
      toast.error("Couldn't generate a description", { description: (e as ApiError).message });
    } finally {
      setGeneratingDescription(false);
    }
  };

  const handleSubmit = async () => {
    if (!canSave || !form.service_category_id) return;
    setSaving(true);
    try {
      const input: ServiceInput = {
        name: form.name,
        service_category_id: form.service_category_id,
        description: form.description || null,
      };
      const result = isEdit && serviceId
        ? await api.updateService(serviceId, input)
        : await api.createService(input);

      const values = Object.entries(fieldValues).map(([schema_field_id, value]) => ({
        schema_field_id: Number(schema_field_id),
        value,
      }));
      if (values.length > 0) {
        await api.updateServiceFieldValues(result.id, values);
      }

      toast.success(isEdit ? "Service updated" : "Service created");
      router.push(servicesHref);
    } catch (e) {
      const err = e as ApiError;
      toast.error(isEdit ? "Couldn't update service" : "Couldn't create service", { description: err.message });
    } finally {
      setSaving(false);
    }
  };

  return {
    isEdit, profile, servicesHref, readOnly, coursePreviewHref, serviceCategories, form, set, fieldValues, setFieldValues, saving, generatingDescription,
    isPublished, setIsPublished, canSave, selectedCategory, schemaFieldIdByKey, courseSearchLoading, debouncedSearchCourseField, courseFieldOptions,
    handleWriteWithAi, handleSubmit,
  };
}
