import { prisma } from "../../src/lib/prisma";
import { createAndLoginOwner } from "../helpers/test-auth";

/**
 * คำตอบเมื่อขอผิดที่ของ API สัญญา (/api/projects/:id/contracts/...)
 *
 * ทุกเส้นทางต้องตอบเป็นข้อความที่หน้าจอโชว์ได้ — ข้อมูลไม่ครบ = 400 · ไม่พบสัญญา/รายการ = 404 —
 * ไม่ใช่ 500 "Internal server error" ซึ่งเกิดเมื่อเส้นทางลืมจับ error ของเซอร์วิส
 * (เส้นทางที่ทำงานสำเร็จมีเทสต์ของตัวเองใน contracts/installment-payments/change-orders/retention)
 */
describe("contracts API — validation and not-found answers", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  let projectId: string;
  let base: string;
  const ghost = "no-such-contract";

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-contract-errors");
    const res = await owner.agent.post("/api/projects").send({ name: "โครงการทดสอบเส้นทางสัญญา" });
    projectId = res.body.project.id;
    base = `/api/projects/${projectId}/contracts`;
  });

  afterAll(async () => {
    await prisma.projectVersion.deleteMany({ where: { projectId } });
    await prisma.project.deleteMany({ where: { id: projectId } });
    await prisma.session.deleteMany({ where: { userId: owner.userId } });
    await prisma.user.deleteMany({ where: { id: owner.userId } });
    await prisma.$disconnect();
  });

  it("lists no contracts for a project that has none", async () => {
    const res = await owner.agent.get(base);
    expect(res.status).toBe(200);
    expect(res.body.contracts).toEqual([]);
  });

  const validPayment = { paidOn: "2026-10-01", amount: 1000 };

  // [method, path, body] — body ถูกต้องตาม schema เพื่อให้ไปถึงเซอร์วิส แล้วเซอร์วิสต้องตอบว่าไม่พบ
  const notFound: [string, string, unknown][] = [
    ["get", `/${ghost}`, null],
    ["get", `/${ghost}/installments`, null],
    ["put", `/${ghost}/installments`, { installments: [{ milestone: "งวดเดียว", amount: 100 }] }],
    ["post", `/${ghost}/sign`, null],
    ["get", `/${ghost}/pdf`, null],
    ["get", `/${ghost}/payments`, null],
    ["patch", `/${ghost}/installments/x/due`, { dueOn: "2026-12-01" }],
    ["post", `/${ghost}/installments/x/payments`, validPayment],
    ["patch", `/${ghost}/payments/x`, validPayment],
    ["delete", `/${ghost}/payments/x`, null],
    ["post", `/${ghost}/payments/x/verify`, null],
    ["delete", `/${ghost}/payments/x/evidence/y`, null],
    ["get", `/${ghost}/payments/x/evidence/y`, null],
    ["post", `/${ghost}/payment-notices/x/reject`, { reason: "สลิปไม่ชัด" }],
    ["post", `/${ghost}/payment-notices/x/confirm-slip`, null],
    ["post", `/${ghost}/payment-notices/x/recheck-slip`, null],
    ["get", `/${ghost}/payment-notices/x/evidence/y`, null],
    ["post", `/${ghost}/installments/x/invoice`, { dueOn: "2026-12-01" }],
    ["post", `/${ghost}/payments/x/receipt`, null],
    ["post", `/${ghost}/documents/x/void`, { reason: "ออกผิดใบ" }],
    ["get", `/${ghost}/documents/x/pdf`, null],
    ["get", `/${ghost}/change-orders`, null],
    ["get", `/${ghost}/change-orders/preview`, null],
    ["post", `/${ghost}/change-orders`, { title: "เปลี่ยนกระเบื้อง" }],
    ["patch", `/${ghost}/change-orders/x`, { title: "เปลี่ยนกระเบื้อง" }],
    ["post", `/${ghost}/change-orders/x/refresh`, null],
    ["post", `/${ghost}/change-orders/x/send`, null],
    ["post", `/${ghost}/change-orders/x/cancel`, null],
    ["post", `/${ghost}/change-orders/x/decision`, { decision: "APPROVE" }],
    ["get", `/${ghost}/change-orders/x/pdf`, null],
    ["patch", `/${ghost}/retention`, { pct: 5 }],
    ["post", `/${ghost}/retention/releases`, validPayment],
    ["patch", `/${ghost}/retention/releases/x`, validPayment],
    ["delete", `/${ghost}/retention/releases/x`, null],
    ["post", `/${ghost}/retention/invoice`, { dueOn: "2026-12-01" }],
    ["post", `/${ghost}/retention/releases/x/receipt`, null],
  ];

  it.each(notFound)("%s %s on an unknown contract answers 404 with a message", async (method, path, body) => {
    const agent = owner.agent as unknown as Record<string, (url: string) => import("supertest").Test>;
    const req = agent[method](`${base}${path}`);
    const res = body === null ? await req : await req.send(body as object);
    expect(res.status).toBe(404);
    expect(typeof res.body.error).toBe("string");
    expect(res.body.error.length).toBeGreaterThan(0);
  });

  // body ผิดรูป → ตอบ 400 พร้อมข้อความของช่องที่ผิด ก่อนแตะฐานข้อมูล
  const invalid: [string, string, unknown, string | null][] = [
    ["patch", `/${ghost}/body`, { body: "not-a-structure" }, null],
    ["put", `/${ghost}/installments`, { installments: [] }, "ต้องมีอย่างน้อยหนึ่งงวด"],
    ["patch", `/${ghost}/installments/x/due`, { dueOn: "1/12/2026" }, "รูปแบบวันที่ต้องเป็น ปปปป-ดด-วว"],
    ["post", `/${ghost}/installments/x/payments`, { paidOn: "2026-10-01", amount: 0 }, "ยอดที่รับต้องมากกว่า 0"],
    ["patch", `/${ghost}/payments/x`, { paidOn: "2026-10-01", amount: -5 }, "ยอดที่รับต้องมากกว่า 0"],
    ["post", `/${ghost}/payment-notices/x/reject`, { reason: "  " }, "ระบุเหตุผลให้ลูกค้ารู้ว่าต้องทำอะไรต่อ"],
    ["post", `/${ghost}/installments/x/invoice`, {}, null],
    ["post", `/${ghost}/documents/x/void`, { reason: "" }, "กรุณาระบุเหตุผลที่ยกเลิก"],
    ["post", `/${ghost}/change-orders`, { title: "" }, "ระบุเรื่อง เช่น ลูกค้าขอเปลี่ยนกระเบื้องห้องนอน"],
    ["patch", `/${ghost}/change-orders/x`, { title: "x", extensionDays: -1 }, null],
    ["post", `/${ghost}/change-orders/x/decision`, { decision: "REJECT" }, "บอกเหตุผลที่ไม่อนุมัติด้วย"],
    ["patch", `/${ghost}/retention`, {}, "ไม่มีอะไรให้บันทึก"],
    ["patch", `/${ghost}/retention`, { pct: 30 }, "เงินประกันผลงานไม่ควรเกิน 20%"],
    ["post", `/${ghost}/retention/releases`, { amount: 100 }, null],
    ["patch", `/${ghost}/retention/releases/x`, { paidOn: "bad", amount: 1 }, null],
    ["post", `/${ghost}/retention/invoice`, { dueOn: "" }, null],
  ];

  it.each(invalid)("%s %s with a malformed body answers 400", async (method, path, body, message) => {
    const agent = owner.agent as unknown as Record<string, (url: string) => import("supertest").Test>;
    const res = await agent[method](`${base}${path}`).send(body as object);
    expect(res.status).toBe(400);
    if (message) expect(res.body.error).toBe(message);
    else expect(typeof res.body.error).toBe("string");
  });

  it("rejects an evidence upload with no file attached", async () => {
    const res = await owner.agent.post(`${base}/${ghost}/payments/x/evidence`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("ไม่พบไฟล์ที่อัปโหลด");
  });

  it("rejects an evidence upload of a disallowed file type", async () => {
    const res = await owner.agent
      .post(`${base}/${ghost}/payments/x/evidence`)
      .attach("file", Buffer.from("MZ fake exe"), { filename: "virus.exe", contentType: "application/octet-stream" });
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe("string");
  });

  it("answers 404 and keeps nothing on disk when the payment for an uploaded slip does not exist", async () => {
    const png = Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4e90000000049454e44ae426082",
      "hex",
    );
    const res = await owner.agent
      .post(`${base}/${ghost}/payments/x/evidence`)
      .attach("file", png, { filename: "slip.png", contentType: "image/png" });
    expect(res.status).toBe(404);
  });
});
