import type { WidgetVisitor } from "./types";

// ── Visitors ─────────────────────────────────────────────────────────────────
// Deliberately mixed: two anonymous rows, two who handed over their details, one who was
// shown the contact card and skipped it. That last one is the case the UI gets wrong most
// easily — asked, declined, still a Visitor.
export const mockVisitors: WidgetVisitor[] = [
  {
    id: 4, embed_config_id: 1, session_id: 812, name: null, email: null, phone: null, contact_source: null, status: "visitor",
    contact_status: "not_shown", contact_submitted_at: null, conversation_state: "active",
    message_count: 2,
    first_seen_at: new Date(Date.now() - 4 * 60_000).toISOString(),
    last_activity_at: new Date(Date.now() - 2 * 60_000).toISOString(),
    qualifications: null, language_tests: null, academic_tests: null, work_experiences: null,
    age: null, gender: null, nationality: null, nationality_raw: null, study_preference: null,
    summary_status: null, summary_sent_at: null,
    // Asked for a person a minute ago — the "Wants a person" case, sorted to the top.
    handoff_requested_at: new Date(Date.now() - 60_000).toISOString(),
    unread_count: 1,
  },
  {
    id: 3, embed_config_id: 1, session_id: 809, name: "John Doe", email: "john@example.com", phone: null, contact_source: "volunteered", status: "lead",
    contact_status: "submitted",
    contact_submitted_at: new Date(Date.now() - 6 * 60_000).toISOString(),
    conversation_state: "end_confirmed", message_count: 11,
    first_seen_at: new Date(Date.now() - 22 * 60_000).toISOString(),
    last_activity_at: new Date(Date.now() - 5 * 60_000).toISOString(),
    qualifications: [{ degree_title: "BSc Computer Science", institution_name: "Tribhuvan University", grade_value: "3.4", grading_system: "GPA" }],
    language_tests: [{ test_type: "IELTS", overall_score: "7.0", test_date: "2026-06-12", sub_scores: { listening: "7.5", reading: "7.0" } }],
    academic_tests: null,
    work_experiences: [{ job_title: "Junior Developer", organization_name: "Leapfrog", is_current: true, start_date: "2025-02-01" }],
    // "I'm Nepali" — resolved to the country, with their own wording kept beside it.
    age: "24", gender: "male", nationality: "Nepal", nationality_raw: "Nepali",
    study_preference: "MSc Data Science",
    summary_status: "sent", summary_sent_at: new Date(Date.now() - 4 * 60_000).toISOString(),
  },
  {
    id: 2, embed_config_id: 1, session_id: 804, name: null, email: null, phone: null, contact_source: null, status: "visitor",
    contact_status: "skipped", contact_submitted_at: null, conversation_state: "continue",
    message_count: 7,
    first_seen_at: new Date(Date.now() - 3 * 3_600_000).toISOString(),
    last_activity_at: new Date(Date.now() - 95 * 60_000).toISOString(),
    qualifications: [{ degree_title: "High School", institution_name: "St. Xavier's" }],
    language_tests: null, academic_tests: null, work_experiences: null,
    age: null, gender: null, nationality: null, nationality_raw: null,
    study_preference: "Bachelor of Business Administration",
    summary_status: null, summary_sent_at: null,
    resolved_at: new Date(Date.now() - 90 * 60_000).toISOString(), resolved_by_name: "Manjil Shakya",
  },
  {
    id: 1, embed_config_id: 1, session_id: 791, name: "Priya Sharma", email: "priya.sharma@example.com", phone: "+977 98 1234 5678", contact_source: "card", status: "lead",
    contact_status: "submitted",
    contact_submitted_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    conversation_state: "active", message_count: 19,
    first_seen_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    last_activity_at: new Date(Date.now() - 26 * 3_600_000).toISOString(),
    qualifications: null,
    language_tests: [{ test_status: "booked", test_type: "PTE", test_date: "2026-11-02" }],
    academic_tests: [{ test_type: "GRE", overall_score: "318" }],
    work_experiences: null,
    // "early 30s" is why age is verbatim text, and "Kashmiri" is why an unmatched nationality
    // keeps the raw wording rather than being filed under a country they did not name.
    age: "early 30s", gender: "female", nationality: null, nationality_raw: "Kashmiri",
    study_preference: "MBA",
    summary_status: "pending", summary_sent_at: null,
    summary: {
      text: "Career changer weighing an **MBA**, with a **GRE of 318** that meets the requirement and a **PTE booked for November**.",
      open: ["Scholarships", "Fees"],
      next_step: "Send scholarship options and the February application timeline.",
      program: { name: "MBA", city: "Sydney" },
      topics: ["MBA"],
      chat_count: 2,
      detail_count: 7,
      generated_at: new Date(Date.now() - 20 * 60_000).toISOString(),
    },
    // Taken over by a colleague — the "someone else has this" case.
    handled_by_user_id: 77, handled_by_name: "Manjil Shakya", handled_by_me: false,
    handled_at: new Date(Date.now() - 5 * 60_000).toISOString(), unread_count: 2,
  },
];
