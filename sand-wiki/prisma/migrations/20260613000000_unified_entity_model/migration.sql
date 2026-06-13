-- 1. New tables -------------------------------------------------------------
CREATE TABLE "Entity" (
  "id"          TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "slug"        TEXT NOT NULL,
  "kind"        TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "category"    TEXT NOT NULL,
  "rarity"      TEXT,
  "icon"        TEXT,
  "iconFile"    UUID,
  "imageAlt"    TEXT,
  "derivedName" TEXT,
  "sourceUrl"   TEXT,
  "lootCurated" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "Entity_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Entity_slug_key" ON "Entity"("slug");
CREATE INDEX "Entity_kind_idx" ON "Entity"("kind");
CREATE INDEX "Entity_category_idx" ON "Entity"("category");
CREATE INDEX "Entity_rarity_idx" ON "Entity"("rarity");

CREATE TABLE "ItemStats" (
  "entityId"       TEXT NOT NULL,
  "storageStack"   INTEGER,
  "workbenchTier"  INTEGER,
  "statType"       TEXT,
  "statValue"      INTEGER,
  "damage"         INTEGER,
  "playerDamage"   INTEGER,
  "tramplerDamage" INTEGER,
  "splashDamage"   INTEGER,
  "magazine"       INTEGER,
  "ammoName"       TEXT,
  CONSTRAINT "ItemStats_pkey" PRIMARY KEY ("entityId")
);
CREATE INDEX "ItemStats_workbenchTier_idx" ON "ItemStats"("workbenchTier");

CREATE TABLE "TramplerStats" (
  "entityId"           TEXT NOT NULL,
  "dimensions"         TEXT,
  "health"             INTEGER,
  "weight"             INTEGER,
  "weightCapacity"     INTEGER,
  "weightCompensation" INTEGER,
  "energyConsumption"  INTEGER,
  "energyCapacity"     INTEGER,
  "ratedPower"         INTEGER,
  "crewSlots"          INTEGER,
  "itemSlots"          INTEGER,
  "researchNode"       TEXT,
  "researchName"       TEXT,
  "researchTier"       INTEGER,
  CONSTRAINT "TramplerStats_pkey" PRIMARY KEY ("entityId")
);
CREATE INDEX "TramplerStats_researchTier_idx" ON "TramplerStats"("researchTier");

CREATE TABLE "EntityLink" (
  "id"        TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
  "sourceId"  TEXT NOT NULL,
  "targetId"  TEXT,
  "role"      TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "amount"    INTEGER,
  "tier"      TEXT,
  "value1"    TEXT,
  "value2"    TEXT,
  "value3"    TEXT,
  "sortOrder" INTEGER NOT NULL,
  CONSTRAINT "EntityLink_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EntityLink_sourceId_role_idx" ON "EntityLink"("sourceId", "role");
CREATE INDEX "EntityLink_targetId_idx" ON "EntityLink"("targetId");

-- 2. Backfill Entity (REUSE original ids) ----------------------------------
INSERT INTO "Entity" ("id","slug","kind","name","description","category","rarity","icon","iconFile","imageAlt","derivedName","sourceUrl","lootCurated")
SELECT "id","slug",'item',"name","description","category","rarity","icon","iconFile","imageAlt","derivedName",NULL,false FROM "Item";

INSERT INTO "Entity" ("id","slug","kind","name","description","category","rarity","icon","iconFile","imageAlt","derivedName","sourceUrl","lootCurated")
SELECT "id","slug",'environment',"name","description","category",NULL,"icon","iconFile",NULL,NULL,"sourceUrl","lootCurated" FROM "EnvEntity";

INSERT INTO "Entity" ("id","slug","kind","name","description","category","rarity","icon","iconFile","imageAlt","derivedName","sourceUrl","lootCurated")
SELECT "id","slug",'trampler-part',"name","description","category",NULL,"icon","iconFile",NULL,NULL,"sourceUrl",false FROM "TramplerPart";

-- 3. Backfill stat extensions ----------------------------------------------
INSERT INTO "ItemStats" ("entityId","storageStack","workbenchTier","statType","statValue","damage","playerDamage","tramplerDamage","splashDamage","magazine","ammoName")
SELECT "id","storageStack","workbenchTier","statType","statValue","damage","playerDamage","tramplerDamage","splashDamage","magazine","ammoName" FROM "Item";

INSERT INTO "TramplerStats" ("entityId","dimensions","health","weight","weightCapacity","weightCompensation","energyConsumption","energyCapacity","ratedPower","crewSlots","itemSlots","researchNode","researchName","researchTier")
SELECT "id","dimensions","health","weight","weightCapacity","weightCompensation","energyConsumption","energyCapacity","ratedPower","crewSlots","itemSlots","researchNode","researchName","researchTier" FROM "TramplerPart";

-- 4. Fold TramplerPartCost -> EntityLink (role 'cost') ----------------------
INSERT INTO "EntityLink" ("sourceId","targetId","role","name","amount","sortOrder")
SELECT "partId","itemId",'cost',"name","amount","sortOrder" FROM "TramplerPartCost";

-- 5. Fold LootTier+LootEntry -> EntityLink (role 'loot') --------------------
INSERT INTO "EntityLink" ("sourceId","targetId","role","name","amount","tier","value1","value2","value3","sortOrder")
SELECT lt."envEntityId",
       COALESCE(le."itemId", le."containerId"),
       'loot',
       le."name",
       NULL,
       lt."tier",
       le."value1", le."value2", le."value3",
       (lt."sortOrder" * 1000 + le."sortOrder")
FROM "LootEntry" le
JOIN "LootTier" lt ON lt."id" = le."lootTierId";

-- 6. Repoint Recipe FKs from Item -> Entity (ids unchanged) -----------------
ALTER TABLE "RecipeInput"  DROP CONSTRAINT "RecipeInput_itemId_fkey";
ALTER TABLE "RecipeOutput" DROP CONSTRAINT "RecipeOutput_itemId_fkey";
ALTER TABLE "RecipeInput"  ADD CONSTRAINT "RecipeInput_itemId_fkey"  FOREIGN KEY ("itemId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecipeOutput" ADD CONSTRAINT "RecipeOutput_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 7. New FK constraints for stat + link tables ------------------------------
ALTER TABLE "ItemStats"     ADD CONSTRAINT "ItemStats_entityId_fkey"     FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TramplerStats" ADD CONSTRAINT "TramplerStats_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EntityLink"    ADD CONSTRAINT "EntityLink_sourceId_fkey"    FOREIGN KEY ("sourceId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EntityLink"    ADD CONSTRAINT "EntityLink_targetId_fkey"    FOREIGN KEY ("targetId") REFERENCES "Entity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 8. Drop old tables (order respects FKs) -----------------------------------
DROP TABLE "TramplerPartCost";
DROP TABLE "LootEntry";
DROP TABLE "LootTier";
DROP TABLE "Item";
DROP TABLE "EnvEntity";
DROP TABLE "TramplerPart";
