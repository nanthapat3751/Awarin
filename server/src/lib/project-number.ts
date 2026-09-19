import type { PrismaClient } from "@prisma/client";

import { nextDocumentSequence } from "./document-sequence";

/** BR-08: PRJ-YYYY-NNNN เรียงลำดับภายในปีปฏิทิน (atomic — ดู document-sequence.ts) */
export async function generateProjectNo(prisma: PrismaClient, year = new Date().getFullYear()): Promise<string> {
  const seq = await nextDocumentSequence(prisma, `PRJ-${year}`);
  return `PRJ-${year}-${String(seq).padStart(4, "0")}`;
}
