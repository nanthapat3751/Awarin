import { prisma } from "../../src/lib/prisma";
import { createAndLoginOwner } from "../helpers/test-auth";

/**
 * บันทึกแบบบ้าน/ผลงานที่มีรูปที่อัปโหลด — บั๊ก 17 ต.ค.: middleware ตัดโดเมนเหลือ `/uploads/...` ก่อนถึงตัวตรวจ
 * แต่ตัวตรวจเดิมเป็น z.string().url() ที่ไม่รับ path สัมพัทธ์ → อัปรูปได้แต่กดบันทึกแล้ว "ข้อมูลไม่ถูกต้อง" ทุกครั้ง
 */
describe("ลิงก์รูปตอนบันทึกแบบบ้าน/ผลงาน", () => {
  let owner: Awaited<ReturnType<typeof createAndLoginOwner>>;
  const designIds: string[] = [];
  const portfolioIds: string[] = [];

  beforeAll(async () => {
    owner = await createAndLoginOwner("test-image-url-save");
  });

  afterAll(async () => {
    await prisma.houseDesign.deleteMany({ where: { id: { in: designIds } } });
    await prisma.portfolio.deleteMany({ where: { id: { in: portfolioIds } } });
    await prisma.user.deleteMany({ where: { id: owner.userId } });
    await prisma.$disconnect();
  });

  // แบบที่หน้าจอส่งจริง: URL เต็มของรูปที่เพิ่งอัป (ได้จาก POST /api/uploads) + ลิงก์รูปเว็บอื่น
  const own = "http://localhost:4000/uploads/1792207999900-28cddeea75f8.jpg";
  const external = "https://example.com/house.jpg";

  it("แบบบ้าน: รูปที่อัปโหลด + ลิงก์ภายนอก บันทึกได้ · เก็บรูปของเราเป็น path สัมพัทธ์", async () => {
    const res = await owner.agent.post("/api/house-designs").send({
      name: "ทดสอบ รูปแบบบ้าน",
      exteriorImages: [own, external],
      interiorImages: ["/uploads/a1b2.png"],
      plans: [own],
    });
    expect(res.status).toBe(201);
    designIds.push(res.body.houseDesign.id);
    const row = await prisma.houseDesign.findUniqueOrThrow({ where: { id: res.body.houseDesign.id } });
    expect(row.exteriorImages).toEqual(["/uploads/1792207999900-28cddeea75f8.jpg", external]);
    expect(row.interiorImages).toEqual(["/uploads/a1b2.png"]);

    // แก้ไขแล้วบันทึกด้วย URL เต็มที่ได้กลับมาจาก API ก็ต้องผ่าน
    const back = res.body.houseDesign.exteriorImages as string[];
    const upd = await owner.agent.patch(`/api/house-designs/${res.body.houseDesign.id}`).send({ exteriorImages: [...back].reverse() });
    expect(upd.status).toBe(200);
  });

  it("ผลงาน: รูปที่อัปโหลดบันทึกได้", async () => {
    const res = await owner.agent.post("/api/portfolio").send({ title: "ทดสอบ รูปผลงาน", type: "CONSTRUCTION", images: [own] });
    expect(res.status).toBe(201);
    portfolioIds.push(res.body.item.id);
  });

  it("ลิงก์อันตราย (javascript:/data:) ยังถูกปฏิเสธ", async () => {
    for (const bad of ["javascript:alert(1)", "data:image/png;base64,AAAA", "//evil.example/x.png"]) {
      const res = await owner.agent.post("/api/house-designs").send({ name: "ทดสอบ ลิงก์อันตราย", exteriorImages: [bad] });
      expect(res.status).toBe(400);
      const pf = await owner.agent.post("/api/portfolio").send({ title: "ทดสอบ", type: "DESIGN", images: [bad] });
      expect(pf.status).toBe(400);
    }
  });
});
