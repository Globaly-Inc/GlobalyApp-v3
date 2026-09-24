// Owner-side visitor editing. Separate from chat.schema so the widget's public/guest contract
// and the portal's private one cannot be confused for each other — nothing here is ever parsed
// from an unauthenticated request.

import { z } from "zod";

export const VisitorIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

/**
 * The four record sections, field for field as the PERSONAL PROFILE POPUPS define them.
 *
 * Those popups are the source of truth for what a record is, so these shapes are their fields
 * and nothing else — and `tests/widget-visitor-list.ts` asserts, key by key, that they still
 * match `PROFILE_FIELDS` in lib/card-parser (what the chat extractor is allowed to return). If
 * the popup, the extractor and this schema ever disagree, a visitor's own answer and an owner's
 * correction stop being the same kind of thing, and the test fails rather than the drift
 * shipping silently.
 *
 * `sort_order` is in the popups' INPUT TYPES but is not a field of any popup — it orders rows in
 * the platform_user_* tables. A jsonb array is already ordered, so storing it would be a second,
 * disagreeing source of order.
 */
const text = z.string().trim().max(200).optional();

export const VISITOR_ENTRY_SHAPES = {
  qualifications: {
    qualification_type: text, degree_title: text, subject_area: text, institution_name: text,
    grading_system: text, grade_value: text, is_current: z.boolean().optional(),
    start_date: text, end_date: text,
  },
  language_tests: {
    test_status: text, test_type: text, overall_score: text, test_date: text,
    sub_scores: z.record(z.string().max(40), z.string().trim().max(200)).optional(),
  },
  academic_tests: {
    test_status: text, test_type: text, overall_score: text, test_date: text,
    sub_scores: z.record(z.string().max(40), z.string().trim().max(200)).optional(),
  },
  work_experiences: {
    job_title: text, organization_name: text, is_current: z.boolean().optional(),
    start_date: text, end_date: text,
  },
} as const;

/**
 * An entry with its blanks removed.
 *
 * A popup submits `""` for every field left untouched, and `""` in jsonb is not "no answer" —
 * it reads back as an answer of nothing and would print as an empty line on the detail page.
 * `cleanProfileEntry` drops empties on the extraction side for the same reason; this is the
 * owner-edit side of that rule. `false` survives, so "not currently studying here" is kept.
 */
function entrySchema(shape: z.ZodRawShape) {
  return z
    .object(shape)
    .strict()
    .transform((entry) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(entry)) {
        if (v === undefined || v === "") continue;
        if (k === "sub_scores") {
          const scores = Object.fromEntries(
            Object.entries(v as Record<string, string>).filter(([, s]) => s !== ""),
          );
          if (Object.keys(scores).length) out[k] = scores;
          continue;
        }
        out[k] = v;
      }
      return out;
    });
}

/** A whole section, replaced wholesale — add, edit and delete are all "here is the new list". */
function sectionSchema(shape: z.ZodRawShape) {
  // 50, against the extractor's 10 (MAX_PROFILE_ITEMS): a model listing ten qualifications is
  // hallucinating, a person entering twelve is doing their job.
  return z.array(entrySchema(shape)).max(50).optional();
}

/** Free text the visitor stated about themselves. Null clears it; an empty string is not a value. */
const editableText = (max: number) => z.string().trim().min(1).max(max).nullable().optional();

/**
 * What a business or institution may change on a visitor row.
 *
 * `.strict()` is doing real work here, not tidiness. `status` is a GENERATED ALWAYS column —
 * an UPDATE naming it raises an error rather than being ignored — and `message_count`,
 * `first_seen_at`, `contact_status` and the rest are the machinery's own record of what
 * happened. A permissive schema would let a typo'd field name reach the UPDATE and 500.
 *
 * `nationality_raw` is absent on purpose: it holds the visitor's OWN wording, and an owner
 * editing it would destroy the record of what was actually said. Correcting `nationality` is
 * the supported fix — the raw value stays beside it as the evidence.
 *
 * The four record sections ARE editable, and each is replaced wholesale: add, edit and delete
 * all arrive as "here is the new list". Note what that does not do — `recordProfile` merges a
 * later extraction over these arrays by entry key, so a deleted entry comes back if the visitor
 * mentions it again. See the note on the PATCH route.
 */
export const VisitorPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).nullable().optional(),
    email: z.string().trim().email().max(320).nullable().optional(),
    // Verbatim, never bucketed — "early 30s" is a legitimate stored value, so this is text
    // with a length bound and nothing more.
    age: editableText(60),
    gender: editableText(60),
    nationality: editableText(120),
    study_preference: editableText(200),
    qualifications: sectionSchema(VISITOR_ENTRY_SHAPES.qualifications),
    work_experiences: sectionSchema(VISITOR_ENTRY_SHAPES.work_experiences),
    language_tests: sectionSchema(VISITOR_ENTRY_SHAPES.language_tests),
    academic_tests: sectionSchema(VISITOR_ENTRY_SHAPES.academic_tests),
  })
  .strict()
  // Name and email move together or not at all. CHECK chk_ai_widget_visitors_contact_pair is
  // `(name IS NULL) = (email IS NULL)`, so a patch touching one alone can take a valid row to
  // an invalid one — a 500 from Postgres instead of a 400 from here. Requiring both in the
  // patch keeps the invariant checkable without first reading the row.
  .refine((v) => (v.name === undefined) === (v.email === undefined), {
    message: "Name and email must be edited together",
    path: ["email"],
  })
  .refine((v) => (v.name === null) === (v.email === null), {
    message: "Name and email must be cleared together",
    path: ["email"],
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

export type VisitorPatch = z.infer<typeof VisitorPatchSchema>;
