-- DropIndex
DROP INDEX "Design_status_likeCount_idx";

-- DropIndex
DROP INDEX "Design_status_createdAt_idx";

-- AlterTable
ALTER TABLE "Design" DROP COLUMN "status";

-- CreateIndex
CREATE INDEX "Design_likeCount_idx" ON "Design"("likeCount");

-- CreateIndex
CREATE INDEX "Design_createdAt_idx" ON "Design"("createdAt");
