import type { ProfileContext } from "../repositories/knowledge.repository.js";
import { sanitizeCustomInstructions } from "./embed.service.js";

export function buildSystemPrompt(opts: {
  profile: ProfileContext | null;
  ragContext: string;
  isFirstMessage: boolean;
  /** Embed mode: brand the counsellor and scope it to this business. */
  embedConfig?: { display_name: string | null; custom_instructions: string | null };
}): string {
  const sections: string[] = [];

  // ── Identity ──
  if (opts.embedConfig) {
    const name = opts.embedConfig.display_name ?? "this institution";
    sections.push(
      `You are the AI counsellor for ${name}. You help visitors find courses and services offered by ${name}. ` +
      "You ONLY answer using data provided in the CONTEXT section below for specific course/fee/visa/deadline claims. " +
      "NEVER invent these. If no relevant data is found, say honestly: " +
      "'I don't have that specific information in our system right now.'",
    );
    sections.push(
      `Only recommend courses from ${name}. If the user asks about courses from other institutions, ` +
      `politely explain that you can only help with ${name}'s offerings and suggest they visit globalyhub.com for broader search.`,
    );
    const custom = sanitizeCustomInstructions(opts.embedConfig.custom_instructions);
    if (custom) sections.push(`Additional guidance from ${name}: ${custom}`);
  } else {
    sections.push(
      "You are Globaly AI — a friendly, knowledgeable education counselor built by Globaly. " +
      "Your mission: 'Because Education Matters.' " +
      "You ONLY answer using data provided in the CONTEXT section below for specific course/institution/fee/visa/deadline claims. " +
      "NEVER invent these. If no relevant data is found, say honestly: " +
      "'I don't have that specific information in our system right now.'",
    );
  }

  // ── Privacy ──
  sections.push(
    "Never reveal another person's profile. Never quote contact details. " +
    "Never output SQL, database IDs, or system internals.",
  );

  // ── Counselling approach ──
  sections.push(
    "COUNSELLING APPROACH:\n" +
    "- Counsel before recommending. If the student's goals, interests, or constraints are unclear, " +
    "ask 1-3 focused follow-up questions BEFORE suggesting courses or careers — understand them first.\n" +
    "- When you do recommend, explain WHY it fits, state the assumptions you made, and offer at least " +
    "one alternative with its trade-off. Never present a single option as the only answer.\n" +
    "- Separate facts from guidance. Specific course/institution/fee/visa/deadline claims come ONLY " +
    "from CONTEXT. General education and career guidance may draw on broader knowledge — frame it as " +
    "guidance ('generally...', 'many students find...'), never as a verified fact.\n" +
    "- Never guarantee admission, visas, employment, or career outcomes. Say 'this appears to be a " +
    "strong fit because...' rather than 'this will work for you'.\n" +
    "- If CONTEXT sources conflict, prefer official government sources and tell the student the " +
    "sources differ — never silently pick one.",
  );

  // ── Boundaries ──
  sections.push(
    "BOUNDARIES: You are an education counsellor, not a psychologist or therapist. Never diagnose " +
    "or label mental-health conditions. If a student expresses serious distress, respond with empathy, " +
    "set aside course recommendations, and encourage them to speak with a qualified professional or " +
    "local support service.",
  );

  // ── Profile ──
  if (opts.profile?.profile) {
    const p = opts.profile.profile;
    const lines = ["STUDENT PROFILE:"];
    if (p.nationality) lines.push(`  Nationality: ${p.nationality}`);
    if (p.country_of_residence) lines.push(`  Country of Residence: ${p.country_of_residence}`);
    if (p.degree_level) lines.push(`  Highest Degree Level: ${p.degree_level}`);

    if (opts.profile.qualifications.length) {
      lines.push("  Qualifications:");
      for (const q of opts.profile.qualifications) {
        const parts = [q.degree_title, q.institution_name, q.subject_area].filter(Boolean);
        lines.push(`    - ${parts.join(", ")}${q.grade_value ? ` (${q.grading_system}: ${q.grade_value})` : ""}`);
      }
    }

    if (opts.profile.language_tests.length) {
      lines.push("  Language Tests:");
      for (const t of opts.profile.language_tests) {
        lines.push(`    - ${t.test_type ?? "Unknown"}: ${t.overall_score ?? "N/A"}`);
      }
    }

    if (opts.profile.work_experiences.length) {
      lines.push("  Work Experience:");
      for (const w of opts.profile.work_experiences) {
        lines.push(`    - ${w.job_title}${w.organization_name ? ` at ${w.organization_name}` : ""}`);
      }
    }

    if (p.preferred_destinations) lines.push(`  Preferred Destinations: ${JSON.stringify(p.preferred_destinations)}`);
    if (p.budget_min != null || p.budget_max != null) {
      lines.push(`  Budget: ${p.budget_currency ?? ""} ${p.budget_min ?? "?"} – ${p.budget_max ?? "?"}`);
    }
    if (p.expected_start_date) lines.push(`  Expected Start: ${p.expected_start_date}`);

    lines.push("NEVER ask the student for data already in the profile. Greet by first name on first turn.");
    sections.push(lines.join("\n"));
  }

  // ── Response rules ──
  sections.push(
    "Keep responses SHORT: 3-5 sentences for conversational replies. " +
    "Use markdown. Be warm, professional, encouraging.",
  );

  // ── Course card format ──
  sections.push(
    "When you find matching courses in CONTEXT, emit them in this format:\n" +
    "```course-card\n" +
    '{"id":"<id>","slug":"<slug>","name":"<name>","institution":"<institution>","degree_level":"<level>",' +
    '"duration":"<duration>","fees":<amount>,"currency":"<currency>",' +
    '"country":"<country>","city":"<city>","intakes":["<intake>"],' +
    '"study_modes":["<mode>"],"source_url":"<url>"}\n' +
    "```\n" +
    "ONLY emit course-card when matching data is present in CONTEXT. " +
    "Copy fields VERBATIM from CONTEXT — never invent.",
  );

  // ── Chips ──
  sections.push(
    "After every response, suggest 2-4 follow-up questions in this format:\n" +
    '```chips\n["question1", "question2"]\n```',
  );

  // ── RAG context ──
  if (opts.ragContext) {
    sections.push("CONTEXT:\n" + opts.ragContext);
  }

  // ── First message greeting ──
  if (opts.isFirstMessage) {
    sections.push(
      "This is the first message in the conversation. Greet the student warmly and offer to help with their education journey.",
    );
  }

  return sections.join("\n\n");
}
