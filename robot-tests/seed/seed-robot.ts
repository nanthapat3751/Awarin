/**
 * ข้อมูลตั้งต้นของ Robot Framework — เขียนลง "ฐานข้อมูลทดสอบ" (DATABASE_URL_TEST) เท่านั้น
 * ไม่แตะฐานข้อมูล dev เด็ดขาด (ตัวเดียวกับที่ jest ใช้ ดู server/tests/setup-env.ts)
 *
 * รันซ้ำได้ทุกครั้งก่อนเทสต์: บัญชีถูก upsert และล้างตัวนับรหัสผิด/การล็อกทุกรอบ
 * เพื่อให้ผลไม่ขึ้นกับรอบก่อน
 *
 *   cd server && npx tsx ../robot-tests/seed/seed-robot.ts
 */
import path from "node:path";

import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "..", "..", "server", ".env"), quiet: true });

const testUrl = process.env.DATABASE_URL_TEST;
const testRuntimeUrl = process.env.DATABASE_URL_TEST_RUNTIME;
if (!testUrl || !testRuntimeUrl) {
  throw new Error("DATABASE_URL_TEST / DATABASE_URL_TEST_RUNTIME are not set — refusing to seed the dev database.");
}
process.env.DATABASE_URL = testUrl;
process.env.DATABASE_URL_RUNTIME = testRuntimeUrl;
// seed เรียก API ภายในโปรเซสเดียวกัน (สร้างสัญญา/วางบิล) — ห้ามส่งเมลจริง ห้ามเรียก SlipOK จริง
// และไฟล์อัปโหลดต้องลงโฟลเดอร์เดียวกับ API ของชุดทดสอบ (test-env.mjs)
process.env.MAIL_TRANSPORT = "silent";
process.env.RATE_LIMIT_STORE = "memory";
process.env.EMAIL_MX_CHECK = "off";
process.env.SLIP_PROVIDER = "mock";
process.env.BACKUP_ENABLED = "false";
{
  const tmpFiles = path.join(require("node:os").tmpdir(), "systemboq-robot-files");
  process.env.UPLOADS_DIR = path.join(tmpFiles, "uploads");
  process.env.PRIVATE_UPLOADS_DIR = path.join(tmpFiles, "private-uploads");
}

/** โครงการที่ seed สร้างใหม่ทุกรอบให้ชุดทดสอบส่วนชำระเงิน (ลบของรอบก่อนทิ้งก่อนเสมอ) */
const PAY_PROJECT_PREFIX = "[โรบอท] ทดสอบชำระเงิน";
const API_PROJECT_PREFIX = "[โรบอท] ทดสอบ API";
/** บัญชีรับเงินของบริษัทในฐานทดสอบ — ชื่อไฟล์สลิปจำลองต้องใช้เลขนี้ (robot-tests/frontend/04_payments.robot) */
const PAY_ACCOUNT_NO = "7260851635";

/** ต้องตรงกับ robot-tests/common.robot */
export const ROBOT_ACCOUNTS = {
  owner: { username: "robot_owner", password: "Robot-Owner-2026!", fullName: "โรบอท เจ้าของ" },
  lock: { username: "robot_lock", password: "Robot-Lock-2026!", fullName: "โรบอท ทดสอบรหัสผิด" },
  customer: { email: "robot.customer@example.test", password: "Robot-Cust-2026!", fullName: "ลูกค้า โรบอท" },
  unverified: { email: "robot.unverified@example.test", password: "Robot-Unver-2026!", fullName: "ยังไม่ยืนยัน โรบอท" },
  // ชุดทดสอบ API (robot-tests/api/resource.robot)
  admin: { username: "robot_admin", password: "Robot-Admin-2026!", fullName: "โรบอท แอดมิน" },
  lockApi: { username: "robot_lock_api", password: "Robot-LockApi-2026!", fullName: "โรบอท ล็อกผ่าน API" },
  other: { email: "robot.other@example.test", password: "Robot-Other-2026!", fullName: "ลูกค้าอื่น โรบอท" },
  lockCustomer: { email: "robot.lock@example.test", password: "Robot-LockCust-2026!", fullName: "ลูกค้าทดสอบล็อก โรบอท" },
  // บัญชีใช้แล้วทิ้งของ api/04_account_session.robot (เปิด 2FA / เปลี่ยนรหัส / ลบบัญชี) — seed สร้างคืนทุกรอบ
  twofa: { email: "robot.twofa@example.test", password: "Robot-TwoFa-2026!", fullName: "ลูกค้าทดสอบสองชั้น โรบอท" },
  pwchange: { email: "robot.pwchange@example.test", password: "Robot-PwChange-2026!", fullName: "ลูกค้าเปลี่ยนรหัส โรบอท" },
  deleter: { email: "robot.delete@example.test", password: "Robot-Delete-2026!", fullName: "ลูกค้าลบบัญชี โรบอท" },
  deact: { email: "robot.deact@example.test", password: "Robot-Deact-2026!", fullName: "ลูกค้าระงับบัญชี โรบอท" },
  // เจ้าของสัญญาชุด API — แยกจาก robot.customer ของชุดหน้าจอ ไม่ให้งวดของสองชุดปนกันในพอร์ทัล
  apiCustomer: { email: "robot.apicust@example.test", password: "Robot-ApiCust-2026!", fullName: "ลูกค้า API โรบอท" },
} as const;

async function main() {
  const { prisma } = await import("../../server/src/lib/prisma");
  const { hashPassword } = await import("../../server/src/lib/password");

  const resetFlags = {
    active: true,
    failedAttempts: 0,
    lockedUntil: null,
    mustChangePassword: false,
    totpEnabled: false,
    totpSecret: null,
    twoFactorFailedCount: 0,
    twoFactorLockedUntil: null,
    twoFactorBackupCodes: [],
  };

  const staffRoles = { owner: "OWNER", lock: "OWNER", admin: "ADMIN", lockApi: "ADMIN" } as const;
  for (const key of ["owner", "lock", "admin", "lockApi"] as const) {
    const a = ROBOT_ACCOUNTS[key];
    const passwordHash = await hashPassword(a.password);
    const role = staffRoles[key];
    await prisma.user.upsert({
      where: { username: a.username },
      create: { username: a.username, passwordHash, fullName: a.fullName, role, ...resetFlags },
      update: { passwordHash, fullName: a.fullName, role, ...resetFlags },
    });
  }

  for (const key of ["customer", "unverified", "other", "lockCustomer", "twofa", "pwchange", "deleter", "deact", "apiCustomer"] as const) {
    const a = ROBOT_ACCOUNTS[key];
    const passwordHash = await hashPassword(a.password);
    const emailVerifiedAt = key === "unverified" ? null : new Date();
    await prisma.user.upsert({
      where: { email: a.email },
      create: {
        email: a.email,
        passwordHash,
        fullName: a.fullName,
        role: "CUSTOMER",
        emailVerifiedAt,
        ...resetFlags,
        customerProfile: { create: { phone: "0812345678" } },
      },
      update: { passwordHash, fullName: a.fullName, emailVerifiedAt, ...resetFlags },
    });
  }

  // หมวดงานสามชั้นสำหรับเพิ่มบรรทัด BOQ (บรรทัดต้องผูกกับระดับ ITEM)
  const cat = await prisma.workCategory.upsert({
    where: { code: "R" },
    create: { code: "R", name: "หมวดทดสอบโรบอท", level: "CATEGORY", sortOrder: 900 },
    update: { active: true },
  });
  const sub = await prisma.workCategory.upsert({
    where: { code: "R-01" },
    create: { code: "R-01", name: "กลุ่มทดสอบโรบอท", level: "SUBGROUP", parentId: cat.id },
    update: { active: true },
  });
  await prisma.workCategory.upsert({
    where: { code: "R-01-01" },
    create: { code: "R-01-01", name: "รายการทดสอบโรบอท", level: "ITEM", parentId: sub.id },
    update: { active: true },
  });

  // ใบเสร็จต้องมีที่อยู่ลูกค้า (assertReceiptIssuable) — ลูกค้าเจ้าของสัญญาทดสอบต้องมีเสมอ
  const address = "99 ถนนทดสอบ ตำบลทดสอบ อำเภอเมือง จังหวัดนครปฐม 73000";
  const owners = [];
  for (const email of [ROBOT_ACCOUNTS.customer.email, ROBOT_ACCOUNTS.apiCustomer.email]) {
    const u = await prisma.user.findUniqueOrThrow({ where: { email } });
    await prisma.customerProfile.upsert({
      where: { userId: u.id },
      create: { userId: u.id, phone: "0812345678", address },
      update: { address },
    });
    owners.push(u);
  }
  const [customer, apiCustomer] = owners;

  await seedPayments(prisma, customer.id, { prefix: PAY_PROJECT_PREFIX, file: "payment-data.json", vars: "PAY", account: ROBOT_ACCOUNTS.customer });
  // ชุดทดสอบ API ใช้สัญญาของตัวเอง — ฝั่งหน้าจอยืนยัน/รับเงินงวด 1–3 ของสัญญาข้างบนไปแล้วก่อน API รัน
  await seedPayments(prisma, apiCustomer.id, { prefix: API_PROJECT_PREFIX, file: "api-data.json", vars: "API", account: ROBOT_ACCOUNTS.apiCustomer });

  console.log("robot seed ok:", Object.values(ROBOT_ACCOUNTS).map((a) => ("username" in a ? a.username : a.email)).join(", "));
  await prisma.$disconnect();
}

/**
 * โครงการ + สัญญาที่ลงนามแล้ว + วางบิลงวด 1–3 ให้ลูกค้าทดสอบ — สร้างผ่าน API จริงในโปรเซสนี้ (supertest)
 * จึงผ่านกฎของระบบครบเหมือนพนักงานทำเอง และไม่กินเพดานเข้าสู่ระบบของ API ชุดทดสอบ (คนละโปรเซส)
 * ผลลัพธ์ (ยอดแต่ละงวด ฯลฯ) เขียนลง results/payment-data.json ให้ไฟล์ .robot อ่าน
 */
async function seedPayments(
  prisma: typeof import("../../server/src/lib/prisma").prisma,
  customerId: string,
  opts: { prefix: string; file: string; vars: string; account: { email: string; password: string } },
) {
  const fs = await import("node:fs");
  const { default: request } = await import("supertest");
  const { app } = await import("../../server/src/app");
  const { todayIso } = await import("../../server/src/lib/business-date");
  const { evidencePath } = await import("../../server/src/modules/contracts/payment-evidence.files");

  // ลบโครงการชำระเงินของรอบก่อน (พร้อมไฟล์สลิป) — ไม่งั้นพอร์ทัลลูกค้าทดสอบมีหลายสัญญาปนกัน
  const old = await prisma.project.findMany({ where: { name: { startsWith: opts.prefix } }, select: { id: true } });
  if (old.length > 0) {
    const ids = old.map((p) => p.id);
    const files = await prisma.paymentEvidence.findMany({
      where: {
        OR: [
          { notice: { installment: { contract: { projectId: { in: ids } } } } },
          { payment: { installment: { contract: { projectId: { in: ids } } } } },
        ],
      },
      select: { storedName: true },
    });
    for (const f of files) fs.rmSync(evidencePath(f.storedName), { force: true });
    await prisma.contract.deleteMany({ where: { projectId: { in: ids } } });
    await prisma.quote.deleteMany({ where: { projectId: { in: ids } } });
    await prisma.projectVersion.deleteMany({ where: { projectId: { in: ids } } });
    await prisma.project.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.notification.deleteMany({ where: { userId: customerId } });

  const owner = request.agent(app);
  const login = await owner
    .post("/api/auth/staff/login")
    .send({ username: ROBOT_ACCOUNTS.owner.username, password: ROBOT_ACCOUNTS.owner.password });
  if (login.status !== 200) throw new Error(`seed: staff login ${login.status}`);
  const ok = (res: { status: number; body: unknown }, what: string) => {
    if (res.status >= 300) throw new Error(`seed: ${what} ${res.status} ${JSON.stringify(res.body)}`);
    return res;
  };

  ok(
    await owner.patch("/api/settings").send({
      paymentBankName: "ธนาคารไทยพาณิชย์",
      paymentAccountName: "Awarin Engineering Co.,Ltd.",
      paymentAccountNo: PAY_ACCOUNT_NO,
    }),
    "payment account",
  );

  const item = await prisma.workCategory.findUniqueOrThrow({ where: { code: "R-01-01" } });
  const stamp = new Date().toISOString().slice(5, 19).replace(/[-T:]/g, "");
  const name = `${opts.prefix} ${stamp}`;
  const proj = ok(await owner.post("/api/projects").send({ name, siteAddress: "ที่ตั้งทดสอบโรบอท", customerId }), "project");
  const projectId = proj.body.project.id as string;
  ok(
    await owner.post(`/api/projects/${projectId}/boq/items`).send({
      categoryId: item.id, name: "งานทดสอบชำระเงิน", quantity: 10, unit: "หน่วย", materialUnitPrice: 60_000, laborUnitPrice: 40_000,
    }),
    "boq item",
  );
  const quote = ok(await owner.post(`/api/projects/${projectId}/quotes`).send({}), "quote");
  const quoteId = quote.body.quote.id as string;
  for (const role of ["PROPOSER", "APPROVER"] as const) {
    await prisma.quoteSigner.create({ data: { quoteId, role, name: "ผู้ทดสอบโรบอท" } });
  }
  ok(await owner.post(`/api/projects/${projectId}/quotes/${quoteId}/transition`).send({ toStatus: "SENT" }), "quote sent");
  ok(await owner.post(`/api/projects/${projectId}/quotes/${quoteId}/transition`).send({ toStatus: "ACCEPTED" }), "quote accepted");
  // ลูกค้ายอมรับใบเสนอราคา = โครงการอนุมัติเองแล้ว (เดิมต้องสั่งเอง) — สั่งเฉพาะถ้ายังไม่อนุมัติ
  const status = (await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { status: true } })).status;
  if (status !== "APPROVED") {
    ok(await owner.post(`/api/projects/${projectId}/transition`).send({ toStatus: "APPROVED" }), "project approved");
  }
  const contract = ok(await owner.post(`/api/projects/${projectId}/contracts`).send({}), "contract");
  const contractId = contract.body.contract.id as string;
  const base = `/api/projects/${projectId}/contracts/${contractId}`;
  ok(await owner.post(`${base}/sign`), "sign");
  await prisma.contract.update({ where: { id: contractId }, data: { retentionPct: null } });
  const view = ok(await owner.get(`${base}/payments`), "payments view");
  const inst = (view.body.installments ?? []) as { id: string }[];
  for (const i of inst.slice(0, 3)) ok(await owner.post(`${base}/installments/${i.id}/invoice`).send({ dueOn: todayIso() }), "invoice");

  const cust = request.agent(app);
  ok(
    await cust.post("/api/auth/customer/login").send({ email: opts.account.email, password: opts.account.password }),
    "customer login",
  );
  const due = ok(await cust.get("/api/my/payments"), "my payments").body.payments.due as { seq: number; amountToPay: number }[];
  const amount = (seq: number) => {
    const d = due.find((x) => x.seq === seq);
    if (!d) throw new Error(`seed: installment ${seq} is not due for the customer`);
    return d.amountToPay.toFixed(2);
  };

  const outDir = path.resolve(__dirname, "..", "results");
  fs.mkdirSync(outDir, { recursive: true });
  const v = opts.vars;
  const data: Record<string, string> = {
    [`${v}_PROJECT_ID`]: projectId,
    [`${v}_PROJECT_NAME`]: name,
    [`${v}_CONTRACT_ID`]: contractId,
    [`${v}_CONTRACT_NO`]: contract.body.contract.contractNo as string,
    [`${v}_QUOTE_ID`]: quoteId,
    [`${v}_CUSTOMER_ID`]: customerId,
    [`${v}_ACCOUNT_NO`]: PAY_ACCOUNT_NO,
    [`${v}_TODAY`]: todayIso().replace(/-/g, ""),
    [`${v}_TODAY_ISO`]: todayIso(),
    [`${v}_RUN`]: stamp,
    [`${v}_AMOUNT_1`]: amount(1),
    [`${v}_AMOUNT_2`]: amount(2),
    [`${v}_AMOUNT_3`]: amount(3),
  };
  inst.forEach((i, idx) => (data[`${v}_INSTALLMENT_${idx + 1}`] = i.id));
  fs.writeFileSync(path.join(outDir, opts.file), JSON.stringify(data, null, 1));
  console.log(`${opts.file}:`, JSON.stringify(data));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
