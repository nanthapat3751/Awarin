import request from "supertest";

import { app } from "../../src/app";
import { hashPassword } from "../../src/lib/password";
import { prisma } from "../../src/lib/prisma";

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

/** ชื่อผู้ใช้ของพนักงานในเทสต์ — ต้องไม่ซ้ำกันข้ามไฟล์ที่รันพร้อมกัน และต้องผ่าน regex ของ createStaffSchema */
function uniqueUsername(prefix: string): string {
  const safe = prefix.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "");
  return `${safe}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * พนักงานล็อกอินด้วย username ไม่ใช่อีเมล — แต่ยังคืน `email` ไว้ด้วยเพราะบางเทสต์ใช้อ้างบัญชี
 * (บัญชีพนักงานใหม่ในระบบจริงไม่มีอีเมลแล้ว ที่นี่ใส่ไว้เพื่อให้เทสต์เดิมที่ค้นด้วยอีเมลยังทำงานได้)
 */
async function createAndLoginStaff(prefix: string, role: "OWNER" | "ADMIN") {
  const email = uniqueEmail(prefix);
  const username = uniqueUsername(prefix);
  const password = "Quiet-lantern-42-riverbank";
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      username,
      passwordHash,
      fullName: role === "OWNER" ? "Test Owner" : "Test Admin",
      role,
    },
  });

  const agent = request.agent(app);
  const res = await agent.post("/api/auth/staff/login").send({ username, password });
  if (res.status !== 200) {
    throw new Error(`failed to log in test ${role}: ${res.status} ${JSON.stringify(res.body)}`);
  }

  return { agent, userId: user.id, email, username, password };
}

export async function createAndLoginOwner(prefix: string) {
  return createAndLoginStaff(prefix, "OWNER");
}

export async function createAndLoginAdmin(prefix: string) {
  return createAndLoginStaff(prefix, "ADMIN");
}

export async function createAndLoginCustomer(prefix: string) {
  const email = uniqueEmail(prefix);
  const password = "Amber-thicket-71-woodgrain";

  const agent = request.agent(app);
  await agent
    .post("/api/auth/customer/register")
    .send({ email, password, fullName: "Test Customer", phone: "0812345678" });
  // สมัครแล้วยังล็อกอินไม่ได้จนกว่าจะยืนยันอีเมล — ที่นี่ข้ามขั้นนั้นด้วยการเขียนลงฐานข้อมูลตรง ๆ
  // เพราะ helper นี้มีหน้าที่ "ขอลูกค้าที่ล็อกอินแล้วหนึ่งคน" ไม่ได้ทดสอบตัวการยืนยัน
  // (ตัวการยืนยันมีเทสต์ของตัวเองที่ email-verification.test.ts ซึ่งเดินครบทุกขั้นจริง)
  await prisma.user.update({ where: { email }, data: { emailVerifiedAt: new Date() } });
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
  const password = "Amber-thicket-71-woodgrain";
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      fullName: "Test Customer",
      role: "CUSTOMER",
      // ลูกค้าที่ยังไม่ยืนยันอีเมลล็อกอินไม่ได้ — helper นี้เลียนแบบบัญชีที่ทีมงานสร้างให้
      // ซึ่งถือว่ายืนยันแล้ว เทสต์ที่ต้องการทดสอบตัวการยืนยันเองอยู่ที่ email-verification.test.ts
      emailVerifiedAt: new Date(),
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
