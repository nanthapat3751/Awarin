-- ความคืบหน้างาน (S-curve): แผนเวลารายหมวด + รอบบันทึก % สะสมรายบรรทัด BOQ
--
-- ตารางใหม่ทั้งหมด ไม่แตะข้อมูลเดิม · ได้สิทธิ์ boq_app อัตโนมัติจาก ALTER DEFAULT PRIVILEGES
-- CreateTable
CREATE TABLE "ProjectScheduleItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "startOn" DATE NOT NULL,
    "endOn" DATE NOT NULL,

    CONSTRAINT "ProjectScheduleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressReport" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "reportDate" DATE NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgressReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressEntry" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "boqItemId" TEXT NOT NULL,
    "pct" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "ProgressEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectScheduleItem_projectId_categoryId_key" ON "ProjectScheduleItem"("projectId", "categoryId");

-- CreateIndex
CREATE INDEX "ProgressReport_versionId_idx" ON "ProgressReport"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressReport_projectId_reportDate_key" ON "ProgressReport"("projectId", "reportDate");

-- CreateIndex
CREATE INDEX "ProgressEntry_boqItemId_idx" ON "ProgressEntry"("boqItemId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressEntry_reportId_boqItemId_key" ON "ProgressEntry"("reportId", "boqItemId");

-- AddForeignKey
ALTER TABLE "ProjectScheduleItem" ADD CONSTRAINT "ProjectScheduleItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectScheduleItem" ADD CONSTRAINT "ProjectScheduleItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "WorkCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressReport" ADD CONSTRAINT "ProgressReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressReport" ADD CONSTRAINT "ProgressReport_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "ProjectVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressReport" ADD CONSTRAINT "ProgressReport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressEntry" ADD CONSTRAINT "ProgressEntry_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ProgressReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgressEntry" ADD CONSTRAINT "ProgressEntry_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "BoqItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
