-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "ammoItemId" TEXT,
ADD COLUMN     "ammoName" TEXT,
ADD COLUMN     "damage" INTEGER,
ADD COLUMN     "magazine" INTEGER,
ADD COLUMN     "playerDamage" INTEGER,
ADD COLUMN     "splashDamage" INTEGER,
ADD COLUMN     "statType" TEXT,
ADD COLUMN     "statValue" INTEGER,
ADD COLUMN     "tramplerDamage" INTEGER;

-- CreateTable
CREATE TABLE "LootTier" (
    "id" TEXT NOT NULL,
    "envEntityId" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "col1Label" TEXT NOT NULL,
    "col2Label" TEXT,
    "col3Label" TEXT,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "LootTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LootEntry" (
    "id" TEXT NOT NULL,
    "lootTierId" TEXT NOT NULL,
    "itemId" TEXT,
    "name" TEXT NOT NULL,
    "value1" TEXT,
    "value2" TEXT,
    "value3" TEXT,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "LootEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TramplerPartCost" (
    "id" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "itemId" TEXT,
    "name" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "TramplerPartCost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LootTier_envEntityId_tier_key" ON "LootTier"("envEntityId", "tier");

-- CreateIndex
CREATE INDEX "LootEntry_lootTierId_idx" ON "LootEntry"("lootTierId");

-- CreateIndex
CREATE INDEX "LootEntry_itemId_idx" ON "LootEntry"("itemId");

-- CreateIndex
CREATE INDEX "TramplerPartCost_partId_idx" ON "TramplerPartCost"("partId");

-- CreateIndex
CREATE INDEX "TramplerPartCost_itemId_idx" ON "TramplerPartCost"("itemId");

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_ammoItemId_fkey" FOREIGN KEY ("ammoItemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LootTier" ADD CONSTRAINT "LootTier_envEntityId_fkey" FOREIGN KEY ("envEntityId") REFERENCES "EnvEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LootEntry" ADD CONSTRAINT "LootEntry_lootTierId_fkey" FOREIGN KEY ("lootTierId") REFERENCES "LootTier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LootEntry" ADD CONSTRAINT "LootEntry_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TramplerPartCost" ADD CONSTRAINT "TramplerPartCost_partId_fkey" FOREIGN KEY ("partId") REFERENCES "TramplerPart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TramplerPartCost" ADD CONSTRAINT "TramplerPartCost_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
