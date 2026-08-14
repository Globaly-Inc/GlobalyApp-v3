"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FileText, GraduationCap, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Combobox } from "@/components/combobox";
import { DynamicIcon } from "@/components/dynamic-icon";
import { SectionCard } from "@/app/personal/profile/section-card";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { categoriesApi } from "@/app/admin/platform/categories/apis";
import { fetchAccreditations, fetchLookup, fetchServiceCategories } from "@/app/admin/platform/categories/store/categories-slice";
import {
  createService, fetchBusinessDetail, fetchServiceFieldValues, updateService,
  updateServiceFieldValues,
} from "../store/businesses-slice";
import { businessesApi } from "../apis";
import { ApiError } from "@/lib/api/http";
import type { SchemaFieldValue, ServiceInput } from "../apis/types";

type FormState = { name: string; service_category_id: number | null; description: string };

const EMPTY_FORM: FormState = { name: "", service_category_id: null, description: "" };

export function ServiceFormView({ businessId, serviceId }: Readonly<{ businessId: number; serviceId?: string }>) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const isEdit = !!serviceId;

  const business = useAppSelector((state) => state.platformBusinesses.detail);
  const services = useAppSelector((state) => state.platformBusinesses.services.items);
  const serviceCategories = useAppSelector((state) => state.platformCategories.serviceCategories.data);
  const degreeLevels = useAppSelector((state) => state.platformCategories.degreeLevels.data);
  const areasOfStudy = useAppSelector((state) => state.platformCategories.areasOfStudy.data);
  const accreditations = useAppSelector((state) => state.platformCategories.accreditations.data);

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
  const [saving, setSaving] = useState(false);

  const [courseSearchResults, setCourseSearchResults] = useState<Record<string, { value: string; label: string }[]>>({});
  const [courseSearchLoading, setCourseSearchLoading] = useState<Record<string, boolean>>({});
  const searchTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const timers = searchTimers.current;
    return () => {
      for (const timer of Object.values(timers)) clearTimeout(timer);
    };
  }, []);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    if (serviceCategories.length === 0) dispatch(fetchServiceCategories({}));
    if (degreeLevels.length === 0) dispatch(fetchLookup({ kind: "degree-levels" }));
    if (areasOfStudy.length === 0) dispatch(fetchLookup({ kind: "areas-of-study" }));
    if (accreditations.length === 0) dispatch(fetchAccreditations({}));
    if (business?.id !== businessId) dispatch(fetchBusinessDetail(businessId));
    if (isEdit && serviceId) {
      if (!services.some((s) => s.id === serviceId)) {
        businessesApi.getServices(businessId).then((all) => {
          const found = all.find((s) => s.id === serviceId);
          if (found) setForm(toForm(found));
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

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const canSave = form.name.trim().length >= 2 && !!form.service_category_id;

  const catalogOptionsByKey: Record<string, { value: string; label: string }[]> = {
    degree_level: degreeLevels.map((l) => ({ value: String(l.id), label: l.name })),
    area_of_study: areasOfStudy.map((l) => ({ value: String(l.id), label: l.name })),
    awarded_by: accreditations.map((a) => ({ value: String(a.id), label: a.name })),
  };

  const schemaFieldIdByKey: Record<string, number> = {};
  for (const c of serviceCategories) {
    for (const f of c.schema_fields) {
      if (!(f.key in schemaFieldIdByKey)) schemaFieldIdByKey[f.key] = f.id;
    }
  }
  const COURSE_FIELDS = [
    { key: "degree_level", label: "Degree level" },
    { key: "area_of_study", label: "Area of study" },
    // { key: "awarded_by", label: "Accreditation" },
  ];

  const searchCourseField = async (key: string, query: string) => {
    setCourseSearchLoading((s) => ({ ...s, [key]: true }));
    try {
      if (key === "awarded_by") {
        const res = await categoriesApi.getAccreditations({ search: query || undefined });
        setCourseSearchResults((s) => ({ ...s, [key]: res.data.map((a) => ({ value: String(a.id), label: a.name })) }));
      } else {
        const kind = key === "degree_level" ? "degree-levels" : "areas-of-study";
        const res = await categoriesApi.getLookups(kind, { search: query || undefined });
        setCourseSearchResults((s) => ({ ...s, [key]: res.data.map((l) => ({ value: String(l.id), label: l.name })) }));
      }
    } finally {
      setCourseSearchLoading((s) => ({ ...s, [key]: false }));
    }
  };

  const debouncedSearchCourseField = (key: string, query: string) => {
    clearTimeout(searchTimers.current[key]);
    searchTimers.current[key] = setTimeout(() => searchCourseField(key, query), 300);
  };

  // Keep the currently selected option visible even if a backend search narrows it out of the results.
  const courseFieldOptions = (key: string, value: string) => {
    const base = courseSearchResults[key] ?? catalogOptionsByKey[key] ?? [];
    if (value && !base.some((o) => o.value === value)) {
      const selected = catalogOptionsByKey[key]?.find((o) => o.value === value);
      if (selected) return [selected, ...base];
    }
    return base;
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
        ? await dispatch(updateService({ id: businessId, serviceId, patch: input })).unwrap()
        : await dispatch(createService({ id: businessId, input })).unwrap();

      const values = Object.entries(fieldValues).map(([schema_field_id, value]) => ({
        schema_field_id: Number(schema_field_id),
        value,
      }));
      if (values.length > 0) {
        await dispatch(updateServiceFieldValues({ id: businessId, serviceId: result.id, values })).unwrap();
      }

      toast.success(isEdit ? "Service updated" : "Service created");
      router.push(`/admin/platform/businesses/${businessId}?tab=services`);
    } catch (e) {
      const err = e as ApiError;
      toast.error(isEdit ? "Couldn't update service" : "Couldn't create service", { description: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 pb-20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Button
          variant="ghost"
          className="h-10 cursor-pointer gap-1 px-1 text-muted-foreground"
          onClick={() => router.push(`/admin/platform/businesses/${businessId}?tab=services`)}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to services
        </Button>
        <Button className="cursor-pointer gap-1.5" disabled={!canSave || saving} onClick={handleSubmit}>
          <Save className="h-3.5 w-3.5" />
          {saving ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "Save changes" : "Create service"}
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="relative h-32 bg-gradient-to-br from-primary/15 to-primary/5">
          <Avatar className="absolute -bottom-10 left-6 size-20 rounded-xl border-4 border-background shadow-sm">
            <AvatarFallback className="rounded-xl bg-background text-xl font-bold text-primary">
              {(business?.business_name ?? "B").charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </div>
        <CardContent className="flex flex-col gap-1.5 pt-12">
          <Combobox
            options={serviceCategories.map((c) => ({
              value: String(c.id),
              label: c.name,
              icon: <DynamicIcon name={c.icon} fallback="GraduationCap" className="h-3.5 w-3.5" />,
            }))}
            value={form.service_category_id ? String(form.service_category_id) : ""}
            onChange={(v) => set("service_category_id", v ? Number(v) : null)}
            placeholder="Select category"
            searchPlaceholder="Search categories..."
            className="h-7 w-fit min-w-0 rounded-full border-primary/30 bg-primary/5 px-3 text-xs font-medium text-primary"
          />
          <Input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Untitled service"
            className="h-10 border-none p-0 text-xl font-bold text-foreground shadow-none focus-visible:ring-0"
          />
          <p className="text-sm text-muted-foreground">{business?.business_name ?? "Business"}</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="gap-3 lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Description
            </CardTitle>
            <CardAction>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-primary"
                onClick={() => toast("Coming soon", { description: "AI-generated descriptions aren't available yet." })}
              >
                <Sparkles className="h-3.5 w-3.5" /> Write with AI
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <Textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Describe the service..."
              rows={8}
              className="min-h-20"
            />
          </CardContent>
        </Card>

        <SectionCard icon={GraduationCap} title="Course details">
          <div className="space-y-4">
            {COURSE_FIELDS.map((field) => {
              const fieldId = schemaFieldIdByKey[field.key];
              const value = fieldId != null && fieldValues[fieldId] != null ? String(fieldValues[fieldId]) : "";
              return (
                <div key={field.key} className="flex flex-col gap-2">
                  <Label>{field.label}</Label>
                  <Combobox
                    options={courseFieldOptions(field.key, value)}
                    value={value}
                    onChange={(v) => {
                      if (fieldId != null) setFieldValues((f) => ({ ...f, [fieldId]: v }));
                    }}
                    onQueryChange={(query) => debouncedSearchCourseField(field.key, query)}
                    loading={courseSearchLoading[field.key] ?? false}
                    placeholder={`Select ${field.label.toLowerCase()}`}
                    searchPlaceholder={`Search ${field.label.toLowerCase()}...`}
                  />
                </div>
              );
            })}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
