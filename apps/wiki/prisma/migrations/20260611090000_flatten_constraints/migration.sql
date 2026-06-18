-- DropIndex (replaced by unique constraint with leading lootTierId column)
DROP INDEX "LootEntry_lootTierId_idx";

-- DropIndex (replaced by unique constraint with leading partId column)
DROP INDEX "TramplerPartCost_partId_idx";

-- CreateIndex (unique guard: no duplicate sortOrder within a loot tier)
CREATE UNIQUE INDEX "LootEntry_lootTierId_sortOrder_key" ON "LootEntry"("lootTierId", "sortOrder");

-- CreateIndex (unique guard: no duplicate sortOrder within a trampler part cost list)
CREATE UNIQUE INDEX "TramplerPartCost_partId_sortOrder_key" ON "TramplerPartCost"("partId", "sortOrder");

-- CreateIndex (reverse-lookup: find weapons that use a given ammo item)
CREATE INDEX "Item_ammoItemId_idx" ON "Item"("ammoItemId");
