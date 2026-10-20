-- รองรับ API หลายตัวหลัง load balancer: ตัวนับ rate limit ร่วม + ใบจองรอบงานตามเวลา
--
-- ตารางใหม่ทั้งหมด ไม่แตะข้อมูลเดิม · ได้สิทธิ์ boq_app อัตโนมัติจาก ALTER DEFAULT PRIVILEGES
-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ScheduledRun" (
    "key" TEXT NOT NULL,
    "claimedBy" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduledRun_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "RateLimitBucket_resetAt_idx" ON "RateLimitBucket"("resetAt");
