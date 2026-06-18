-- CreateTable
CREATE TABLE "EnvEntity" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sourceUrl" TEXT,
    "icon" TEXT,

    CONSTRAINT "EnvEntity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EnvEntity_slug_key" ON "EnvEntity"("slug");

-- CreateIndex
CREATE INDEX "EnvEntity_category_idx" ON "EnvEntity"("category");
