-- Give every primary key a database-side default.
--
-- Previously `id` was `@default(cuid())`, which Prisma generates in the app at
-- INSERT time. The column itself had no DEFAULT, so rows inserted outside Prisma
-- (e.g. created in the Directus Studio) had no id and either failed the NOT NULL
-- constraint or required a hand-typed key. `gen_random_uuid()` (Postgres core,
-- no extension needed) now fills it for every writer; Prisma omits `id` on create
-- and lets the DB generate it. Existing cuid ids are untouched.
ALTER TABLE "Item"             ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "EnvEntity"        ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "TramplerPart"     ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "Recipe"           ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "RecipeInput"      ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "RecipeOutput"     ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "LootTier"         ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "LootEntry"        ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
ALTER TABLE "TramplerPartCost" ALTER COLUMN "id" SET DEFAULT gen_random_uuid()::text;
