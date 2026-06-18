/*
  Warnings:

  - You are about to drop the column `type` on the `Item` table. All the data in the column will be lost.
  - Added the required column `category` to the `Item` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Item_type_idx";

-- AlterTable
ALTER TABLE "Item" DROP COLUMN "type",
ADD COLUMN     "category" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Item_category_idx" ON "Item"("category");
