-- CreateTable
CREATE TABLE "TramplerPart" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "sourceUrl" TEXT,
    "dimensions" TEXT,
    "health" INTEGER,
    "weight" INTEGER,
    "weightCapacity" INTEGER,
    "weightCompensation" INTEGER,
    "energyConsumption" INTEGER,
    "energyCapacity" INTEGER,
    "ratedPower" INTEGER,
    "crewSlots" INTEGER,
    "itemSlots" INTEGER,
    "researchNode" TEXT,
    "researchName" TEXT,
    "researchTier" INTEGER,
    "cost" JSONB,

    CONSTRAINT "TramplerPart_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TramplerPart_slug_key" ON "TramplerPart"("slug");

-- CreateIndex
CREATE INDEX "TramplerPart_category_idx" ON "TramplerPart"("category");

-- CreateIndex
CREATE INDEX "TramplerPart_researchTier_idx" ON "TramplerPart"("researchTier");
