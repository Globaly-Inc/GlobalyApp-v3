-- Repoints knex's migration log at the renumbered enquiry migration files.
--
-- The five enquiry migrations were renamed on disk (001/002/003/004/008 -> 016..020)
-- AFTER they had already run here. knex records a migration by filename, so it now
-- sees five completed migrations whose files are gone and refuses to do anything:
--   "The migration directory is corrupt, the following files are missing: ..."
--
-- That block is why the 16 pending migrations never ran. The tables themselves are
-- fine and already migrated — only the recorded names are stale, so this renames
-- them rather than re-running anything.
--
-- Idempotent: each UPDATE is a no-op if already done.

BEGIN;


UPDATE knex_migrations_globalyapp SET name = '20260811_016_representations.ts'
 WHERE name = '20260811_001_representations.ts'
   AND NOT EXISTS (SELECT 1 FROM knex_migrations_globalyapp WHERE name = '20260811_016_representations.ts');

UPDATE knex_migrations_globalyapp SET name = '20260811_017_enquiry_match_directory.ts'
 WHERE name = '20260811_002_enquiry_match_directory.ts'
   AND NOT EXISTS (SELECT 1 FROM knex_migrations_globalyapp WHERE name = '20260811_017_enquiry_match_directory.ts');

UPDATE knex_migrations_globalyapp SET name = '20260811_018_enquiries.ts'
 WHERE name = '20260811_003_enquiries.ts'
   AND NOT EXISTS (SELECT 1 FROM knex_migrations_globalyapp WHERE name = '20260811_018_enquiries.ts');

UPDATE knex_migrations_globalyapp SET name = '20260811_019_enquiry_distributions.ts'
 WHERE name = '20260811_004_enquiry_distributions.ts'
   AND NOT EXISTS (SELECT 1 FROM knex_migrations_globalyapp WHERE name = '20260811_019_enquiry_distributions.ts');

UPDATE knex_migrations_globalyapp SET name = '20260811_020_enquiry_email_queue.ts'
 WHERE name = '20260811_008_enquiry_email_queue.ts'
   AND NOT EXISTS (SELECT 1 FROM knex_migrations_globalyapp WHERE name = '20260811_020_enquiry_email_queue.ts');


-- Anything still recorded but absent from disk would block knex again; expect 0 rows.
SELECT name AS still_missing_from_disk
  FROM knex_migrations_globalyapp
 WHERE name LIKE '20260811_00%';

SELECT name, batch FROM knex_migrations_globalyapp WHERE name LIKE '20260811%' ORDER BY name;

COMMIT;
