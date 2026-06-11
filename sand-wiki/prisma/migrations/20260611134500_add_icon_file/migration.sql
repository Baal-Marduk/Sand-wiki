-- DropForeignKey
ALTER TABLE "RecipeInput" DROP CONSTRAINT "RecipeInput_recipeId_fkey";

-- DropForeignKey
ALTER TABLE "RecipeOutput" DROP CONSTRAINT "RecipeOutput_recipeId_fkey";

-- AlterTable
ALTER TABLE "EnvEntity" ADD COLUMN     "iconFile" TEXT;

-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "iconFile" TEXT;

-- AlterTable
ALTER TABLE "TramplerPart" ADD COLUMN     "iconFile" TEXT;

-- AddForeignKey
ALTER TABLE "RecipeInput" ADD CONSTRAINT "RecipeInput_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeOutput" ADD CONSTRAINT "RecipeOutput_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

