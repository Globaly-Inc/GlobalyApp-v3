-- Columns the app selects that your local DB is missing, from the two 500s in the log.
-- Both were added to migrations that had ALREADY run locally, so knex skips them.
-- Definitions copied verbatim from the migrations, so this matches a fresh install.

-- 20260803_001_platform_users.ts:14  →  t.text("cover_url").nullable()
ALTER TABLE public.platform_users ADD COLUMN IF NOT EXISTS cover_url text;

-- 20260722_001_countries.ts:14 + :48  →  t.text("slug").nullable() + t.unique(["slug"])
ALTER TABLE public.countries ADD COLUMN IF NOT EXISTS slug text;
CREATE UNIQUE INDEX IF NOT EXISTS countries_slug_unique ON public.countries (slug);
