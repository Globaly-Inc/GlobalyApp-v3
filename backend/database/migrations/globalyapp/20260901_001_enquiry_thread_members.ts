import type { Knex } from "knex";

/**
 * Per-thread membership for enquiry conversations — the Space model from GlobalyOS-V2's
 * `chat_space_members`, applied to the thread a business gets for unlocking a lead.
 *
 * There is no conversations table in this system: the thread IS the distribution, so this hangs
 * off `enquiry_distributions` rather than introducing a parent. Keyed on
 * (distribution_id, platform_user_id) and nothing else, which makes it recipient-agnostic — the
 * same rows work whether the recipient is a business or, via the institution fallback, an
 * institution.
 *
 * The STUDENT is deliberately not a row here. Their membership is `enquiries.student_id` and
 * always has been; copying it in would give one fact two sources of truth that could disagree.
 *
 * `source` is lifted from chat_space_members: 'auto' rows are placed by the system (the owner who
 * administers the thread, the agent who paid for it) and cannot be removed; 'manual' rows are
 * people an admin invited and can uninvite.
 *
 * Before this, any agent holding `enquiries:respond` could read every thread their business had
 * unlocked. The backfill preserves that for nobody except the owner and the unlocker — see the
 * note on it below, because it is a visible change for teams who share leads.
 */
export async function up(knex: Knex): Promise<void> {
  if (await knex.schema.hasTable("enquiry_thread_members")) return;

  await knex.schema.createTable("enquiry_thread_members", (t) => {
    t.increments("id").primary();
    t.uuid("distribution_id")
      .notNullable()
      .references("id")
      .inTable("enquiry_distributions")
      .onDelete("CASCADE");
    t.integer("platform_user_id")
      .unsigned()
      .notNullable()
      .references("id")
      .inTable("platform_users")
      .onDelete("CASCADE");
    t.text("role").notNullable().defaultTo("member");
    t.text("source").notNullable().defaultTo("auto");
    t.timestamps(true, true);

    t.unique(["distribution_id", "platform_user_id"]);
    // "which threads am I on" — the chat inbox's join, run on every listing.
    t.index(["platform_user_id"], "enquiry_thread_members_user_idx");
  });

  await knex.raw(`
    ALTER TABLE enquiry_thread_members
      ADD CONSTRAINT enquiry_thread_members_role_chk CHECK (role IN ('admin','member')),
      ADD CONSTRAINT enquiry_thread_members_source_chk CHECK (source IN ('auto','manual'))
  `);

  // ── Backfill ──
  //
  // Every already-unlocked thread gets the same two rows a new unlock will now create: the
  // recipient's owner as admin, and whoever spent the credits as a member. Both 'auto'.
  //
  // Agents who are neither lose access on deploy. That is the point of the feature, but it is
  // retroactive here, so the counts are printed rather than left silent.
  const owners = await knex.raw(`
    INSERT INTO enquiry_thread_members (distribution_id, platform_user_id, role, source)
    SELECT d.id, COALESCE(b.owner_id, i.platform_user_id), 'admin', 'auto'
      FROM enquiry_distributions d
      LEFT JOIN businesses    b ON b.id = d.business_id
      LEFT JOIN institutions  i ON i.id = d.institution_id
     WHERE d.unlocked_at IS NOT NULL
       AND d.deleted_at IS NULL
       AND COALESCE(b.owner_id, i.platform_user_id) IS NOT NULL
    ON CONFLICT (distribution_id, platform_user_id) DO NOTHING
  `);

  // Second, so an owner who also did the unlocking keeps 'admin' — ON CONFLICT leaves the
  // existing row alone rather than demoting them to 'member'.
  const unlockers = await knex.raw(`
    INSERT INTO enquiry_thread_members (distribution_id, platform_user_id, role, source)
    SELECT d.id, d.unlocked_by, 'member', 'auto'
      FROM enquiry_distributions d
     WHERE d.unlocked_at IS NOT NULL
       AND d.deleted_at IS NULL
       AND d.unlocked_by IS NOT NULL
    ON CONFLICT (distribution_id, platform_user_id) DO NOTHING
  `);

  // eslint-disable-next-line no-console
  console.log(
    `[20260901_001] seeded ${owners.rowCount ?? 0} thread admins and ${unlockers.rowCount ?? 0} unlockers. ` +
      `Any other agent who was reading these threads must now be added by the owner.`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("enquiry_thread_members");
}
