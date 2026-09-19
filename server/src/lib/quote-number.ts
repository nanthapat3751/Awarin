import type { PrismaClient } from "@prisma/client";

import { nextDocumentSequence } from "./document-sequence";

/** QT-YYYY-NNNN เรียงลำดับภายในปีปฏิทิน (atomic — ดู document-sequence.ts) */
export async function generateQuoteNo(prisma: PrismaClient, year = new Date().getFullYear()): Promise<string> {
  const seq = await nextDocumentSequence(prisma, `QT-${year}`);
  return `QT-${year}-${String(seq).padStart(4, "0")}`;
}
