import type { Knex } from "knex";

// Internal notes on a widget visitor — staff-to-staff, never shown to the visitor or the AI.
//
// Twin of business/20261002_001 — same table, different schema.
//
// Deliberately NOT a role on ai_counselor_messages: that table feeds the widget thread, the
// model's history, the summary email and the conclusion check, and a note there would be one
// forgotten filter away from reaching the visitor. Here it cannot.
//
// Keyed to the visitor, not the session, so notes survive the visitor starting a new chat.
// author_user_id is a platform_users id in globalyapp: no cross-schema FK; the name is a snapshot.
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE ai_widget_visitor_notes (
      id serial PRIMARY KEY,
      visitor_id integer NOT NULL REFERENCES ai_widget_visitors(id) ON DELETE CASCADE,
      author_user_id integer NOT NULL,
      author_name text NOT NULL,
      content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 4000),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_ai_widget_visitor_notes_visitor ON ai_widget_visitor_notes (visitor_id, created_at)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw("DROP TABLE IF EXISTS ai_widget_visitor_notes");
}
