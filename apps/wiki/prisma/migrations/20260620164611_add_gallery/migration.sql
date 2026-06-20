-- CreateTable
CREATE TABLE "Design" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "buildCode" TEXT NOT NULL,
    "chassisId" TEXT NOT NULL,
    "partCount" INTEGER NOT NULL,
    "crowns" INTEGER NOT NULL,
    "hull" INTEGER NOT NULL,
    "thumbPath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'published',
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Design_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesignLike" (
    "designId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DesignLike_pkey" PRIMARY KEY ("designId","userId")
);

-- CreateTable
CREATE TABLE "DesignReport" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "designId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DesignReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Design_slug_key" ON "Design"("slug");

-- CreateIndex
CREATE INDEX "Design_status_likeCount_idx" ON "Design"("status", "likeCount");

-- CreateIndex
CREATE INDEX "Design_status_createdAt_idx" ON "Design"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Design_authorId_idx" ON "Design"("authorId");

-- CreateIndex
CREATE INDEX "DesignLike_userId_idx" ON "DesignLike"("userId");

-- CreateIndex
CREATE INDEX "DesignReport_designId_idx" ON "DesignReport"("designId");

-- AddForeignKey
ALTER TABLE "Design" ADD CONSTRAINT "Design_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "SteamUser"("steamId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignLike" ADD CONSTRAINT "DesignLike_designId_fkey" FOREIGN KEY ("designId") REFERENCES "Design"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignLike" ADD CONSTRAINT "DesignLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "SteamUser"("steamId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignReport" ADD CONSTRAINT "DesignReport_designId_fkey" FOREIGN KEY ("designId") REFERENCES "Design"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignReport" ADD CONSTRAINT "DesignReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "SteamUser"("steamId") ON DELETE CASCADE ON UPDATE CASCADE;
