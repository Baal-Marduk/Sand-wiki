-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "rarity" TEXT,
ADD COLUMN     "stats" JSONB;

-- CreateIndex
CREATE INDEX "Item_rarity_idx" ON "Item"("rarity");
