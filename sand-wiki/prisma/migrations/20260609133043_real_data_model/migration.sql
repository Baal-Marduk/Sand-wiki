/*
  Warnings:

  - You are about to drop the column `craftTimeSeconds` on the `Item` table. All the data in the column will be lost.
  - You are about to drop the column `unlockConditions` on the `Item` table. All the data in the column will be lost.
  - You are about to drop the column `unlockedById` on the `Item` table. All the data in the column will be lost.
  - You are about to drop the column `workbenchLevel` on the `Item` table. All the data in the column will be lost.
  - You are about to drop the `RecipeIngredient` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TechCost` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TechNode` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TechPrerequisite` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Item" DROP CONSTRAINT "Item_unlockedById_fkey";

-- DropForeignKey
ALTER TABLE "RecipeIngredient" DROP CONSTRAINT "RecipeIngredient_ingredientId_fkey";

-- DropForeignKey
ALTER TABLE "RecipeIngredient" DROP CONSTRAINT "RecipeIngredient_itemId_fkey";

-- DropForeignKey
ALTER TABLE "TechCost" DROP CONSTRAINT "TechCost_resourceId_fkey";

-- DropForeignKey
ALTER TABLE "TechCost" DROP CONSTRAINT "TechCost_techNodeId_fkey";

-- DropForeignKey
ALTER TABLE "TechPrerequisite" DROP CONSTRAINT "TechPrerequisite_nodeId_fkey";

-- DropForeignKey
ALTER TABLE "TechPrerequisite" DROP CONSTRAINT "TechPrerequisite_prerequisiteId_fkey";

-- DropIndex
DROP INDEX "Item_workbenchLevel_idx";

-- AlterTable
ALTER TABLE "Item" DROP COLUMN "craftTimeSeconds",
DROP COLUMN "unlockConditions",
DROP COLUMN "unlockedById",
DROP COLUMN "workbenchLevel",
ADD COLUMN     "storageStack" INTEGER,
ADD COLUMN     "workbenchTier" INTEGER;

-- DropTable
DROP TABLE "RecipeIngredient";

-- DropTable
DROP TABLE "TechCost";

-- DropTable
DROP TABLE "TechNode";

-- DropTable
DROP TABLE "TechPrerequisite";

-- CreateTable
CREATE TABLE "Recipe" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "workbench" TEXT,
    "tier" INTEGER,
    "craftTimeSeconds" DOUBLE PRECISION,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeInput" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "RecipeInput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeOutput" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "RecipeOutput_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_slug_key" ON "Recipe"("slug");

-- CreateIndex
CREATE INDEX "RecipeInput_itemId_idx" ON "RecipeInput"("itemId");

-- CreateIndex
CREATE INDEX "RecipeInput_recipeId_idx" ON "RecipeInput"("recipeId");

-- CreateIndex
CREATE INDEX "RecipeOutput_itemId_idx" ON "RecipeOutput"("itemId");

-- CreateIndex
CREATE INDEX "RecipeOutput_recipeId_idx" ON "RecipeOutput"("recipeId");

-- CreateIndex
CREATE INDEX "Item_workbenchTier_idx" ON "Item"("workbenchTier");

-- AddForeignKey
ALTER TABLE "RecipeInput" ADD CONSTRAINT "RecipeInput_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeInput" ADD CONSTRAINT "RecipeInput_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeOutput" ADD CONSTRAINT "RecipeOutput_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeOutput" ADD CONSTRAINT "RecipeOutput_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;
