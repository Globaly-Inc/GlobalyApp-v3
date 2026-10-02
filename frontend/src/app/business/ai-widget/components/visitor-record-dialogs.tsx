"use client";

// The Personal Profile's own popups, unchanged, pointed at a visitor's jsonb instead of at the
// platform_user_* tables. Importing them rather than copying them is the whole point: the fields
// a record has are defined in one place, and a change to the profile's Education popup reaches
// this page on the same deploy. `partial` is the one concession: a chat states records without
// institutions or dates, and correcting one must not force the owner to invent them.
import { QualificationDialog } from "@/app/personal/profile/qualification-dialog";
import { WorkExperienceDialog } from "@/app/personal/profile/work-experience-dialog";
import { TestScoreDialog } from "@/app/personal/profile/test-score-dialog";
import { AcademicTestDialog } from "@/app/personal/profile/academic-test-dialog";
import { ConfirmDeleteDialog } from "@/app/personal/profile/confirm-delete-dialog";
import {
  fromAcademicTest, fromLanguageTest, fromQualification, fromWorkExperience,
  toAcademicTest, toLanguageTest, toQualification, toWorkExperience,
} from "../utils/visitor-records";
import type { VisitorProfileEntry, VisitorRecordSection, WidgetVisitor } from "../apis/types";

/** Which popup is open, and on which entry. `index: null` means "add". */
export type RecordEditor = { section: VisitorRecordSection; index: number | null } | null;
export type RecordDeletion = { section: VisitorRecordSection; index: number } | null;

const DELETE_LABEL: Record<VisitorRecordSection, string> = {
  qualifications: "qualification",
  work_experiences: "work experience",
  language_tests: "language test",
  academic_tests: "academic test",
};

export function VisitorRecordDialogs({
  visitor,
  editor,
  onEditorChange,
  deletion,
  onDeletionChange,
  saving,
  onSaveEntry,
  onConfirmDelete,
}: Readonly<{
  visitor: WidgetVisitor;
  editor: RecordEditor;
  onEditorChange: (editor: RecordEditor) => void;
  deletion: RecordDeletion;
  onDeletionChange: (deletion: RecordDeletion) => void;
  saving: boolean;
  onSaveEntry: (section: VisitorRecordSection, index: number | null, entry: VisitorProfileEntry) => Promise<boolean>;
  onConfirmDelete: () => void;
}>) {
  const { section = null, index = null } = editor ?? {};
  const entry = section !== null && index !== null ? visitor[section]?.[index] ?? null : null;

  // Each popup is mounted only while it is the open one, so it takes its initial values from the
  // entry on mount and nothing has to reset it afterwards.
  const close = () => onEditorChange(null);
  const save = (next: VisitorProfileEntry) => onSaveEntry(section!, index, next);

  return (
    <>
      <QualificationDialog
        open={section === "qualifications"}
        onOpenChange={(open) => !open && close()}
        item={entry && section === "qualifications" ? toQualification(entry, index ?? 0) : null}
        saving={saving}
        onSave={(data) => save(fromQualification(data))}
        partial
      />

      <WorkExperienceDialog
        open={section === "work_experiences"}
        onOpenChange={(open) => !open && close()}
        item={entry && section === "work_experiences" ? toWorkExperience(entry, index ?? 0) : null}
        saving={saving}
        onSave={(data) => save(fromWorkExperience(data))}
        partial
      />

      <TestScoreDialog
        open={section === "language_tests"}
        onOpenChange={(open) => !open && close()}
        item={entry && section === "language_tests" ? toLanguageTest(entry, index ?? 0) : null}
        saving={saving}
        onSave={(data) => save(fromLanguageTest(data))}
      />

      <AcademicTestDialog
        open={section === "academic_tests"}
        onOpenChange={(open) => !open && close()}
        item={entry && section === "academic_tests" ? toAcademicTest(entry, index ?? 0) : null}
        saving={saving}
        onSave={(data) => save(fromAcademicTest(data))}
      />

      <ConfirmDeleteDialog
        open={deletion !== null}
        onOpenChange={(open) => !open && onDeletionChange(null)}
        label={deletion ? DELETE_LABEL[deletion.section] : "record"}
        onConfirm={onConfirmDelete}
      />
    </>
  );
}
