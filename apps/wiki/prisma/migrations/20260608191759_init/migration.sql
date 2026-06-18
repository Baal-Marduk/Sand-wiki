-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "workbenchLevel" INTEGER,
    "craftTimeSeconds" INTEGER,
    "unlockConditions" TEXT,
    "imageAlt" TEXT,
    "isResource" BOOLEAN NOT NULL DEFAULT false,
    "unlockedById" TEXT,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeIngredient" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "RecipeIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechNode" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "TechNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechCost" (
    "id" TEXT NOT NULL,
    "techNodeId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "TechCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechPrerequisite" (
    "id" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "prerequisiteId" TEXT NOT NULL,

    CONSTRAINT "TechPrerequisite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Item_slug_key" ON "Item"("slug");

-- CreateIndex
CREATE INDEX "Item_type_idx" ON "Item"("type");

-- CreateIndex
CREATE INDEX "Item_workbenchLevel_idx" ON "Item"("workbenchLevel");

-- CreateIndex
CREATE INDEX "RecipeIngredient_ingredientId_idx" ON "RecipeIngredient"("ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeIngredient_itemId_ingredientId_key" ON "RecipeIngredient"("itemId", "ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "TechNode_slug_key" ON "TechNode"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "TechCost_techNodeId_resourceId_key" ON "TechCost"("techNodeId", "resourceId");

-- CreateIndex
CREATE INDEX "TechPrerequisite_prerequisiteId_idx" ON "TechPrerequisite"("prerequisiteId");

-- CreateIndex
CREATE UNIQUE INDEX "TechPrerequisite_nodeId_prerequisiteId_key" ON "TechPrerequisite"("nodeId", "prerequisiteId");

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_unlockedById_fkey" FOREIGN KEY ("unlockedById") REFERENCES "TechNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechCost" ADD CONSTRAINT "TechCost_techNodeId_fkey" FOREIGN KEY ("techNodeId") REFERENCES "TechNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechCost" ADD CONSTRAINT "TechCost_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechPrerequisite" ADD CONSTRAINT "TechPrerequisite_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "TechNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechPrerequisite" ADD CONSTRAINT "TechPrerequisite_prerequisiteId_fkey" FOREIGN KEY ("prerequisiteId") REFERENCES "TechNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
