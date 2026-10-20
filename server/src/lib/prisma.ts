import os from "node:os";

import { PrismaClient } from "@prisma/client";

// ตัวแอปตอนรันจะเชื่อมต่อผ่าน role `boq_app` ที่จำกัดสิทธิ์เสมอ ไม่ใช่ superuser ที่ใช้ทำ
// migration (DATABASE_URL) — ดู prisma/init/01-create-runtime-role.sql และ prisma/seed.ts
// จำเป็นต้องมี ไม่มี fallback: การเงียบ ๆ ถอยไปใช้การเชื่อมต่อแบบ superuser จะทำลาย
// จุดประสงค์ทั้งหมดของการแยกสิทธิ์
const runtimeUrl = process.env.DATABASE_URL_RUNTIME;
if (!runtimeUrl) {
  throw new Error(
    "DATABASE_URL_RUNTIME is not set — the app must connect via the restricted runtime role, " +
      "not the migration superuser. See .env.example.",
  );
}

/**
 * จำนวนการเชื่อมต่อ DB ต่อ API หนึ่งตัว
 *
 * ค่าเริ่มต้นของ Prisma = CPU × 2 + 1 ซึ่งคิดจากเครื่องตัวเดียว — API 4 ตัวบนเครื่อง 16 คอร์จะขอ
 * 4 × 33 = 132 ชนเพดาน max_connections 100 ของ Postgres แล้วคำขอเริ่มล้มแบบสุ่ม
 * ตั้ง DATABASE_POOL_SIZE ให้ (จำนวนตัว × ค่านี้) + สำรองข้อมูล/migration/pgAdmin ไม่เกินเพดาน
 * ใส่ connection_limit ใน URL เองก็ได้ — ค่าใน URL ชนะ
 */
export function withPoolSize(url: string, poolSize: string | undefined): string {
  if (!poolSize) return url;
  const parsed = new URL(url);
  if (parsed.searchParams.has("connection_limit")) return url;
  const n = Number(poolSize);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`DATABASE_POOL_SIZE ต้องเป็นจำนวนเต็มบวก (ได้ "${poolSize}")`);
  }
  parsed.searchParams.set("connection_limit", String(n));
  return parsed.toString();
}

const effectiveUrl = withPoolSize(runtimeUrl, process.env.DATABASE_POOL_SIZE);

/** ขนาดพูลที่ตั้งไว้ · null = ใช้ค่าเริ่มต้นของ Prisma (คิดจากคอร์จริงของเครื่อง เราประมาณจากคอร์ทั้งหมดได้เท่านั้น) */
const explicitPoolSize = Number(new URL(effectiveUrl).searchParams.get("connection_limit")) || null;

export const prisma = new PrismaClient({ datasources: { db: { url: effectiveUrl } } });

/**
 * เตือนตอนบูตถ้า API ตัวนี้เปิดพูลเต็มแล้วจะเกิน 80% ของ max_connections — เห็นตั้งแต่ตอนเพิ่มเครื่อง
 * ไม่ใช่ตอนลูกค้าเจอ error ทีหลัง (นับจากที่ต่ออยู่ตอนนี้ ซึ่งรวม API ตัวอื่นที่เปิดอยู่แล้ว)
 */
export async function reportDatabasePool(): Promise<void> {
  try {
    const [row] = await prisma.$queryRaw<{ max: number; used: number }[]>`
      SELECT current_setting('max_connections')::int AS max, (SELECT count(*)::int FROM pg_stat_activity) AS used`;
    // ไม่ได้ตั้ง = ใช้ค่าสูงสุดที่เป็นไปได้ของสูตร Prisma ในการเตือน (ประเมินสูงไว้ก่อนดีกว่าต่ำ)
    const pool = explicitPoolSize ?? os.availableParallelism() * 2 + 1;
    const label = explicitPoolSize ? `${explicitPoolSize}` : `ค่าเริ่มต้นของ Prisma (ไม่เกิน ${pool})`;
    const projected = row.used + pool;
    const line = `DB: พูล ${label} การเชื่อมต่อ · ใช้อยู่ ${row.used}/${row.max}`;
    if (projected > row.max * 0.8) {
      console.warn(`${line} — ถ้าตัวนี้ใช้เต็มพูลจะเป็น ${projected} เกิน 80% ของเพดาน ตั้ง DATABASE_POOL_SIZE ให้เล็กลง`);
    } else {
      console.log(line);
    }
  } catch (err) {
    console.warn("DB: เช็คจำนวนการเชื่อมต่อไม่ได้:", err instanceof Error ? err.message : err);
  }
}
