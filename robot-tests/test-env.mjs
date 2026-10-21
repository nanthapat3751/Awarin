#!/usr/bin/env node
/**
 * เปิดระบบ "ชุดทดสอบ" สำหรับ Robot Framework — แยกจาก dev server ทุกอย่าง
 *
 *   API        http://localhost:4100   ฐานข้อมูลทดสอบ (DATABASE_URL_TEST) · เมลโหมด console (ไม่ส่งจริง พิมพ์ลง log)
 *   หลังบ้าน    http://localhost:5183   staff-app ชี้ API 4100
 *   หน้าบ้าน    http://localhost:5184   client-app ชี้ API 4100
 *
 * dev server ของจริง (4000/5173/5174) เปิดค้างไว้พร้อมกันได้ ไม่ชนกัน
 *
 *   node robot-tests/test-env.mjs          เปิดค้างไว้ (Ctrl+C เพื่อปิด)
 *   node robot-tests/test-env.mjs --run    เปิด → seed → รัน robot ทั้งชุด → ปิด
 *
 * ทำไมต้องแยก: dev server ส่งเมลจริงผ่าน Gmail และเทสต์ต้องสร้างข้อมูล/ใส่รหัสผิดซ้ำ ๆ
 * ซึ่งไม่ควรไปปนกับข้อมูลที่ใช้ทำงานอยู่
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const results = path.join(here, "results");
fs.mkdirSync(results, { recursive: true });

const API_PORT = 4100;
const STAFF_PORT = 5183;
const CLIENT_PORT = 5184;
const tmpFiles = path.join(os.tmpdir(), "systemboq-robot-files");

function loadDotEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const serverEnv = loadDotEnv(path.join(root, "server", ".env"));
if (!serverEnv.DATABASE_URL_TEST || !serverEnv.DATABASE_URL_TEST_RUNTIME) {
  console.error("ไม่พบ DATABASE_URL_TEST ใน server/.env — ไม่เปิดระบบทดสอบเพื่อไม่ให้ไปแตะฐานข้อมูล dev");
  process.exit(1);
}

const apiEnv = {
  ...process.env,
  PORT: String(API_PORT),
  DATABASE_URL: serverEnv.DATABASE_URL_TEST,
  DATABASE_URL_RUNTIME: serverEnv.DATABASE_URL_TEST_RUNTIME,
  // ไม่ส่งเมลออกจริงเด็ดขาด — พิมพ์เนื้อเมลลง results/env-api*.log แทน ชุดทดสอบอ่านรหัสยืนยัน/ลิงก์ตั้งรหัสจากตรงนั้น
  // (ลืมรหัสผ่าน · สมัครสมาชิก · เพดานส่งเมล) ด้วย ApiHelpers.Last Mail To
  MAIL_TRANSPORT: "console",
  RATE_LIMIT_STORE: "memory",
  EMAIL_MX_CHECK: "off",
  BACKUP_ENABLED: "false",
  GEOIP_AUTO_UPDATE: "false",
  TURNSTILE_SECRET_KEY: "",
  INSTANCE_ID: "robot",
  // server/.env ต่อ SlipOK จริงไว้ (มีโควตาจำกัด) — ชุดทดสอบต้องใช้ตัวจำลองที่อ่านผลจากชื่อไฟล์เสมอ
  SLIP_PROVIDER: "mock",
  // เชื่อ X-Forwarded-For เฉพาะคำขอจากเครื่องตัวเอง (เหมือนมี nginx อยู่หน้า API) — ชุดทดสอบ API ใช้ไอพีจำลอง
  // ต่อเคส เพดานเข้าสู่ระบบ (20 ครั้ง/15 นาที/ไอพี) จึงนับแยกกัน · เบราว์เซอร์ของชุดหน้าจอไม่ส่ง header นี้
  TRUST_PROXY: "loopback",
  SLIPOK_API_KEY: "",
  SLIPOK_BRANCH_ID: "",
  UPLOADS_DIR: path.join(tmpFiles, "uploads"),
  PRIVATE_UPLOADS_DIR: path.join(tmpFiles, "private-uploads"),
  CORS_ORIGIN_STAFF: `http://localhost:${STAFF_PORT}`,
  CORS_ORIGIN_CLIENT: `http://localhost:${CLIENT_PORT}`,
  STAFF_BASE_URL: `http://localhost:${STAFF_PORT}`,
  CLIENT_BASE_URL: `http://localhost:${CLIENT_PORT}`,
};
const viteEnv = { ...process.env, VITE_API_BASE_URL: `http://localhost:${API_PORT}` };

const children = [];
function start(name, cwd, args, env) {
  const log = fs.openSync(path.join(results, `env-${name}.log`), "w");
  const child = spawn("npx", args, { cwd, env, stdio: ["ignore", log, log], shell: true, windowsHide: true });
  children.push(child);
  return child;
}

function stop(c) {
  if (c.exitCode !== null) return;
  // Windows: ต้องฆ่าทั้งต้นไม้ ไม่งั้น tsx/vite ลูกยังถือพอร์ตอยู่
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(c.pid), "/T", "/F"], { stdio: "ignore" });
  else c.kill("SIGTERM");
}

function stopAll() {
  for (const c of children) stop(c);
}

/** API ตัวใหม่ = ตัวนับเพดานเข้าสู่ระบบ (20 ครั้ง/15 นาที ในหน่วยความจำ) เริ่มที่ศูนย์ */
let api = null;
async function startApi(label = "api") {
  if (api) {
    stop(api);
    await new Promise((r) => setTimeout(r, 1500));
  }
  api = start(label, path.join(root, "server"), ["tsx", "src/server.ts"], apiEnv);
  await waitFor(`http://localhost:${API_PORT}/api/health`, "API");
}

async function waitFor(url, label, timeoutMs = 90_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const res = await fetch(url);
      if (res.ok) return console.log(`  ✓ ${label} ${url}`);
    } catch {
      /* ยังไม่ขึ้น */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${label} ไม่ขึ้นภายใน ${timeoutMs / 1000} วินาที — ดู robot-tests/results/env-*.log`);
}

process.on("SIGINT", () => {
  stopAll();
  process.exit(130);
});

console.log("seed ข้อมูลทดสอบ…");
const seed = spawnSync("npx", ["tsx", "../robot-tests/seed/seed-robot.ts"], {
  cwd: path.join(root, "server"),
  stdio: "inherit",
  shell: true,
});
if (seed.status !== 0) process.exit(seed.status ?? 1);

// ชุด API: บัญชีรายชื่อทุกเส้นจากโค้ดปัจจุบัน → สร้างเคสสิทธิ์ใหม่ (เส้นที่เพิ่ม/ลบจะตามมาเองทุกรอบ)
console.log("ทำบัญชีรายชื่อ API + สร้างเคสสิทธิ์…");
const inv = spawnSync("npx", ["tsx", "../robot-tests/api/tools/inventory.ts"], { cwd: path.join(root, "server"), stdio: "inherit", shell: true });
if (inv.status !== 0) process.exit(inv.status ?? 1);
const pol = spawnSync("python", ["-X", "utf8", path.join(here, "api", "tools", "policy.py")], { cwd: root, stdio: "inherit" });
if (pol.status !== 0) process.exit(pol.status ?? 1);

console.log("เปิดระบบทดสอบ…");
start("staff", path.join(root, "staff-app"), ["vite", "--port", String(STAFF_PORT), "--strictPort"], viteEnv);
start("client", path.join(root, "client-app"), ["vite", "--port", String(CLIENT_PORT), "--strictPort"], viteEnv);

try {
  await startApi();
  await waitFor(`http://localhost:${STAFF_PORT}/`, "หลังบ้าน");
  await waitFor(`http://localhost:${CLIENT_PORT}/`, "หน้าบ้าน");
} catch (err) {
  console.error(err.message);
  stopAll();
  process.exit(1);
}

if (!process.argv.includes("--run")) {
  console.log("พร้อมแล้ว — รัน: python -m robot -d robot-tests/results robot-tests   (Ctrl+C เพื่อปิด)");
} else {
  // รันทีละชุด และเปิด API ใหม่ก่อนแต่ละชุดถัดไป: ทั้งหมดเข้าสู่ระบบเกิน 20 ครั้ง ถ้ารันรวดเดียวจะชนเพดาน
  // ลำดับสำคัญ — ฝั่งหลังบ้านยืนยันการแจ้งโอนที่ฝั่งหน้าบ้านส่งไว้ (ส่วนชำระเงิน) · ชุด API ใช้สัญญาของตัวเอง
  // ชุดหน้าจอแบ่งเป็นกลุ่ม (ชุดเดิม 01–04 / ชุดช่องว่าง UI-GAP) เพราะรวมกันเข้าสู่ระบบเกิน 20 ครั้ง — ทุกกลุ่มตั้งชื่อชุด
  // บนสุดเป็น Frontend/Backend เหมือนเดิม รายงาน (build_report.py) จึงรวมกลุ่มที่ชื่อเดียวกันเป็นฝั่งเดียวกัน
  const files = (side, from, to) =>
    fs.readdirSync(path.join(here, side))
      .filter((f) => /^\d\d_.*\.robot$/.test(f) && Number(f.slice(0, 2)) >= from && Number(f.slice(0, 2)) <= to)
      .sort()
      .map((f) => path.join(here, side, f));
  const phases = [
    { side: "frontend", out: "frontend", name: "Frontend", paths: files("frontend", 1, 4) },
    { side: "frontend", out: "frontend-gap", name: "Frontend", paths: files("frontend", 5, 99) },
    { side: "backend", out: "backend", name: "Backend", paths: files("backend", 1, 4) },
    { side: "backend", out: "backend-gap-a", name: "Backend", paths: files("backend", 5, 9) },
    { side: "backend", out: "backend-gap-b", name: "Backend", paths: files("backend", 10, 99) },
    { side: "api", out: "api", name: "Api", paths: [path.join(here, "api")] },
  ].filter((p) => p.paths.length > 0);
  let failed = 0;
  for (const [i, phase] of phases.entries()) {
    if (i > 0) await startApi(`api-${phase.out}`);
    const run = spawnSync(
      "python",
      ["-X", "utf8", "-m", "robot", "--name", phase.name, "--outputdir", results, "--output", `output-${phase.out}.xml`,
        "--log", "NONE", "--report", "NONE", ...phase.paths],
      { cwd: root, stdio: "inherit" },
    );
    if (run.status !== 0) failed += run.status ?? 1;
  }
  const sides = phases.map((p) => p.out);
  stopAll();
  // รวมผลสองฝั่งเป็นรายงานเดียว (output.xml/log.html/report.html) ให้ build_report.py อ่าน
  const merge = spawnSync(
    "python",
    ["-X", "utf8", "-m", "robot.rebot", "--name", "SystemBOQ", "--outputdir", results, "--output", "output.xml",
      ...sides.map((side) => path.join(results, `output-${side}.xml`))],
    { cwd: root, stdio: "inherit" },
  );
  process.exit(failed || (merge.status ?? 1));
}
