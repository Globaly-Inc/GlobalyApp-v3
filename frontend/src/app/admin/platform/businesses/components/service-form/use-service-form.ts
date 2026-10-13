"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { fetchAccreditations, fetchLookup, fetchServiceCategoryOptions } from "@/app/admin/platform/categories/store/categories-slice";
import {
  createService, fetchBusinessDetail, fetchServiceFieldValues, updateService,
  updateServiceFieldValues,
} from "../../store/businesses-slice";
import { businessesApi } from "../../apis";
import { ApiError } from "@/lib/api/http";
import type { SchemaFieldValue, ServiceInput } from "../../apis/types";
import { useCourseFieldSearch } from "./use-course-field-search";
import type { ServiceTab } from "./service-tab-panels";

export type ServiceFormState = { name: string; service_category_id: number | null; description: string };

const EMPTY_FORM: ServiceFormState = { name: "", service_category_id: null, description: "" };

/** State and handlers for the business service form (moved out of service-form-view.tsx unchanged). */
export function useServiceForm(businessId: number, serviceId?: string) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const isEdit = !!serviceId;

  const business = useAppSelector((state) => state.platformBusinesses.detail);
  const services = useAppSelector((state) => state.platformBusinesses.services.items);
  const serviceCategories = useAppSelector((state) => state.platformCategories.serviceCategoryOptions);
  const degreeLevels = useAppSelector((state) => state.platformCategories.degreeLevels.data);
  const areasOfStudy = useAppSelector((state) => state.platformCategories.areasOfStudy.data);
  const accreditations = useAppSelector((state) => state.platformCategories.accreditations.data);

  const toForm = (s: { name: string; service_category_id: number | null; description: string | null }): ServiceFormState => ({
    name: s.name,
    service_category_id: s.service_category_id,
    description: s.description ?? "",
  });

  const [form, setForm] = useState<ServiceFormState>(() => {
    const existing = serviceId ? services.find((s) => s.id === serviceId) : undefined;
    return existing ? toForm(existing) : EMPTY_FORM;
  });
  const [isPublished, setIsPublished] = useState(() => {
    const existing = serviceId ? services.find((s) => s.id === serviceId) : undefined;
    return existing?.is_published ?? false;
  });
  const [publishing, setPublishing] = useState(false);
  const [fieldValues, setFieldValues] = useState<Record<number, unknown>>({});
  const [tab, setTab] = useState<ServiceTab>("summary");
  const [saving, setSaving] = useState(false);
  const [generatingDescription, setGeneratingDescription] = useState(false);
  const [editingDescription, setEditingDescription] = useState(!isEdit);
  const [savingDescription, setSavingDescription] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const savedNameRef = useRef(form.name);

  const courseSearch = useCourseFieldSearch(degreeLevels, areasOfStudy, accreditations);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    if (serviceCategories.length === 0) dispatch(fetchServiceCategoryOptions());
    if (degreeLevels.length === 0) dispatch(fetchLookup({ kind: "degree-levels" }));
    if (areasOfStudy.length === 0) dispatch(fetchLookup({ kind: "areas-of-study" }));
    if (accreditations.length === 0) dispatch(fetchAccreditations({}));
    if (business?.id !== businessId) dispatch(fetchBusinessDetail(businessId));
    if (isEdit && serviceId) {
      if (!services.some((s) => s.id === serviceId)) {
        businessesApi.getServices(businessId).then((all) => {
          const found = all.find((s) => s.id === serviceId);
          if (found) { setForm(toForm(found)); setIsPublished(found.is_published); }
        });
      }
      dispatch(fetchServiceFieldValues({ id: businessId, serviceId })).then((res) => {
        if (fetchServiceFieldValues.fulfilled.match(res)) {
          const map: Record<number, unknown> = {};
          for (const v of res.payload as SchemaFieldValue[]) map[v.schema_field_id] = v.value;
          setFieldValues(map);
        }
      });
    }
  }, []);

  // Declared before the effect below that calls it (react-hooks/immutability).
  const set = <K extends keyof ServiceFormState>(key: K, value: ServiceFormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    if (isEdit || form.service_category_id || serviceCategories.length === 0) return;
    const courses = serviceCategories.find((c) => c.slug === "courses");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- selects the default category once the categories load; moved verbatim
    if (courses) set("service_category_id", courses.id);
  }, [isEdit, form.service_category_id, serviceCategories]);

  const canSave = form.name.trim().length >= 2 && !!form.service_category_id;

  // Scoped to the SELECTED category: schema_fields are per-category rows (their own ids), so a
  // "degree_level" field on Academic Courses has a different id than one on, say, Diplomas —
  // merging across every category picked whichever category came first, silently mismatching
  // the id a value was saved under and leaving the combobox blank on edit.
  const selectedCategory = serviceCategories.find((c) => c.id === form.service_category_id);
  // Matches V1's BusinessServiceEditor.tsx: a single hardcoded category slug gates the
  // course-only tabs/cards (Intakes/Eligibility/Study Options/Study Units/Accreditations/Course
  // details) — every other category only ever gets Summary + Fees plus its own schema_fields.
  const isCourse = selectedCategory?.slug === "courses";

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
      const { text } = await businessesApi.generateServiceDescription({
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

  // Edit mode no longer has a global save: every card persists itself (name on blur, description
  // and course details via their own Save buttons, category/publish immediately on change). This
  // only handles the initial creation of a brand-new service, which still needs one explicit action.
  const handleSubmit = async () => {
    if (!canSave || !form.service_category_id) return;
    setSaving(true);
    try {
      const input: ServiceInput = {
        name: form.name,
        service_category_id: form.service_category_id,
        description: form.description || null,
      };
      const result = await dispatch(createService({ id: businessId, input })).unwrap();

      const values = Object.entries(fieldValues).map(([schema_field_id, value]) => ({
        schema_field_id: Number(schema_field_id),
        value,
      }));
      if (values.length > 0) {
        await dispatch(updateServiceFieldValues({ id: businessId, serviceId: result.id, values })).unwrap();
      }

      toast.success("Service created");
      router.push(`/admin/platform/businesses/${businessId}?tab=services`);
    } catch (e) {
      const err = e as ApiError;
      toast.error("Couldn't create service", { description: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePublish = async (next: boolean) => {
    if (!serviceId) return;
    setPublishing(true);
    try {
      await businessesApi.setServicePublished(businessId, serviceId, next);
      setIsPublished(next);
      toast.success(next ? "Service published" : "Service unpublished");
    } catch (e) {
      toast.error("Couldn't update publish status", { description: (e as ApiError).message });
    } finally {
      setPublishing(false);
    }
  };

  // Auto-saves like handleTogglePublish — the rest of the form batches into "Save changes", but a
  // category pick that's silently lost on refresh (nothing persists until Save is clicked) is
  // confusing enough that this one field should persist immediately once the service exists.
  const handleCategoryChange = async (categoryId: number | null) => {
    set("service_category_id", categoryId);
    // Otherwise the old category's field values stay in local state and would ride along on the
    // next Save under the new category's (now-invalid) field ids — the backend now also rejects
    // that, but there's no reason to still show/resubmit them client-side either.
    setFieldValues({});
    const nextIsCourse = serviceCategories.find((c) => c.id === categoryId)?.slug === "courses";
    if (!nextIsCourse && tab !== "summary" && tab !== "fees") setTab("summary");
    if (!isEdit || !serviceId || !categoryId) return;
    try {
      await dispatch(updateService({ id: businessId, serviceId, patch: { service_category_id: categoryId } })).unwrap();
    } catch (e) {
      toast.error("Couldn't update category", { description: (e as ApiError).message });
    }
  };

  // Auto-saves the service name on blur — same reasoning as category/publish: there's no more
  // global "Save changes" button to catch a change left uncommitted.
  const handleNameBlur = async () => {
    if (!isEdit || !serviceId || form.name === savedNameRef.current || !form.name.trim()) return;
    savedNameRef.current = form.name;
    try {
      await dispatch(updateService({ id: businessId, serviceId, patch: { name: form.name } })).unwrap();
    } catch (e) {
      toast.error("Couldn't update name", { description: (e as ApiError).message });
    }
  };

  const handleSaveDescription = async () => {
    if (!serviceId) { setEditingDescription(false); return; }
    setSavingDescription(true);
    try {
      await dispatch(updateService({ id: businessId, serviceId, patch: { description: form.description || null } })).unwrap();
      setEditingDescription(false);
    } catch (e) {
      toast.error("Couldn't update description", { description: (e as ApiError).message });
    } finally {
      setSavingDescription(false);
    }
  };

  const handleSaveCourseDetails = async () => {
    if (!serviceId) return;
    const values = Object.entries(fieldValues).map(([schema_field_id, value]) => ({ schema_field_id: Number(schema_field_id), value }));
    if (values.length === 0) return;
    try {
      await dispatch(updateServiceFieldValues({ id: businessId, serviceId, values })).unwrap();
      toast.success("Course details updated");
    } catch (e) {
      toast.error("Couldn't update course details", { description: (e as ApiError).message });
    }
  };

  return {
    isEdit, business, serviceCategories, degreeLevels, areasOfStudy, accreditations,
    form, set, isPublished, publishing, fieldValues, setFieldValues, tab, setTab, saving,
    generatingDescription, editingDescription, setEditingDescription, savingDescription,
    previewMode, setPreviewMode, courseSearch, canSave, selectedCategory, isCourse, schemaFieldIdByKey,
    handleWriteWithAi, handleSubmit, handleTogglePublish, handleCategoryChange, handleNameBlur,
    handleSaveDescription, handleSaveCourseDetails,
  };
}
