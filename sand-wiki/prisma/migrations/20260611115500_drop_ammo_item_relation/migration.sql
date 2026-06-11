-- DropForeignKey
ALTER TABLE "Item" DROP CONSTRAINT "Item_ammoItemId_fkey";

-- DropIndex
DROP INDEX "Item_ammoItemId_idx";

-- AlterTable
ALTER TABLE "Item" DROP COLUMN "ammoItemId";

