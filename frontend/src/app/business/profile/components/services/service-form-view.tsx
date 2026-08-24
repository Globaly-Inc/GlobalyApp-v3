"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Combobox } from "@/components/combobox";
import { DynamicIcon } from "@/components/dynamic-icon";
import { AdminSegmentedTabs } from "@/app/admin/components/admin-segmented-tabs";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import type { Accreditation, Category, Lookup } from "@/app/admin/platform/categories/apis/types";
import { businessProfileDetailApi } from "../../apis";
import {
  createService, fetchServiceFieldValues, fetchServices, updateService, updateServiceFieldValues,
} from "../../store/business-profile-detail-slice";
import { ApiError } from "@/lib/api/http";
import type { SchemaFieldValue, ServiceInput } from "../../apis/types";
import { SummaryTab } from "./tabs/summary-tab";
import { CourseFeesTab } from "./tabs/course-fees-tab";
import { IntakesTab } from "./tabs/intakes-tab";
import { EligibilityTab } from "./tabs/eligibility-tab";
import { StudyOptionsTab } from "./tabs/study-options-tab";
import { StudyUnitsTab } from "./tabs/study-units-tab";
import { AccreditationsTab } from "./tabs/accreditations-tab";

const DETAIL_TABS = [
  { value: "summary", label: "Summary" },
  { value: "fees", label: "Course Fees" },
  { value: "intakes", label: "Intakes" },
  { value: "eligibility", label: "Eligibility" },
  { value: "study-options", label: "Study Options" },
  { value: "study-units", label: "Study Units" },
  { value: "accreditations", label: "Accreditations" },
] as const;
export type DetailTab = (typeof DETAIL_TABS)[number]["value"];

type FormState = { name: string; service_category_id: number | null; description: string };

const EMPTY_FORM: FormState = { name: "", service_category_id: null, description: "" };

export function ServiceFormView({ businessId, serviceId }: Readonly<{ businessId: number; serviceId?: string }>) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const isEdit = !!serviceId;

  const profile = useAppSelector((state) => state.businessOnboarding.profile);
  const services = useAppSelector((state) => state.businessProfileDetail.services.items);
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
  const [saving, setSaving] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>("summary");

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
    businessProfileDetailApi.getServiceCategories().then((res) => setServiceCategories(res.data));
    businessProfileDetailApi.getLookups("degree-levels").then((res) => setDegreeLevels(res.data));
    businessProfileDetailApi.getLookups("areas-of-study").then((res) => setAreasOfStudy(res.data));
    businessProfileDetailApi.getAccreditations().then((res) => setAccreditations(res.data));
    if (isEdit && serviceId) {
      if (!services.some((s) => s.id === serviceId)) {
        dispatch(fetchServices({ id: businessId, params: { limit: 100 } })).then((res) => {
          if (fetchServices.fulfilled.match(res)) {
            const found = res.payload.data.find((s) => s.id === serviceId);
            if (found) setForm(toForm(found));
          }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const searchCourseField = async (key: string, query: string) => {
    setCourseSearchLoading((s) => ({ ...s, [key]: true }));
    try {
      if (key === "awarded_by") {
        const res = await businessProfileDetailApi.getAccreditations({ search: query || undefined });
        setCourseSearchResults((s) => ({ ...s, [key]: res.data.map((a) => ({ value: String(a.id), label: a.name })) }));
      } else {
        const kind = key === "degree_level" ? "degree-levels" : "areas-of-study";
        const res = await businessProfileDetailApi.getLookups(kind, { search: query || undefined });
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
      router.push(`/business/profile/${businessId}?tab=services`);
    } catch (e) {
      const err = e as ApiError;
      toast.error(isEdit ? "Couldn't update service" : "Couldn't create service", { description: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Button
          variant="ghost"
          className="h-10 cursor-pointer gap-1 px-1 text-muted-foreground"
          onClick={() => router.push(`/business/profile/${businessId}?tab=services`)}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to services
        </Button>
        <Button className="cursor-pointer gap-1.5" disabled={!canSave || saving} onClick={handleSubmit}>
          <Save className="h-3.5 w-3.5" />
          {saving ? (isEdit ? "Saving…" : "Creating…") : isEdit ? "Save changes" : "Create service"}
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border">
        <div className="relative h-32 bg-linear-to-br from-primary/15 to-primary/5" />
        <CardContent>
          <div className="flex items-start gap-4 -mt-14 ml-8">
            <Avatar className="size-28 shrink-0 rounded-xl border-4 border-background shadow-sm">
              {profile?.logo_url && <AvatarImage src={profile.logo_url} alt={profile.business_name} className="rounded-lg object-contain p-1" />}
              <AvatarFallback className="rounded-lg bg-background text-xl font-bold text-primary">
                {(profile?.business_name ?? "B").charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-1 flex-col gap-1.5 pt-4 sm:pt-14 m-2">
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
              <p className="text-sm text-muted-foreground">{profile?.business_name ?? "Business"}</p>
            </div>
          </div>
        </CardContent>
      </div>

      {isEdit && serviceId ? (
        <>
          <AdminSegmentedTabs options={DETAIL_TABS} value={detailTab} onChange={setDetailTab} />
          <Card>
            <CardContent>
              {detailTab === "summary" && (
                <SummaryTab
                  serviceId={serviceId}
                  onNavigateTab={setDetailTab}
                  description={form.description}
                  onDescriptionChange={(v) => set("description", v)}
                  schemaFieldIdByKey={schemaFieldIdByKey}
                  fieldValues={fieldValues}
                  setFieldValues={setFieldValues}
                  courseFieldOptions={courseFieldOptions}
                  debouncedSearchCourseField={debouncedSearchCourseField}
                  courseSearchLoading={courseSearchLoading}
                />
              )}
              {detailTab === "fees" && <CourseFeesTab serviceId={serviceId} />}
              {detailTab === "intakes" && <IntakesTab serviceId={serviceId} />}
              {detailTab === "eligibility" && <EligibilityTab serviceId={serviceId} />}
              {detailTab === "study-options" && <StudyOptionsTab serviceId={serviceId} />}
              {detailTab === "study-units" && <StudyUnitsTab serviceId={serviceId} />}
              {detailTab === "accreditations" && <AccreditationsTab serviceId={serviceId} />}
            </CardContent>
          </Card>
        </>
      ) : (
        <SummaryTab
          serviceId={null}
          onNavigateTab={() => {}}
          description={form.description}
          onDescriptionChange={(v) => set("description", v)}
          schemaFieldIdByKey={schemaFieldIdByKey}
          fieldValues={fieldValues}
          setFieldValues={setFieldValues}
          courseFieldOptions={courseFieldOptions}
          debouncedSearchCourseField={debouncedSearchCourseField}
          courseSearchLoading={courseSearchLoading}
        />
      )}
    </div>
  );
}
