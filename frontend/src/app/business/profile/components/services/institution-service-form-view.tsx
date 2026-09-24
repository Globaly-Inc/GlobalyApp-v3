"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, FileText, Link2, Loader2, Pencil, Save, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Combobox } from "@/components/combobox";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DynamicIcon } from "@/components/dynamic-icon";
import { CourseDetailsCard } from "@/app/admin/platform/businesses/components/services/course-details-card";
import { CategoryExtraFields } from "@/app/admin/platform/businesses/components/services/category-extra-fields";
import { AdminSegmentedTabs } from "@/app/admin/components/admin-segmented-tabs";
import { CourseFeesTab } from "./tabs/course-fees-tab";
import { IntakesTab } from "./tabs/intakes-tab";
import { EligibilityTab } from "./tabs/eligibility-tab";
import { StudyOptionsTab } from "./tabs/study-options-tab";
import { StudyUnitsTab } from "./tabs/study-units-tab";
import { AccreditationsTab } from "./tabs/accreditations-tab";
import { PublicBadge, ServiceSummaryBodyExtras, ServiceSummarySidebarExtras } from "./service-summary-extras";
import { coursePublicHref } from "../../utils";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import type { Accreditation, Category, Lookup } from "@/app/admin/platform/categories/apis/types";
import { businessProfileDetailApi } from "../../apis";
import {
  createService, fetchServices, toggleServicePublished, updateService, updateServiceFieldValues,
} from "../../store/business-profile-detail-slice";
import { ApiError } from "@/lib/api/http";
import type { ServiceInput } from "../../apis/types";

type Tab = "summary" | "fees" | "intakes" | "eligibility" | "study-options" | "study-units" | "accreditations";
type FormState = { name: string; service_category_id: number | null; description: string };
const EMPTY_FORM: FormState = { name: "", service_category_id: null, description: "" };

// Institution twin of admin's institution-service-form-view.tsx — same layout, fields and
// auto-save behavior, rewired to the self-service auth-scoped API (createService/updateService
// etc. resolve institution vs business server-side from the caller's own session, see
// backend's services.routes.ts) instead of admin's explicit institutionId-in-URL thunks.
export function InstitutionServiceFormView({ businessId, serviceId }: Readonly<{ businessId: number; serviceId?: string }>) {
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
  const [isPublished, setIsPublished] = useState(() => {
    const existing = serviceId ? services.find((s) => s.id === serviceId) : undefined;
    return existing?.is_published ?? false;
  });
  const [publishing, setPublishing] = useState(false);
  const [fieldValues, setFieldValues] = useState<Record<number, unknown>>({});
  const [tab, setTab] = useState<Tab>("summary");
  const [saving, setSaving] = useState(false);
  const [generatingDescription, setGeneratingDescription] = useState(false);
  const [editingDescription, setEditingDescription] = useState(!isEdit);
  const [savingDescription, setSavingDescription] = useState(false);
  const savedNameRef = useRef(form.name);

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
            if (found) { setForm(toForm(found)); setIsPublished(found.is_published); }
          }
        });
      }
      businessProfileDetailApi.getServiceFieldValues(serviceId).then((values) => {
        const map: Record<number, unknown> = {};
        for (const v of values) map[v.schema_field_id] = v.value;
        setFieldValues(map);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Matches admin's institution form: a brand-new service defaults straight to "Courses" (every
  // institution service lives in the extraction catalog regardless of category, but Courses is
  // what unlocks the course-only tabs/fields below) rather than leaving the picker blank.
  useEffect(() => {
    if (isEdit || form.service_category_id || serviceCategories.length === 0) return;
    const courses = serviceCategories.find((c) => c.slug === "courses");
    if (courses) set("service_category_id", courses.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, form.service_category_id, serviceCategories]);

  // Every institution service lives in extraction_courses regardless of category
  // (service_category_id is a plain column there — see institution-courses.repository.ts), so
  // changing category on an existing service is a normal update, not a cross-table move.
  // Auto-saves like handleTogglePublish — a category pick that's silently lost until some other
  // save fires would be confusing. Fences the rollback below to whichever category save is the
  // LATEST one in flight — without this, an earlier request that fails after a later one already
  // succeeded would restore the earlier (now-stale) category/fields/tab right over the successful
  // selection, leaving the form disagreeing with Redux and the server.
  const categorySaveSeqRef = useRef(0);
  const [savingCategory, setSavingCategory] = useState(false);
  const handleCategoryChange = async (categoryId: number | null) => {
    const changed = categoryId !== form.service_category_id;
    if (!changed) return;
    const previousCategoryId = form.service_category_id;
    const previousFieldValues = fieldValues;
    const previousTab = tab;
    const seq = ++categorySaveSeqRef.current;

    set("service_category_id", categoryId);
    setFieldValues({});
    const nextIsCourse = serviceCategories.find((c) => c.id === categoryId)?.slug === "courses";
    if (!nextIsCourse && tab !== "summary" && tab !== "fees") setTab("summary");

    if (!isEdit || !serviceId || !categoryId) return;
    setSavingCategory(true);
    try {
      await dispatch(updateService({ id: businessId, serviceId, patch: { service_category_id: categoryId } })).unwrap();
    } catch (e) {
      if (categorySaveSeqRef.current === seq) {
        set("service_category_id", previousCategoryId);
        setFieldValues(previousFieldValues);
        setTab(previousTab);
      }
      toast.error("Couldn't update category", { description: (e as ApiError).message });
    } finally {
      if (categorySaveSeqRef.current === seq) setSavingCategory(false);
    }
  };

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const canSave = form.name.trim().length >= 2 && !!form.service_category_id;

  const catalogOptionsByKey: Record<string, { value: string; label: string }[]> = {
    degree_level: degreeLevels.map((l) => ({ value: String(l.id), label: l.name })),
    area_of_study: areasOfStudy.map((l) => ({ value: String(l.id), label: l.name })),
    awarded_by: accreditations.map((a) => ({ value: String(a.id), label: a.name })),
  };

  // Scoped to the SELECTED category: schema_fields are per-category rows (their own ids), so a
  // "degree_level" field on Academic Courses has a different id than one on, say, Diplomas —
  // merging across every category picked whichever category came first, silently mismatching
  // the id a value was saved under and leaving the combobox blank on edit.
  const selectedCategory = serviceCategories.find((c) => c.id === form.service_category_id);
  // Matches V1's BusinessServiceEditor.tsx (and admin's institution form): a single hardcoded
  // category slug gates the course-only tabs/cards — every other category only gets Summary + Fees.
  const isCourse = selectedCategory?.slug === "courses";

  const schemaFieldIdByKey: Record<string, number> = {};
  for (const f of selectedCategory?.schema_fields ?? []) {
    schemaFieldIdByKey[f.key] = f.id;
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

  const handleWriteWithAi = async () => {
    if (!form.name.trim()) {
      toast.error("Enter a service name first");
      return;
    }
    setGeneratingDescription(true);
    try {
      const categoryName = serviceCategories.find((c) => c.id === form.service_category_id)?.name;
      const { text } = await businessProfileDetailApi.generateServiceDescription({
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

  // Edit mode has no global save: every card persists itself (name on blur, description and
  // course details via their own Save buttons, category/publish immediately on change). This
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
      router.push(`/business/profile/${businessId}?tab=services`);
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
      await dispatch(toggleServicePublished({ id: businessId, serviceId, is_published: next })).unwrap();
      setIsPublished(next);
      toast.success(next ? "Service published" : "Service unpublished");
    } catch (e) {
      toast.error("Couldn't update publish status", { description: (e as ApiError).message });
    } finally {
      setPublishing(false);
    }
  };

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

  const socialLinks = [profile?.linkedin_url, profile?.facebook_url, profile?.instagram_url, profile?.twitter_url].filter(Boolean) as string[];

  return (
    <div className="space-y-4 pb-20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Button
          variant="ghost"
          className="h-10 cursor-pointer gap-1 px-1 text-muted-foreground"
          onClick={() => router.push(`/business/profile/${businessId}?tab=services`)}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to services
        </Button>
        <div className="flex items-center gap-3">
          {isEdit && serviceId && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Same pattern as the profile's own Preview button and the service list's
                  // name link — a real, separate public page (/course/{slug}), not an embedded
                  // mock of it. Opens synchronously (inside the click gesture) so popup blockers
                  // don't catch it, then redirects once the preview token comes back.
                  const tab = window.open("", "_blank");
                  coursePublicHref(form.name, serviceId).then((href) => { if (tab) tab.location.href = href; });
                }}
              >
                <Eye className="mr-1 h-4 w-4" />
                Preview
              </Button>
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground">{isPublished ? "Published" : "Unpublished"}</Label>
                <Switch checked={isPublished} disabled={publishing} onCheckedChange={handleTogglePublish} />
              </div>
            </>
          )}
          {!isEdit && (
            <Button className="cursor-pointer gap-1.5" disabled={!canSave || saving} onClick={handleSubmit}>
              <Save className="h-3.5 w-3.5" />
              {saving ? "Creating…" : "Create service"}
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm">
        <div className="relative h-40 bg-linear-to-br from-primary to-primary/60 sm:h-48" />
        <CardContent className="ml-8 mb-8 flex flex-col gap-1.5 pt-16">
          <div className="relative">
            <Avatar className="absolute -top-24 left-0 size-24 rounded-xl border-4 border-background bg-white shadow-lg">
              {profile?.logo_url && (
                <AvatarImage src={profile.logo_url} alt={profile.business_name} className="rounded-lg object-contain p-1" />
              )}
              <AvatarFallback className="rounded-lg bg-primary text-2xl font-medium text-primary-foreground">
                {(profile?.business_name ?? "I").charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </div>
          <Combobox
            options={serviceCategories.map((c) => ({
              value: String(c.id),
              label: c.name,
              icon: <DynamicIcon name={c.icon} fallback="GraduationCap" className="h-3.5 w-3.5" />,
            }))}
            value={form.service_category_id ? String(form.service_category_id) : ""}
            onChange={(v) => handleCategoryChange(v ? Number(v) : null)}
            disabled={savingCategory}
            placeholder="Select category"
            searchPlaceholder="Search categories..."
            className="h-7 w-fit min-w-0 rounded-full border-primary/30 bg-primary/5 px-3 text-xs font-medium text-primary"
          />
          <Input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            onBlur={handleNameBlur}
            placeholder="Untitled service"
            className="h-10 border-none p-0 text-xl font-bold text-foreground shadow-none focus-visible:ring-0"
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <p className="text-sm text-muted-foreground">{profile?.business_name ?? "Institution"}</p>
            {socialLinks.length > 0 && (
              <div className="ml-1 flex items-center gap-1.5">
                {socialLinks.map((url) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-7 w-7 items-center justify-center rounded-full border text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                  </a>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </div>

      {isEdit && (
        <AdminSegmentedTabs
          options={[
            { value: "summary", label: "Summary" },
            { value: "fees", label: isCourse ? "Course Fees" : "Fees" },
            ...(isCourse ? [
              { value: "intakes", label: "Intakes" },
              { value: "eligibility", label: "Eligibility" },
              { value: "study-options", label: "Study Options" },
              { value: "study-units", label: "Study Units" },
              { value: "accreditations", label: "Accreditations" },
            ] as const : []),
          ]}
          value={tab}
          onChange={(v) => setTab(v as Tab)}
        />
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {tab === "summary" ? (
            <>
              <Card className="gap-0 overflow-hidden">
                <div className="flex items-center justify-between border-b px-5 py-4">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    <h2 className="text-sm font-semibold">Description</h2>
                    <PublicBadge />
                  </div>
                  {isEdit && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingDescription((v) => !v)} aria-label="Edit description">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <CardContent className="p-5">
                  {editingDescription ? (
                    <div className="space-y-3">
                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 text-primary"
                          disabled={generatingDescription}
                          onClick={handleWriteWithAi}
                        >
                          {generatingDescription ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                          Write with AI
                        </Button>
                      </div>
                      <Textarea
                        value={form.description}
                        onChange={(e) => set("description", e.target.value)}
                        placeholder="Describe the service..."
                        rows={8}
                        className="min-h-20"
                      />
                      {isEdit && (
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" disabled={savingDescription} onClick={() => setEditingDescription(false)}>Cancel</Button>
                          <Button size="sm" disabled={savingDescription} onClick={handleSaveDescription}>{savingDescription ? "Saving…" : "Save"}</Button>
                        </div>
                      )}
                    </div>
                  ) : form.description ? (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{form.description}</p>
                  ) : (
                    <div>
                      <p className="text-xs text-muted-foreground">Description</p>
                      <p className="text-sm italic text-muted-foreground">Not set</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {isEdit && serviceId && (
                <ServiceSummaryBodyExtras serviceId={serviceId} isCourse={isCourse} degreeLevels={degreeLevels} onNavigateTab={setTab} />
              )}
            </>
          ) : tab === "fees" ? (
            isEdit && serviceId && <CourseFeesTab serviceId={serviceId} isCourse={isCourse} />
          ) : tab === "intakes" ? (
            isEdit && serviceId && <IntakesTab serviceId={serviceId} />
          ) : tab === "eligibility" ? (
            isEdit && serviceId && <EligibilityTab serviceId={serviceId} />
          ) : tab === "study-options" ? (
            isEdit && serviceId && <StudyOptionsTab serviceId={serviceId} />
          ) : tab === "study-units" ? (
            isEdit && serviceId && <StudyUnitsTab serviceId={serviceId} />
          ) : (
            isEdit && serviceId && <AccreditationsTab serviceId={serviceId} />
          )}
        </div>

        <div className="flex flex-col gap-4">
          {isCourse && (
          <CourseDetailsCard
            degreeLevelValue={schemaFieldIdByKey.degree_level != null && fieldValues[schemaFieldIdByKey.degree_level] != null ? String(fieldValues[schemaFieldIdByKey.degree_level]) : ""}
            areaOfStudyValue={schemaFieldIdByKey.area_of_study != null && fieldValues[schemaFieldIdByKey.area_of_study] != null ? String(fieldValues[schemaFieldIdByKey.area_of_study]) : ""}
            awardedByValue={schemaFieldIdByKey.awarded_by != null && fieldValues[schemaFieldIdByKey.awarded_by] != null ? String(fieldValues[schemaFieldIdByKey.awarded_by]) : ""}
            degreeLevels={degreeLevels}
            areasOfStudy={areasOfStudy}
            accreditations={accreditations}
            onChangeDegreeLevel={(v) => { const id = schemaFieldIdByKey.degree_level; if (id != null) setFieldValues((f) => ({ ...f, [id]: v })); }}
            onChangeAreaOfStudy={(v) => { const id = schemaFieldIdByKey.area_of_study; if (id != null) setFieldValues((f) => ({ ...f, [id]: v })); }}
            onChangeAwardedBy={(v) => { const id = schemaFieldIdByKey.awarded_by; if (id != null) setFieldValues((f) => ({ ...f, [id]: v })); }}
            onSearchDegreeLevel={(q) => debouncedSearchCourseField("degree_level", q)}
            onSearchAreaOfStudy={(q) => debouncedSearchCourseField("area_of_study", q)}
            onSearchAwardedBy={(q) => debouncedSearchCourseField("awarded_by", q)}
            degreeLevelOptions={courseFieldOptions("degree_level", schemaFieldIdByKey.degree_level != null ? String(fieldValues[schemaFieldIdByKey.degree_level] ?? "") : "")}
            areaOfStudyOptions={courseFieldOptions("area_of_study", schemaFieldIdByKey.area_of_study != null ? String(fieldValues[schemaFieldIdByKey.area_of_study] ?? "") : "")}
            awardedByOptions={courseFieldOptions("awarded_by", schemaFieldIdByKey.awarded_by != null ? String(fieldValues[schemaFieldIdByKey.awarded_by] ?? "") : "")}
            loadingDegreeLevel={courseSearchLoading.degree_level ?? false}
            loadingAreaOfStudy={courseSearchLoading.area_of_study ?? false}
            loadingAwardedBy={courseSearchLoading.awarded_by ?? false}
            onSave={handleSaveCourseDetails}
          />
          )}

          {/* Unlike a plain business, extraction_courses (this institution's storage — see
              institution-courses.repository.ts) has no generic field-value table, only the fixed
              columns wired up above (degree_level/area_of_study/awarded_by). A non-course
              category's own schema_fields (e.g. Short Courses' course_type/certification) have
              nowhere to persist yet, so this card is hidden here rather than shown and silently
              dropped on save. */}
          {isCourse && (
            <CategoryExtraFields
              fields={(selectedCategory?.schema_fields ?? []).filter((f) => !["degree_level", "area_of_study", "awarded_by"].includes(f.key))}
              values={fieldValues}
              onChangeField={(id, v) => setFieldValues((f) => ({ ...f, [id]: v }))}
              onSave={handleSaveCourseDetails}
            />
          )}

          {isEdit && serviceId && (
            <ServiceSummarySidebarExtras
              serviceId={serviceId}
              name={form.name} hasCategory={!!form.service_category_id} description={form.description}
              isCourse={isCourse} tab={tab} onNavigateTab={setTab}
            />
          )}
        </div>
      </div>
    </div>
  );
}
