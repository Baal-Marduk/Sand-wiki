-- AlterTable
ALTER TABLE "EnvEntity" DROP COLUMN "iconFile",
ADD COLUMN     "iconFile" UUID;

-- AlterTable
ALTER TABLE "Item" DROP COLUMN "iconFile",
ADD COLUMN     "iconFile" UUID;

-- AlterTable
ALTER TABLE "TramplerPart" DROP COLUMN "iconFile",
ADD COLUMN     "iconFile" UUID;

