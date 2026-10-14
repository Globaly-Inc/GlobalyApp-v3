"use client";

import type { Dispatch, SetStateAction } from "react";
import type { Accreditation } from "@/app/admin/platform/categories/apis/types";
import { CourseDetailsCard } from "../services/course-details-card";
import type { CourseFieldSearch } from "./use-course-field-search";

type NamedLookup = { id: number; name: string };

/** Wires the shared CourseDetailsCard to a service form's schema field values (by field key). */
export function ServiceCourseDetails({
  fieldValues, setFieldValues, schemaFieldIdByKey, degreeLevels, areasOfStudy, accreditations, search, onSave,
}: Readonly<{
  fieldValues: Record<number, unknown>;
  setFieldValues: Dispatch<SetStateAction<Record<number, unknown>>>;
  schemaFieldIdByKey: Record<string, number>;
  degreeLevels: NamedLookup[];
  areasOfStudy: NamedLookup[];
  accreditations: Accreditation[];
  search: CourseFieldSearch;
  onSave: () => Promise<void>;
}>) {
  const { courseSearchLoading, debouncedSearchCourseField, courseFieldOptions } = search;
  return (
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
      onSave={onSave}
    />
  );
}
