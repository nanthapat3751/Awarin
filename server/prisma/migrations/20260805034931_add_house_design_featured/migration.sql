-- AlterTable
ALTER TABLE "HouseDesign" ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "featuredOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "HouseDesign_featured_featuredOrder_idx" ON "HouseDesign"("featured", "featuredOrder");
