-- AlterTable
ALTER TABLE "ItemStats" ADD COLUMN     "armorDurability" INTEGER,
ADD COLUMN     "armorRating" INTEGER,
ADD COLUMN     "armorRegenDelay" DOUBLE PRECISION,
ADD COLUMN     "armorRegenSpeed" DOUBLE PRECISION,
ADD COLUMN     "penetrates" BOOLEAN,
ADD COLUMN     "rangeFalloff" BOOLEAN,
ADD COLUMN     "rangeFull" DOUBLE PRECISION,
ADD COLUMN     "rangeMax" DOUBLE PRECISION,
ADD COLUMN     "rangeMinMult" DOUBLE PRECISION,
ADD COLUMN     "reloadSeconds" DOUBLE PRECISION;
