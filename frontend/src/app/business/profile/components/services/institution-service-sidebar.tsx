"use client";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FormSection } from "@/components/ui/form-section";
import { CourseDetailsCard } from "@/app/admin/platform/businesses/components/services/course-details-card";
import { CategoryExtraFields } from "@/app/admin/platform/businesses/components/services/category-extra-fields";
import { ServiceSummarySidebarExtras } from "./service-summary-extras";
import type { InstitutionServiceForm } from "./use-institution-service-form";

/** Side column of the institution form: publish switch, course details, extra fields and the summary extras. */
export function InstitutionServiceSidebar({ f, serviceId }: Readonly<{ f: InstitutionServiceForm; serviceId?: string }>) {
  const { isEdit, isCourse, schemaFieldIdByKey: ids, fieldValues, selectedCategory, setFieldValue, form } = f;
  const valueOf = (key: string) => (ids[key] != null && fieldValues[ids[key]] != null ? String(fieldValues[ids[key]]) : "");
  const optionValueOf = (key: string) => (ids[key] != null ? String(fieldValues[ids[key]] ?? "") : "");
  const setByKey = (key: string) => (v: string) => { const id = ids[key]; if (id != null) setFieldValue(id, v); };

  return (
    <div className="flex flex-col gap-4">
      {isEdit && serviceId && (
        <FormSection title="Publishing" columns={1}>
          <div className="flex items-center justify-between gap-3">
            <Label key={String(f.isPublished)} htmlFor="service-published" className="animate-pop-in text-sm text-muted-foreground">
              {f.isPublished ? "Published" : "Draft"}
            </Label>
            <Switch id="service-published" checked={f.isPublished} disabled={f.publishing} onCheckedChange={f.handleTogglePublish} />
          </div>
        </FormSection>
      )}

      {isCourse && (
        <CourseDetailsCard
          degreeLevelValue={valueOf("degree_level")}
          areaOfStudyValue={valueOf("area_of_study")}
          awardedByValue={valueOf("awarded_by")}
          degreeLevels={f.degreeLevels}
          areasOfStudy={f.areasOfStudy}
          accreditations={f.accreditations}
          onChangeDegreeLevel={setByKey("degree_level")}
          onChangeAreaOfStudy={setByKey("area_of_study")}
          onChangeAwardedBy={setByKey("awarded_by")}
          onSearchDegreeLevel={(q) => f.debouncedSearchCourseField("degree_level", q)}
          onSearchAreaOfStudy={(q) => f.debouncedSearchCourseField("area_of_study", q)}
          onSearchAwardedBy={(q) => f.debouncedSearchCourseField("awarded_by", q)}
          degreeLevelOptions={f.courseFieldOptions("degree_level", optionValueOf("degree_level"))}
          areaOfStudyOptions={f.courseFieldOptions("area_of_study", optionValueOf("area_of_study"))}
          awardedByOptions={f.courseFieldOptions("awarded_by", optionValueOf("awarded_by"))}
          loadingDegreeLevel={f.courseSearchLoading.degree_level ?? false}
          loadingAreaOfStudy={f.courseSearchLoading.area_of_study ?? false}
          loadingAwardedBy={f.courseSearchLoading.awarded_by ?? false}
          onSave={f.handleSaveCourseDetails}
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
          fields={(selectedCategory?.schema_fields ?? []).filter((field) => !["degree_level", "area_of_study", "awarded_by"].includes(field.key))}
          values={fieldValues}
          onChangeField={(id, v) => setFieldValue(id, v)}
          onSave={f.handleSaveCourseDetails}
        />
      )}

      {isEdit && serviceId && (
        <ServiceSummarySidebarExtras
          serviceId={serviceId}
          name={form.name} hasCategory={!!form.service_category_id} description={form.description}
          isCourse={isCourse} tab={f.tab} onNavigateTab={f.setTab} visibility={f.sectionVisibility}
        />
      )}
    </div>
  );
}
