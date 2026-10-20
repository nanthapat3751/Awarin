-- AlterTable
ALTER TABLE "BoqTakeoffRow" ADD COLUMN     "memberKey" TEXT;

-- CreateTable
CREATE TABLE "StructuralMember" (
    "id" TEXT NOT NULL,
    "projectVersionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "input" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StructuralMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StructuralMember_projectVersionId_key_key" ON "StructuralMember"("projectVersionId", "key");

-- AddForeignKey
ALTER TABLE "StructuralMember" ADD CONSTRAINT "StructuralMember_projectVersionId_fkey" FOREIGN KEY ("projectVersionId") REFERENCES "ProjectVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
