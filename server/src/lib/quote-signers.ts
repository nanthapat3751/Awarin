import type { QuotePdfSigner } from "./pdf/company-blocks";
import { prisma } from "./prisma";
import { signatureDataUrl } from "./signature-image";

/** คนเซ็นที่ตรึงลงใบนี้ พร้อมรูปลายเซ็นเป็น data URI สำหรับฝังใน PDF (ทั้งฉบับพนักงานและฉบับลูกค้า) */
export async function loadQuotePdfSigners(quoteId: string): Promise<QuotePdfSigner[]> {
  const rows = await prisma.quoteSigner.findMany({ where: { quoteId } });
  return rows.map((r) => ({
    role: r.role,
    name: r.name,
    title: r.title,
    phone: r.phone,
    signatureDataUrl: signatureDataUrl(r.signaturePng),
    signedAt: r.signedAt,
  }));
}
