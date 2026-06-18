-- CreateTable
CREATE TABLE "TechNodeStats" (
    "entityId" TEXT NOT NULL,
    "faction" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "researchCost" INTEGER,
    "sortOrder" INTEGER,

    CONSTRAINT "TechNodeStats_pkey" PRIMARY KEY ("entityId")
);

-- CreateIndex
CREATE INDEX "TechNodeStats_faction_idx" ON "TechNodeStats"("faction");

-- CreateIndex
CREATE INDEX "TechNodeStats_tier_idx" ON "TechNodeStats"("tier");

-- AddForeignKey
ALTER TABLE "TechNodeStats" ADD CONSTRAINT "TechNodeStats_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
