#!/usr/bin/env node
/**
 * รันทั้งระบบแบบมี load balancer: API หลายตัว + nginx + สองแอปที่ชี้ไปหา LB
 *
 *   npm run dev:lb            API 2 ตัว (4001, 4002) หลัง nginx ที่ http://localhost:8080
 *
 * ต้องเปิด Docker (ฐานข้อมูล) ไว้ก่อน และปิด `dev:staff` / `dev:client` ที่เปิดค้างไว้ (ใช้พอร์ต 5173/5174
 * เดียวกัน — ตั้ง strictPort ไว้ ถ้าชนจะหยุดทันที ไม่หนีไปพอร์ตอื่นที่ CORS ไม่รับ) · API ตัวเดี่ยว 4000
 * ไม่ต้องปิด ไม่ชนกัน · Ctrl+C ปิดทุกตัว (ตัว nginx หยุดด้วย `docker compose stop lb`)
 *
 * จำนวน API ผูกกับรายการ server ใน docker/nginx/lb.conf — เพิ่มตัวต้องแก้ทั้งสองที่
 */
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LB_URL = "http://localhost:8080";
const API_PORTS = [4001, 4002];
const COLORS = ["\x1b[36m", "\x1b[35m", "\x1b[33m", "\x1b[32m", "\x1b[34m"];

const children = [];

function run(label, color, command, cwd, env) {
  const child = spawn(command, { cwd, env: { ...process.env, ...env }, shell: true, stdio: ["ignore", "pipe", "pipe"] });
  const prefix = `${color}[${label}]\x1b[0m `;
  const pipe = (stream, out) => {
    let buffered = "";
    stream.on("data", (chunk) => {
      buffered += chunk.toString();
      const lines = buffered.split(/\r?\n/);
      buffered = lines.pop() ?? "";
      for (const line of lines) out.write(prefix + line + "\n");
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on("exit", (code) => process.stdout.write(`${prefix}ปิดแล้ว (code ${code})\n`));
  children.push(child);
}

const lb = spawnSync("docker", ["compose", "--profile", "lb", "up", "-d", "lb"], { cwd: root, stdio: "inherit", shell: true });
if (lb.status !== 0) {
  console.error("เปิด nginx ไม่ได้ — Docker Desktop เปิดอยู่หรือยัง?");
  process.exit(1);
}

API_PORTS.forEach((port, i) => {
  run(`api-${i + 1}`, COLORS[i % COLORS.length], "npx tsx watch src/server.ts", path.join(root, "server"), {
    PORT: String(port),
    INSTANCE_ID: `api-${i + 1}`,
    // คำขอผ่าน nginx หนึ่ง hop — ไม่ตั้ง req.ip จะเป็นไอพีของ nginx ทุกคำขอ (ทุกคนแชร์เพดาน rate limit เดียว)
    TRUST_PROXY: "1",
    PUBLIC_UPLOAD_BASE_URL: LB_URL,
    SHUTDOWN_DRAIN_MS: "0",
    // ตัวละ 10 การเชื่อมต่อ — ค่าเริ่มต้นของ Prisma คิดจากคอร์ของเครื่อง หลายตัวบนเครื่องเดียวรวมกันเกินเพดาน DB ได้
    DATABASE_POOL_SIZE: "10",
  });
});
run("staff", COLORS[API_PORTS.length % COLORS.length], "npm run dev -w staff-app -- --strictPort", root, { VITE_API_BASE_URL: LB_URL });
run("client", COLORS[(API_PORTS.length + 1) % COLORS.length], "npm run dev -w client-app -- --strictPort", root, { VITE_API_BASE_URL: LB_URL });

console.log(`\nLB: ${LB_URL}  ·  API: ${API_PORTS.map((p) => `:${p}`).join(", ")}  ·  พนักงาน: http://localhost:5173  ·  ลูกค้า: http://localhost:5174\n`);

function stopAll() {
  for (const child of children) {
    if (child.exitCode !== null) continue;
    // shell:true บน Windows = ต้องฆ่าทั้งต้นไม้ ไม่งั้น tsx/vite ที่อยู่ข้างใต้ค้างถือพอร์ตไว้
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill("SIGTERM");
  }
  process.exit(0);
}
process.on("SIGINT", stopAll);
process.on("SIGTERM", stopAll);
