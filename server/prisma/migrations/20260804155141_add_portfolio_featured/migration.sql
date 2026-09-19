-- AlterTable
ALTER TABLE "Portfolio" ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "featuredOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Portfolio_featured_featuredOrder_idx" ON "Portfolio"("featured", "featuredOrder");
