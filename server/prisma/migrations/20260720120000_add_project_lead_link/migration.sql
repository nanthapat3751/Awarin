ALTER TABLE "Project" ADD COLUMN "leadId" TEXT;

CREATE UNIQUE INDEX "Project_leadId_key" ON "Project"("leadId");

ALTER TABLE "Project" ADD CONSTRAINT "Project_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
