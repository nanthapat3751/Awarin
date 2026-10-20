import type { SlipProvider, SlipReadResult } from "./provider";

/**
 * ตัวอ่านจำลองสำหรับเครื่องนักพัฒนา (SLIP_PROVIDER=mock) — ลองหน้าจอได้โดยไม่ต้องมีบัญชี SlipOK
 *
 * อ่านผลจากชื่อไฟล์: `mockslip_<ยอด>_<เลขอ้างอิง>[_<YYYYMMDD>][_<เลขบัญชีปลายทาง>].png`
 * เช่น mockslip_473423.02_REF001_20261018_7260851635.png · `mockslip_fake.png` = ธนาคารไม่พบรายการ
 * ชื่ออื่น = ตรวจไม่ได้ · ห้ามใช้บนเครื่องจริง (ใครตั้งชื่อไฟล์เองก็ผ่านได้)
 */
export const mockSlipProvider: SlipProvider = {
  name: "mock",
  async read(file): Promise<SlipReadResult> {
    const base = file.originalname.replace(/\.[a-z0-9]+$/i, "");
    if (base === "mockslip_fake") return { kind: "fake", message: "จำลอง: ธนาคารไม่พบรายการนี้" };
    const m = /^mockslip_(\d+(?:\.\d{1,2})?)_([A-Za-z0-9]+)(?:_(\d{8}))?(?:_(\d{6,15}))?$/.exec(base);
    if (!m) return { kind: "unreadable", message: "จำลอง: ไม่พบ QR บนสลิป" };
    const [, amount, ref, ymd, account] = m;
    const date = ymd ? `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}` : null;
    // ปิดบางหลักเหมือนผู้ให้บริการจริง: เห็นแค่สี่หลักท้ายก่อนหลักสุดท้าย
    const masked = account ? account.replace(/\d(?=\d{5})/g, "x").replace(/\d$/, "x") : null;
    return {
      kind: "ok",
      slip: {
        transRef: ref,
        amount: Number(amount),
        transDate: date,
        transferredAt: date ? new Date(`${date}T10:00:00+07:00`) : null,
        senderName: "นาย ทดสอบ จำลอง",
        senderBank: "004",
        receiverName: "Awarin Engineering",
        receiverAccount: masked,
        receiverProxy: null,
      },
    };
  },
};
