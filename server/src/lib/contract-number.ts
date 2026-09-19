import type { PrismaClient } from "@prisma/client";

import { nextDocumentSequence } from "./document-sequence";

/** CT-YYYY-NNNN เรียงลำดับภายในปีปฏิทิน (atomic — ดู document-sequence.ts) */
export async function generateContractNo(prisma: PrismaClient, year = new Date().getFullYear()): Promise<string> {
  const seq = await nextDocumentSequence(prisma, `CT-${year}`);
  return `CT-${year}-${String(seq).padStart(4, "0")}`;
}
