/*
  Warnings:

  - You are about to drop the column `unitPrice` on the `BoqItem` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `Material` table. All the data in the column will be lost.
  - You are about to drop the column `unitPrice` on the `Material` table. All the data in the column will be lost.
  - Added the required column `laborTotal` to the `BoqItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `laborUnitPrice` to the `BoqItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `materialTotal` to the `BoqItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `materialUnitPrice` to the `BoqItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `BoqItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `materialUnitPrice` to the `Material` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "BoqItem" DROP CONSTRAINT "BoqItem_materialId_fkey";

-- AlterTable
ALTER TABLE "BoqItem" DROP COLUMN "unitPrice",
ADD COLUMN     "laborTotal" DECIMAL(14,2) NOT NULL,
ADD COLUMN     "laborUnitPrice" DECIMAL(14,2) NOT NULL,
ADD COLUMN     "materialTotal" DECIMAL(14,2) NOT NULL,
ADD COLUMN     "materialUnitPrice" DECIMAL(14,2) NOT NULL,
ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "note" TEXT,
ALTER COLUMN "materialId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Material" DROP COLUMN "type",
DROP COLUMN "unitPrice",
ADD COLUMN     "laborUnitPrice" DECIMAL(14,2) NOT NULL DEFAULT 0,
ADD COLUMN     "materialUnitPrice" DECIMAL(14,2) NOT NULL;

-- DropEnum
DROP TYPE "MaterialType";

-- AddForeignKey
ALTER TABLE "BoqItem" ADD CONSTRAINT "BoqItem_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;
