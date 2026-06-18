-- AlterTable
ALTER TABLE "Entity" ADD COLUMN     "curated" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Recipe" ADD COLUMN     "locationId" TEXT;

-- CreateIndex
CREATE INDEX "Recipe_locationId_idx" ON "Recipe"("locationId");

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Entity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
