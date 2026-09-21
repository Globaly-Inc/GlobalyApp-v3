"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AdminSegmentedTabs } from "@/app/admin/components/admin-segmented-tabs";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { useAuthState } from "@/app/auth/store/auth-slice";
import type { Accreditation, Category, Lookup } from "@/app/admin/platform/categories/apis/types";
import { businessProfileDetailApi } from "../../apis";
import { COURSE_CATEGORY_SLUGS } from "../../const";
import {
  createService, fetchServiceFieldValues, fetchServices, updateService, updateServiceFieldValues,
} from "../../store/business-profile-detail-slice";
import { ApiError } from "@/lib/api/http";
import type { SchemaFieldValue, ServiceInput } from "../../apis/types";
import { ServiceEditorHeader } from "./service-editor-header";
import { SummaryTab } from "./tabs/summary-tab";
import { CourseFeesTab } from "./tabs/course-fees-tab";
import { IntakesTab } from "./tabs/intakes-tab";
import { EligibilityTab } from "./tabs/eligibility-tab";
import { StudyOptionsTab } from "./tabs/study-options-tab";
import { StudyUnitsTab } from "./tabs/study-units-tab";
import { AccreditationsTab } from "./tabs/accreditations-tab";

const ALL_DETAIL_TABS = [
  { value: "summary", label: "Summary" },
  { value: "fees", label: "Course Fees" },
  { value: "intakes", label: "Intakes" },
  { value: "eligibility", label: "Eligibility" },
  { value: "study-options", label: "Study Options" },
  { value: "study-units", label: "Study Units" },
  { value: "accreditations", label: "Accreditations" },
] as const;
export type DetailTab = (typeof ALL_DETAIL_TABS)[number]["value"];

/**
 * Intakes, eligibility, study options, study units and accreditations only describe a course —
 * accommodation or insurance has none of them. Same gate as V1's BusinessServiceEditor and the
 * superadmin editor: one hardcoded category slug, with every other category getting Summary and
 * Fees plus whatever schema fields its own category defines.
 */
const COURSE_ONLY_TABS: DetailTab[] = ["intakes", "eligibility", "study-options", "study-units", "accreditations"];

function detailTabsFor(isCourse: boolean) {
  return ALL_DETAIL_TABS.filter((t) => isCourse || !COURSE_ONLY_TABS.includes(t.value)).map((t) =>
    t.value === "fees" && !isCourse ? { ...t, label: "Fees" } : t,
  );
}

type FormState = { name: string; service_category_id: number | null; description: string };

const EMPTY_FORM: FormState = { name: "", service_category_id: null, description: "" };

export function ServiceFormView({ businessId, serviceId }: Readonly<{ businessId: number; serviceId?: string }>) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const isEdit = !!serviceId;

  // Same institution-vs-business resolution as business-profile-detail-view.tsx: membership
  // lists are the authoritative source, since a dual-role user's `user_category` only names
  // their primary role, not which org this page is actually for.
  const { user: authUser } = useAuthState();
  const isInstitution =
    !authUser?.businesses.some((b) => b.id === businessId) && !!authUser?.institutions.some((i) => i.id === businessId);
  const orgBase = isInstitution ? "/institutions" : "/businesses";

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
  // The service's own cover, null while it inherits the org's. Held locally rather than read
  // from the store each render so an upload shows immediately, before the list is refetched.
  const [coverUrl, setCoverUrl] = useState<string | null>(
    () => (serviceId ? (services.find((s) => s.id === serviceId)?.cover_url ?? null) : null),
  );
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
    // Not the API's default limit of 10: this list is both the category picker AND the source of
    // `schemaFieldIdByKey`, so a truncated page silently hides categories and their schema fields.
    businessProfileDetailApi.getServiceCategories({ limit: 100 }, orgBase).then((res) => setServiceCategories(res.data));
    businessProfileDetailApi.getLookups("degree-levels", {}, orgBase).then((res) => setDegreeLevels(res.data));
    businessProfileDetailApi.getLookups("areas-of-study", {}, orgBase).then((res) => setAreasOfStudy(res.data));
    businessProfileDetailApi.getAccreditations({}, orgBase).then((res) => setAccreditations(res.data));
    if (isEdit && serviceId) {
      if (!services.some((s) => s.id === serviceId)) {
        dispatch(fetchServices({ id: businessId, params: { limit: 100 } })).then((res) => {
          if (fetchServices.fulfilled.match(res)) {
            const found = res.payload.data.find((s) => s.id === serviceId);
            if (found) {
              setForm(toForm(found));
              setCoverUrl(found.cover_url);
            }
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

  // Scoped to the SELECTED category: schema_fields are per-category rows with their own ids, so
  // merging across every category picked whichever came first and filed values under another
  // category's definition.
  const selectedCategory = serviceCategories.find((c) => c.id === form.service_category_id);
  const isCourse = COURSE_CATEGORY_SLUGS.has(selectedCategory?.slug ?? "");

  const schemaFieldIdByKey: Record<string, number> = {};
  for (const f of selectedCategory?.schema_fields ?? []) {
    schemaFieldIdByKey[f.key] = f.id;
  }

  // Switching to a category that doesn't have the tab you're on would otherwise leave the body
  // rendering a section its tab strip no longer offers.
  const detailTabs = detailTabsFor(isCourse);
  const activeTab = detailTabs.some((t) => t.value === detailTab) ? detailTab : "summary";

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

      <ServiceEditorHeader
        ownerName={profile?.business_name ?? "Business"}
        ownerLogoUrl={profile?.logo_url ?? null}
        ownerCoverUrl={profile?.cover_url ?? null}
        isInstitution={isInstitution}
        serviceId={isEdit ? (serviceId ?? null) : null}
        orgBase={orgBase}
        coverUrl={coverUrl}
        onCoverChange={setCoverUrl}
        serviceCategories={serviceCategories}
        categoryId={form.service_category_id}
        onCategoryChange={(id) => set("service_category_id", id)}
        name={form.name}
        onNameChange={(v) => set("name", v)}
      />

      {isEdit && serviceId ? (
        <>
          <AdminSegmentedTabs options={detailTabs} value={activeTab} onChange={setDetailTab} />
          <Card>
            <CardContent>
              {activeTab === "summary" && (
                <SummaryTab
                  serviceId={serviceId}
                  orgBase={orgBase}
                  isCourse={isCourse}
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
              {activeTab === "fees" && <CourseFeesTab serviceId={serviceId} orgBase={orgBase} />}
              {activeTab === "intakes" && <IntakesTab serviceId={serviceId} orgBase={orgBase} />}
              {activeTab === "eligibility" && <EligibilityTab serviceId={serviceId} orgBase={orgBase} />}
              {activeTab === "study-options" && <StudyOptionsTab serviceId={serviceId} orgBase={orgBase} />}
              {activeTab === "study-units" && <StudyUnitsTab serviceId={serviceId} orgBase={orgBase} />}
              {activeTab === "accreditations" && <AccreditationsTab serviceId={serviceId} orgBase={orgBase} />}
            </CardContent>
          </Card>
        </>
      ) : (
        <SummaryTab
          serviceId={null}
          orgBase={orgBase}
          isCourse={isCourse}
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
