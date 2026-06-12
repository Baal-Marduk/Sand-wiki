-- CreateTable
CREATE TABLE "SteamUser" (
    "steamId" TEXT NOT NULL,
    "personaName" TEXT,
    "avatar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SteamUser_pkey" PRIMARY KEY ("steamId")
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "targetType" TEXT,
    "targetSlug" TEXT,
    "changes" JSONB,
    "note" TEXT,
    "proposedName" TEXT,
    "proposerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Proposal_status_idx" ON "Proposal"("status");

-- CreateIndex
CREATE INDEX "Proposal_targetType_targetSlug_idx" ON "Proposal"("targetType", "targetSlug");

-- CreateIndex
CREATE INDEX "Proposal_proposerId_idx" ON "Proposal"("proposerId");

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_proposerId_fkey" FOREIGN KEY ("proposerId") REFERENCES "SteamUser"("steamId") ON DELETE RESTRICT ON UPDATE CASCADE;
