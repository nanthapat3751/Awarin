/**
 * บัญชีรายชื่อ API ทุกเส้นจากแอปที่รันจริง (ไม่ใช่เดาจากข้อความในไฟล์)
 *
 *   cd server && npx tsx ../robot-tests/api/tools/inventory.ts
 *
 * เดิน router ของ Express ทีละชั้น ได้ method + path เต็ม (รวม path ที่ mount ใน app.ts)
 * และตัวกั้นสิทธิ์ที่อยู่หน้าเส้นนั้นจริง (router.use ก่อนหน้า + middleware ของเส้นเอง)
 * ตัวกั้นบทบาท (requireRole) เป็นฟังก์ชันไม่มีชื่อ จึงลองเรียกด้วยผู้ใช้จำลองทีละบทบาทเพื่อดูว่ายอมบทบาทไหน
 *
 * ผลลัพธ์ = "โค้ดประกาศไว้ว่าอย่างไร" (robot-tests/api/routes.json) — ค่าที่เทสต์คาดหวังมาจากนโยบายใน
 * api/tools/policy.py ซึ่งตั้งจากหลักการ แล้วเทียบกับไฟล์นี้ ไม่ได้ลอกโค้ดมาเป็นคำตอบ
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "..", "..", "..", "server", ".env"), quiet: true });
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.DATABASE_URL_RUNTIME = process.env.DATABASE_URL_TEST_RUNTIME;
process.env.MAIL_TRANSPORT = "silent";
process.env.RATE_LIMIT_STORE = "memory";
process.env.SLIP_PROVIDER = "mock";
process.env.BACKUP_ENABLED = "false";

type Layer = {
  name: string;
  handle: ((...args: unknown[]) => unknown) & { stack?: Layer[] };
  route?: { path: string; methods: Record<string, boolean>; stack: Layer[] };
};

const ROLES = ["OWNER", "ADMIN", "CUSTOMER"] as const;

/** ตัวกั้นบทบาท: ลองเรียกด้วยผู้ใช้แต่ละบทบาท ดูว่าบทบาทไหนผ่าน (เรียก next) */
function probeRoles(fn: Layer["handle"]): string[] {
  const allowed: string[] = [];
  for (const role of ROLES) {
    let passed = false;
    const res = { status: () => res, json: () => res };
    fn({ user: { role } }, res, () => (passed = true));
    if (passed) allowed.push(role);
  }
  return allowed;
}

function classify(layer: Layer): { kind: "auth" | "role" | "other"; name: string; roles?: string[] } {
  const src = String(layer.handle);
  if (layer.handle.name === "requireAuth") return { kind: "auth", name: "requireAuth" };
  if (/roles\.includes\(req\.user\.role\)/.test(src)) return { kind: "role", name: "requireRole", roles: probeRoles(layer.handle) };
  return { kind: "other", name: layer.handle.name || "anonymous" };
}

async function main() {
  const { app } = (await import("../../../server/src/app")) as { app: { _router: { stack: Layer[] } } };

  // path ที่ mount แต่ละ router — อ่านจาก app.ts แล้วจับคู่กับ object ของ router ที่ import มาจริง
  const appSrc = fs.readFileSync(path.resolve(__dirname, "..", "..", "..", "server", "src", "app.ts"), "utf8");
  const mounts = [...appSrc.matchAll(/app\.use\(\s*"([^"]+)",\s*(\w+Router)\s*\)/g)].map((m) => ({ mount: m[1], name: m[2] }));
  const imports = [...appSrc.matchAll(/import \{([^}]+)\} from "(\.\/modules\/[^"]+)"/g)];
  const routerObjects = new Map<unknown, string>();
  for (const imp of imports) {
    const mod = await import(pathToFileURL(path.resolve(__dirname, "..", "..", "..", "server", "src", `${imp[2]}.ts`)).href);
    for (const n of imp[1].split(",").map((s) => s.trim())) if (n.endsWith("Router")) routerObjects.set(mod[n], n);
  }

  const routes: object[] = [];
  const seenRouters = new Set<string>();
  for (const layer of app._router.stack) {
    if (layer.route) {
      // เส้นที่ประกาศตรงบน app (เช่น /api/health)
      for (const method of Object.keys(layer.route.methods)) {
        routes.push({ method: method.toUpperCase(), path: layer.route.path, router: "app", auth: false, roles: null, middlewares: [] });
      }
      continue;
    }
    if (layer.name !== "router") continue;
    const routerName = routerObjects.get(layer.handle);
    if (!routerName) continue;
    const mountList = mounts.filter((m) => m.name === routerName);
    for (const { mount } of mountList) {
      const key = `${mount}|${routerName}`;
      if (seenRouters.has(key)) continue;
      seenRouters.add(key);
      const guards: ReturnType<typeof classify>[] = [];
      for (const inner of layer.handle.stack ?? []) {
        if (!inner.route) {
          guards.push(classify(inner));
          continue;
        }
        const own = inner.route.stack.slice(0, -1).map(classify);
        const all = [...guards, ...own];
        const roleGuards = all.filter((g) => g.kind === "role");
        // บทบาทที่ผ่านได้ = ผ่านตัวกั้นบทบาททุกตัว (หลายตัวซ้อน = ตัดกัน)
        let roles: string[] | null = null;
        for (const g of roleGuards) roles = roles ? roles.filter((r) => g.roles!.includes(r)) : [...g.roles!];
        const auth = all.some((g) => g.kind === "auth") || roles !== null;
        for (const method of Object.keys(inner.route.methods)) {
          if (method === "_all") continue;
          const full = (mount + (inner.route.path === "/" ? "" : inner.route.path)).replace(/\/+$/, "") || "/";
          routes.push({
            method: method.toUpperCase(),
            path: full,
            router: routerName,
            auth,
            roles,
            middlewares: all.filter((g) => g.kind === "other").map((g) => g.name),
          });
        }
      }
    }
  }

  routes.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const out = path.resolve(__dirname, "..", "routes.json");
  fs.writeFileSync(out, JSON.stringify(routes, null, 1));
  const byRouter = new Map<string, number>();
  for (const r of routes as { router: string }[]) byRouter.set(r.router, (byRouter.get(r.router) ?? 0) + 1);
  console.log(`routes: ${routes.length} · routers: ${byRouter.size} → ${out}`);
  const { prisma } = await import("../../../server/src/lib/prisma");
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
