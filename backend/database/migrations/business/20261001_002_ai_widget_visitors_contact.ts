import type { Knex } from "knex";

// What we know about a visitor beyond the four typed profile columns: contact details they
// VOLUNTEER in conversation, and a bag for details the server observed.
//
// Four changes, one reason: until now the only writer of name/email was the contact card, so
// "I'm John, send it to john@example.com" left the visitor filed as an anonymous Visitor with
// the card still queued to interrupt them three messages later.
//
//   phone           a new field, off by default in the Rack's collection rules
//   contact_source  'card' | 'volunteered' — how we came to hold these details
//   meta            server-observed details with no column of their own (see the contract below)
//   the pair CHECK  dropped
//
// Dropping chk_ai_widget_visitors_contact_pair is the load-bearing change and it reverses a
// deliberate earlier decision, so the reasoning matters. That constraint said "half a contact is
// not a lesser contact, it is a bug that got this far", and for the CARD that is exactly right —
// the form asks for both, so one without the other means something upstream broke. Volunteered
// details are the opposite case: a visitor who says "I'm John" and nothing else has genuinely
// given us a name and no address, and refusing to store it loses a real answer to protect an
// invariant that only ever described the form.
//
// What the constraint was protecting still holds, enforced where it belongs instead:
//   - `status` is GENERATED from `email IS NULL`, so a name alone keeps them a Visitor, not a Lead.
//   - the summary email needs an address, so visitor.service arms summary_status only when one
//     exists — previously implied by the constraint, now stated.
//   - UpdateVisitorSchema's two "name and email move together" refines are gone with it; they
//     cited this constraint by name and would otherwise have refused to add an email to a
//     name-only row. The CARD's own both-required refine stays, on the product reason.
//
// ── The meta contract ────────────────────────────────────────────────────────────────────────
// WHAT BELONGS IN meta: facts the SERVER observed. Where the widget was embedded, the referrer,
// campaign parameters, locale, device, which widget version answered — things we know because of
// how the request arrived, not because of anything anyone said.
//
// WHAT MUST NEVER GO IN IT: anything a MODEL produced, and anything lifted out of the
// conversation. That is not a style preference, it is a repeat. institution_ai_memories.metadata
// took a COUNSELLOR_CORRECTION.original_excerpt field in September; it was deleted on 2026-09-29
// because metadata gets a SHAPE check that inspects no text, and reads hand it back to the portal
// verbatim. The same hole is available here and it is wider: ai_widget_visitors is the visitor
// table, so the text a model would park in it is by definition a named stranger's own words. The
// four jsonb profile columns already here exist precisely so model output has a typed home with a
// cleaner (lib/card-parser.cleanProfile) in front of it, and `content` is the only thing the PII
// filters ever look at.
//
// So: one writer, visitor.service.recordMeta, called from request-handling code with values the
// request itself carried. If a future change wants the extractor to write here, that is a new
// typed column with a cleaner, not a key in this object.
//
// Twin of institution/20261001_002 — same columns, different schema.
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("ai_widget_visitors", (t) => {
    t.text("phone").nullable();
    t.text("contact_source").nullable();
    // NOT NULL DEFAULT '{}' rather than nullable: every reader then gets an object without a
    // null check, and "we observed nothing" and "we never looked" are not a distinction anyone
    // here needs — unlike the profile columns, where it is the whole point of the null.
    t.jsonb("meta").notNullable().defaultTo("{}");
  });

  await knex.raw(`ALTER TABLE ai_widget_visitors DROP CONSTRAINT IF EXISTS chk_ai_widget_visitors_contact_pair`);

  await knex.raw(`
    ALTER TABLE ai_widget_visitors
      ADD CONSTRAINT chk_ai_widget_visitors_contact_source
      CHECK (contact_source IS NULL OR contact_source IN ('card','volunteered'))
  `);

  // jsonb_typeof = 'object' for the same reason the profile columns check for 'array': the
  // writer merges with `meta || ?::jsonb`, and a scalar slipping in would make every later merge
  // throw mid-conversation. Postgres is the only place that can hold that line.
  await knex.raw(`
    ALTER TABLE ai_widget_visitors
      ADD CONSTRAINT chk_ai_widget_visitors_meta_object
      CHECK (jsonb_typeof(meta) = 'object')
  `);

  // Every row that already holds details got them from the card — that was the only writer.
  await knex("ai_widget_visitors").whereNotNull("email").update({ contact_source: "card" });
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TABLE ai_widget_visitors DROP CONSTRAINT IF EXISTS chk_ai_widget_visitors_meta_object`);
  await knex.raw(`ALTER TABLE ai_widget_visitors DROP CONSTRAINT IF EXISTS chk_ai_widget_visitors_contact_source`);
  // Restoring the pair constraint would fail against any half contact this feature stored, so
  // clear those first — they are unmailable and ungreetable by the old rule's own definition.
  await knex("ai_widget_visitors").whereNull("email").whereNotNull("name").update({ name: null });
  await knex("ai_widget_visitors").whereNull("name").whereNotNull("email").update({ email: null });
  await knex.raw(`
    ALTER TABLE ai_widget_visitors
      ADD CONSTRAINT chk_ai_widget_visitors_contact_pair
      CHECK ((name IS NULL) = (email IS NULL))
  `);
  await knex.schema.alterTable("ai_widget_visitors", (t) => {
    t.dropColumn("meta");
    t.dropColumn("contact_source");
    t.dropColumn("phone");
  });
}
