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
/** โครงการของชุดหน้าจอ: เดินงานขาย (ใบเสนอราคา → ใบเสร็จ) / ปฏิเสธ / ถังขยะ / Excel — ลบของรอบก่อนแล้วสร้างใหม่ทุกรอบ */
const SALES_PREFIX = "[โรบอท] ทดสอบขายงาน";
const REJECT_PREFIX = "[โรบอท] ทดสอบปฏิเสธ";
const TRASH_PREFIX = "[โรบอท] ทดสอบถังขยะ";
const EXCEL_PREFIX = "[โรบอท] ทดสอบ Excel";
/** ชุด API R-31: ชื่อลูกค้า/โครงการ/ที่อยู่ที่มี HTML — ต้องพิมพ์ออกมาเป็นตัวอักษร ไม่ใช่ถูกตีเป็นแท็ก */
const XSS_PREFIX = "[โรบอท] ทดสอบ XSS";
const XSS_MARK = '<img src=x onerror="alert(1)">';
/** secret ของ robot_twofa (base32) — Robot คำนวณรหัส 6 หลักเองจากค่านี้ (common.robot ต้องตรงกัน) */
const TWOFA_SECRET = "KRUGS4ZANFZSA5DFON2CA43FMNZGK5BB";
const TWOFA_BACKUP_CODES = ["RBTA-AAAA", "RBTB-BBBB"];

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
  // ชุดหน้าจอส่วนที่เพิ่ม (ช่องว่าง UI-GAP): 2FA · กระดิ่ง · ลืมรหัสผ่าน · เดินงานขาย
  twofaStaff: { username: "robot_twofa", password: "Robot-TwoFaStaff-2026!", fullName: "โรบอท สองชั้น" },
  bell: { username: "robot_bell", password: "Robot-Bell-2026!", fullName: "โรบอท กระดิ่ง" },
  forgotStaff: { username: "robot_forgot", password: "Robot-ForgotStaff-2026!", fullName: "โรบอท ลืมรหัส", email: "robot.staff.forgot@example.test" },
  forgotCustomer: { email: "robot.forgot@example.test", password: "Robot-Forgot-2026!", fullName: "ลูกค้าลืมรหัส โรบอท" },
  sales: { email: "robot.sales@example.test", password: "Robot-Sales-2026!", fullName: "ลูกค้าขายงาน โรบอท" },
  // ชุด API R-31 — ชื่อมี HTML (สร้างตรงลงฐานข้อมูล เหมือนข้อมูลเก่า/นำเข้า ที่ไม่ได้ผ่านกฎชื่อของหน้าสมัคร)
  xss: { email: "robot.xss@example.test", password: "Robot-Xss-2026!", fullName: `${XSS_MARK} โรบอท` },
  // ชุด API R-32 (ยิงขอเมลถี่ ๆ) — แยกบัญชีไม่ให้ช่วงพัก 60 วินาทีไปปนกับเคสหน้าจอ
  mailFlood: { email: "robot.mailflood@example.test", password: "Robot-MailFlood-2026!", fullName: "ลูกค้าเมลถี่ โรบอท" },
  codeFlood: { email: "robot.codeflood@example.test", password: "Robot-CodeFlood-2026!", fullName: "ลูกค้ารหัสถี่ โรบอท" },
  // คู่ของสองบัญชีข้างบนสำหรับเคส "ยิงพร้อมกัน" — ช่วงพักของเคสยิงทีละครั้งจะไม่ไปบังผล
  mailBurst: { email: "robot.mailburst@example.test", password: "Robot-MailBurst-2026!", fullName: "ลูกค้าเมลพร้อมกัน โรบอท" },
  codeBurst: { email: "robot.codeburst@example.test", password: "Robot-CodeBurst-2026!", fullName: "ลูกค้ารหัสพร้อมกัน โรบอท" },
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
    totpLastStep: null,
    twoFactorFailedCount: 0,
    twoFactorLockedUntil: null,
    twoFactorBackupCodes: [],
  };

  const { hashBackupCode } = await import("../../server/src/lib/totp");
  const staffRoles = {
    owner: "OWNER", lock: "OWNER", admin: "ADMIN", lockApi: "ADMIN", twofaStaff: "ADMIN", bell: "ADMIN", forgotStaff: "ADMIN",
  } as const;
  for (const key of ["owner", "lock", "admin", "lockApi", "twofaStaff", "bell", "forgotStaff"] as const) {
    const a = ROBOT_ACCOUNTS[key];
    const passwordHash = await hashPassword(a.password);
    const role = staffRoles[key];
    // robot_twofa เปิด 2FA ไว้แล้วทุกรอบ (secret + รหัสสำรองที่รู้ค่า) · robot_forgot มีอีเมลกู้รหัสผ่าน
    const extra = {
      ...("email" in a ? { email: a.email, emailVerifiedAt: new Date() } : {}),
      ...(key === "twofaStaff"
        ? { totpEnabled: true, totpSecret: TWOFA_SECRET, twoFactorBackupCodes: TWOFA_BACKUP_CODES.map(hashBackupCode) }
        : {}),
    };
    const user = await prisma.user.upsert({
      where: { username: a.username },
      create: { username: a.username, passwordHash, fullName: a.fullName, role, ...resetFlags, ...extra },
      update: { passwordHash, fullName: a.fullName, role, ...resetFlags, ...extra },
    });
    // กระดิ่งของ robot_bell เริ่มที่ศูนย์ทุกรอบ ชุดทดสอบจึงนับเลขได้แน่นอน
    if (key === "bell") await prisma.notification.deleteMany({ where: { userId: user.id } });
  }
  // ลิงก์ตั้งรหัสใหม่ค้างจากรอบก่อน = ขอใหม่ไม่ได้ 60 วินาที (กันยิงเมลถี่) — ล้างทิ้งก่อนทุกรอบ
  await prisma.passwordResetToken.deleteMany({
    where: {
      user: {
        OR: [
          { username: ROBOT_ACCOUNTS.forgotStaff.username },
          { email: { in: [ROBOT_ACCOUNTS.forgotCustomer.email, ROBOT_ACCOUNTS.mailFlood.email, ROBOT_ACCOUNTS.mailBurst.email] } },
        ],
      },
    },
  });

  for (const key of [
    "customer", "unverified", "other", "lockCustomer", "twofa", "pwchange", "deleter", "deact", "apiCustomer",
    "forgotCustomer", "sales", "xss", "mailFlood", "codeFlood", "mailBurst", "codeBurst",
  ] as const) {
    const a = ROBOT_ACCOUNTS[key];
    const passwordHash = await hashPassword(a.password);
    const emailVerifiedAt = key === "unverified" || key === "codeFlood" || key === "codeBurst" ? null : new Date();
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

  // รหัสยืนยันที่ส่งค้างจากรอบก่อน = ส่งใหม่ไม่ได้ 60 วินาที — ล้างทิ้งก่อนทุกรอบ
  await prisma.emailVerification.deleteMany({
    where: { user: { email: { in: [ROBOT_ACCOUNTS.codeFlood.email, ROBOT_ACCOUNTS.codeBurst.email, ROBOT_ACCOUNTS.unverified.email] } } },
  });

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
  for (const email of [ROBOT_ACCOUNTS.customer.email, ROBOT_ACCOUNTS.apiCustomer.email, ROBOT_ACCOUNTS.sales.email, ROBOT_ACCOUNTS.xss.email]) {
    const u = await prisma.user.findUniqueOrThrow({ where: { email } });
    await prisma.customerProfile.upsert({
      where: { userId: u.id },
      create: { userId: u.id, phone: "0812345678", address },
      update: { address },
    });
    owners.push(u);
  }
  const [customer, apiCustomer, salesCustomer, xssCustomer] = owners;

  await seedPayments(prisma, customer.id, { prefix: PAY_PROJECT_PREFIX, file: "payment-data.json", vars: "PAY", account: ROBOT_ACCOUNTS.customer });
  // ชุดทดสอบ API ใช้สัญญาของตัวเอง — ฝั่งหน้าจอยืนยัน/รับเงินงวด 1–3 ของสัญญาข้างบนไปแล้วก่อน API รัน
  await seedPayments(prisma, apiCustomer.id, { prefix: API_PROJECT_PREFIX, file: "api-data.json", vars: "API", account: ROBOT_ACCOUNTS.apiCustomer });
  // R-31: ชื่อลูกค้า/โครงการ/ที่ตั้งงานมี HTML แล้วเปิดเอกสาร PDF ทุกใบ
  await seedPayments(prisma, xssCustomer.id, {
    prefix: XSS_PREFIX, file: "xss-data.json", vars: "XSS", account: ROBOT_ACCOUNTS.xss,
    nameSuffix: ` ${XSS_MARK}`, siteAddress: `ที่ตั้ง <script>alert(2)</script> ${XSS_MARK}`,
  });
  await seedUiProjects(prisma, salesCustomer.id, customer.id);

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
  opts: {
    prefix: string; file: string; vars: string; account: { email: string; password: string };
    nameSuffix?: string; siteAddress?: string;
  },
) {
  const { default: request } = await import("supertest");
  const { app } = await import("../../server/src/app");
  const { todayIso } = await import("../../server/src/lib/business-date");

  // ลบโครงการชำระเงินของรอบก่อน (พร้อมไฟล์สลิป) — ไม่งั้นพอร์ทัลลูกค้าทดสอบมีหลายสัญญาปนกัน
  await removeProjects(prisma, opts.prefix);
  await prisma.notification.deleteMany({ where: { userId: customerId } });

  const owner = await staffAgent();

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
  const name = `${opts.prefix} ${stamp}${opts.nameSuffix ?? ""}`;
  const proj = ok(
    await owner.post("/api/projects").send({ name, siteAddress: opts.siteAddress ?? "ที่ตั้งทดสอบโรบอท", customerId }),
    "project",
  );
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
  writeVars(opts.file, data);
}

type Agent = import("supertest").Agent;

function ok<T extends { status: number; body: unknown }>(res: T, what: string): T {
  if (res.status >= 300) throw new Error(`seed: ${what} ${res.status} ${JSON.stringify(res.body)}`);
  return res;
}

/** เซสชัน robot_owner ภายในโปรเซส seed (supertest) — ไม่กินเพดานเข้าสู่ระบบของ API ชุดทดสอบ */
async function staffAgent(): Promise<Agent> {
  const { default: request } = await import("supertest");
  const { app } = await import("../../server/src/app");
  const owner = request.agent(app);
  const login = await owner
    .post("/api/auth/staff/login")
    .send({ username: ROBOT_ACCOUNTS.owner.username, password: ROBOT_ACCOUNTS.owner.password });
  if (login.status !== 200) throw new Error(`seed: staff login ${login.status}`);
  return owner;
}

function writeVars(file: string, data: Record<string, string>) {
  const fs = require("node:fs") as typeof import("node:fs");
  const outDir = path.resolve(__dirname, "..", "results");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, file), JSON.stringify(data, null, 1));
  console.log(`${file}:`, JSON.stringify(data));
}

/** ลบโครงการของรอบก่อนที่ชื่อขึ้นต้นด้วย prefix ให้หมด (รวมที่อยู่ในถังขยะ) พร้อมไฟล์สลิปและเอกสาร */
async function removeProjects(prisma: typeof import("../../server/src/lib/prisma").prisma, prefix: string) {
  const fs = await import("node:fs");
  const { evidencePath } = await import("../../server/src/modules/contracts/payment-evidence.files");
  const old = await prisma.project.findMany({ where: { name: { startsWith: prefix } }, select: { id: true } });
  if (old.length === 0) return;
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

/**
 * โครงการร่างพร้อมบรรทัด BOQ ให้ชุดหน้าจอเดินต่อเอง (ใบเสนอราคา/สัญญา/วางบิล ทำผ่านหน้าจอทั้งหมด)
 *   SALES  — ลูกค้า robot.sales ยอมรับ → สัญญา → วางบิล → รับเงิน → ใบเสร็จ
 *   REJECT — ลูกค้า robot.sales ปฏิเสธ
 *   TRASH  — สองโครงการ: ลบแล้วกู้คืน / ลบแล้วลบถาวร
 *   EXCEL  — ส่งออก BOQ แล้วนำไฟล์เดิมกลับเข้าไป
 */
async function seedUiProjects(
  prisma: typeof import("../../server/src/lib/prisma").prisma,
  salesCustomerId: string,
  customerId: string,
) {
  for (const prefix of [SALES_PREFIX, REJECT_PREFIX, TRASH_PREFIX, EXCEL_PREFIX]) await removeProjects(prisma, prefix);
  await prisma.notification.deleteMany({ where: { userId: salesCustomerId } });
  const owner = await staffAgent();
  const item = await prisma.workCategory.findUniqueOrThrow({ where: { code: "R-01-01" } });
  const stamp = new Date().toISOString().slice(5, 19).replace(/[-T:]/g, "");

  const make = async (name: string, customer: string | null, lines: { name: string; quantity: number; m: number; l: number }[]) => {
    const proj = ok(
      await owner.post("/api/projects").send({ name, siteAddress: "ที่ตั้งทดสอบโรบอท", ...(customer ? { customerId: customer } : {}) }),
      "ui project",
    );
    const id = proj.body.project.id as string;
    for (const x of lines) {
      ok(
        await owner.post(`/api/projects/${id}/boq/items`).send({
          categoryId: item.id, name: x.name, quantity: x.quantity, unit: "หน่วย", materialUnitPrice: x.m, laborUnitPrice: x.l,
        }),
        "ui boq item",
      );
    }
    return id;
  };
  const line = [{ name: "งานทดสอบขายงาน", quantity: 10, m: 30_000, l: 20_000 }];
  const data: Record<string, string> = {
    SALES_RUN: stamp,
    SALES_EMAIL: ROBOT_ACCOUNTS.sales.email,
    SALES_PASSWORD: ROBOT_ACCOUNTS.sales.password,
    SALES_FULLNAME: ROBOT_ACCOUNTS.sales.fullName,
    SALES_PROJECT_NAME: `${SALES_PREFIX} ${stamp}`,
    REJECT_PROJECT_NAME: `${REJECT_PREFIX} ${stamp}`,
    TRASH_RESTORE_NAME: `${TRASH_PREFIX} กู้คืน ${stamp}`,
    TRASH_PURGE_NAME: `${TRASH_PREFIX} ลบถาวร ${stamp}`,
    EXCEL_PROJECT_NAME: `${EXCEL_PREFIX} ${stamp}`,
  };
  data.SALES_PROJECT_ID = await make(data.SALES_PROJECT_NAME, salesCustomerId, line);
  data.REJECT_PROJECT_ID = await make(data.REJECT_PROJECT_NAME, salesCustomerId, line);
  data.TRASH_RESTORE_ID = await make(data.TRASH_RESTORE_NAME, null, []);
  data.TRASH_PURGE_ID = await make(data.TRASH_PURGE_NAME, null, []);
  data.EXCEL_PROJECT_ID = await make(data.EXCEL_PROJECT_NAME, customerId, [
    { name: "งานทดสอบ Excel ก", quantity: 4, m: 1_000, l: 500 },
    { name: "งานทดสอบ Excel ข", quantity: 2, m: 2_500, l: 1_000 },
  ]);
  writeVars("ui-data.json", data);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
