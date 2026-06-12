-- AlterTable
ALTER TABLE "EnvEntity" ADD COLUMN     "lootCurated" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "LootEntry" ADD COLUMN     "containerId" TEXT;

-- CreateIndex
CREATE INDEX "LootEntry_containerId_idx" ON "LootEntry"("containerId");

-- AddForeignKey
ALTER TABLE "LootEntry" ADD CONSTRAINT "LootEntry_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "EnvEntity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
