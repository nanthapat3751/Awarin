import request from "supertest";

import { app } from "../../src/app";
import { hashPassword } from "../../src/lib/password";
import { prisma } from "../../src/lib/prisma";

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

async function createAndLoginStaff(prefix: string, role: "OWNER" | "ADMIN") {
  const email = uniqueEmail(prefix);
  const password = "test-owner-battery-staple";
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, passwordHash, fullName: role === "OWNER" ? "Test Owner" : "Test Admin", role },
  });

  const agent = request.agent(app);
  const res = await agent.post("/api/auth/staff/login").send({ email, password });
  if (res.status !== 200) {
    throw new Error(`failed to log in test ${role}: ${res.status} ${JSON.stringify(res.body)}`);
  }

  return { agent, userId: user.id, email, password };
}

export async function createAndLoginOwner(prefix: string) {
  return createAndLoginStaff(prefix, "OWNER");
}

export async function createAndLoginAdmin(prefix: string) {
  return createAndLoginStaff(prefix, "ADMIN");
}

export async function createAndLoginCustomer(prefix: string) {
  const email = uniqueEmail(prefix);
  const password = "test-customer-battery-staple";

  const agent = request.agent(app);
  await agent
    .post("/api/auth/customer/register")
    .send({ email, password, fullName: "Test Customer", phone: "0812345678" });
  const res = await agent.post("/api/auth/customer/login").send({ email, password });
  if (res.status !== 200) {
    throw new Error(`failed to log in test customer: ${res.status} ${JSON.stringify(res.body)}`);
  }

  return { agent, email, password };
}

/**
 * สร้างลูกค้าโดยเขียนลงฐานข้อมูลตรง ๆ แล้วค่อยล็อกอิน — ไม่ผ่าน POST /customer/register
 *
 * ปลายทาง register ถูกจำกัด 10 ครั้ง/ชม./IP (registerLimiter) ไฟล์เทสต์ที่ต้องใช้ลูกค้าหลายคน
 * จะชนเพดานแล้วล้มด้วย 401 ตอนล็อกอิน (เพราะสมัครไม่ผ่าน) ซึ่งอ่านแล้วไม่รู้เลยว่าสาเหตุคือ
 * rate limit ใช้ตัวนี้เมื่อเทสต์ไม่ได้กำลังทดสอบตัวปลายทาง register เอง
 */
export async function createCustomerDirect(prefix: string) {
  const email = uniqueEmail(prefix);
  const password = "test-customer-battery-staple";
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      fullName: "Test Customer",
      role: "CUSTOMER",
      customerProfile: { create: { phone: "0812345678" } },
    },
  });

  const agent = request.agent(app);
  const res = await agent.post("/api/auth/customer/login").send({ email, password });
  if (res.status !== 200) {
    throw new Error(`failed to log in test customer: ${res.status} ${JSON.stringify(res.body)}`);
  }

  return { agent, userId: user.id, email, password };
}

/** คู่ cookie `name=value` แบบดิบจาก response ของการล็อกอิน สำหรับเทสต์ที่สร้าง header เอง */
export function sessionCookieFrom(res: request.Response, cookieName: string): string {
  const raw = (res.headers["set-cookie"] as unknown as string[]) ?? [];
  const hit = raw.find((c) => c.startsWith(`${cookieName}=`));
  if (!hit) throw new Error(`no ${cookieName} cookie in login response`);
  return hit.split(";")[0];
}
