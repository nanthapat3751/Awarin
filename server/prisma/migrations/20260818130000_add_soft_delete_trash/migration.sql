-- ถังขยะ (Recycle Bin): soft-delete columns + index for Project/HouseDesign/Template/Portfolio/Material
-- deletedAt != NULL = อยู่ในถังขยะ (กรองออกจากทุก read); deletedById = ผู้ลบ

-- AlterTable
ALTER TABLE "HouseDesign" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT;

-- AlterTable
ALTER TABLE "Material" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT;

-- AlterTable
ALTER TABLE "Portfolio" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT;

-- AlterTable
ALTER TABLE "Template" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT;

-- CreateIndex
CREATE INDEX "HouseDesign_deletedAt_idx" ON "HouseDesign"("deletedAt");

-- CreateIndex
CREATE INDEX "Material_deletedAt_idx" ON "Material"("deletedAt");

-- CreateIndex
CREATE INDEX "Portfolio_deletedAt_idx" ON "Portfolio"("deletedAt");

-- CreateIndex
CREATE INDEX "Project_deletedAt_idx" ON "Project"("deletedAt");

-- CreateIndex
CREATE INDEX "Template_deletedAt_idx" ON "Template"("deletedAt");
