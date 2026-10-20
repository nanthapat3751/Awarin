/**
 * % เงินประกันผลงานถูกตั้ง (ครั้งล่าสุด) หลังวันลงนาม = ไม่ได้อยู่ในสัญญาที่คู่สัญญาเซ็น
 *
 * OWNER เติมให้สัญญาเก่าได้เมื่อสัญญากระดาษมีข้อนี้จริง แต่สัญญา PDF ต้องพิมพ์เหมือนวันเซ็น
 * จึงไม่พิมพ์ข้อนี้ย้อนเข้าไป (ถ้อยคำในฉบับกระดาษคือหลักฐาน ไม่ใช่ PDF ที่ระบบพิมพ์ใหม่)
 */
export function retentionSetAfterSigning(contract: {
  signedAt: Date | null;
  retentionSetAt: Date | null;
}): boolean {
  return contract.signedAt != null && contract.retentionSetAt != null && contract.retentionSetAt > contract.signedAt;
}
