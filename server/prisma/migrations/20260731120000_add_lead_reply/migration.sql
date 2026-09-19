-- Staff reply to a customer lead/inquiry, shown back to the customer in "คำขอของฉัน".
ALTER TABLE "Lead" ADD COLUMN "reply" TEXT;
ALTER TABLE "Lead" ADD COLUMN "repliedAt" TIMESTAMP(3);
