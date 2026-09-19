import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { assertSafeIdentifier, parsePgUrl, type PgTarget } from "./backup-plan";

/**
 * เรียก pg_dump / pg_restore ได้สองแบบ:
 *
 * 1. **มีโปรแกรมบนเครื่องที่รันเซิร์ฟเวอร์** (ติดตั้ง PostgreSQL client) — ต่อผ่าน TCP ด้วย URL
 * 2. **ใช้ตัวที่อยู่ในคอนเทนเนอร์ฐานข้อมูล** (`BACKUP_PG_DOCKER_CONTAINER`) — เครื่อง dev ตอนนี้
 *    ไม่มี pg_dump แต่คอนเทนเนอร์ postgres มีรุ่นตรงกับเซิร์ฟเวอร์พอดี (17) ซึ่งสำคัญ:
 *    pg_dump ต้องไม่เก่ากว่าเซิร์ฟเวอร์ ไม่งั้นปฏิเสธการสำรอง
 *
 * ไฟล์ไหลผ่าน stdin/stdout ทั้งสองแบบ จึงไม่ต้องคัดลอกไฟล์เข้าออกคอนเทนเนอร์
 */
export interface PgToolsConfig {
  /** ชื่อคอนเทนเนอร์ — ว่าง = ใช้โปรแกรมบนเครื่อง */
  dockerContainer: string | null;
  /** โฟลเดอร์ที่มี pg_dump/pg_restore (ว่าง = หาจาก PATH) */
  binDir: string | null;
}

function bin(cfg: PgToolsConfig, name: "pg_dump" | "pg_restore"): string {
  return cfg.binDir ? path.join(cfg.binDir, name) : name;
}

/** รันคำสั่งแล้วรอจบ — ส่ง stdin จากไฟล์/รับ stdout ลงไฟล์ได้ · stderr เก็บไว้ทำข้อความผิดพลาด */
function run(
  command: string,
  args: string[],
  opts: { env?: NodeJS.ProcessEnv; stdinFile?: string; stdoutFile?: string } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: opts.env ?? process.env,
      stdio: [opts.stdinFile ? "pipe" : "ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const out = opts.stdoutFile ? fs.createWriteStream(opts.stdoutFile) : null;
    if (out) child.stdout!.pipe(out);
    else child.stdout!.on("data", (d: Buffer) => (stdout += d.toString("utf8")));
    child.stderr!.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
    // เก็บตัวอ่านไฟล์ไว้ปิดเองตอนจบ — ถ้าโปรแกรมปลายทางเลิกอ่านก่อนถึงท้ายไฟล์ (pg_restore --list
    // อ่านแค่สารบัญ) handle ของไฟล์จะค้าง แล้ว Windows ไม่ยอมให้เปลี่ยนชื่อโฟลเดอร์ที่มีไฟล์นั้นอยู่
    const input = opts.stdinFile ? fs.createReadStream(opts.stdinFile) : null;
    if (input) {
      input.pipe(child.stdin!);
      // ปลายทางปิดท่อก่อน = EPIPE ซึ่งไม่ใช่ความผิดพลาดของเรา (ผลจริงดูจาก exit code)
      child.stdin!.on("error", () => undefined);
    }

    child.on("error", (err: NodeJS.ErrnoException) => {
      reject(
        err.code === "ENOENT"
          ? new Error(`ไม่พบโปรแกรม ${command} — ติดตั้ง PostgreSQL client หรือตั้ง BACKUP_PG_DOCKER_CONTAINER`)
          : err,
      );
    });
    child.on("close", async (code) => {
      input?.destroy();
      if (out) await new Promise((r) => out.end(r));
      if (code === 0) resolve(stdout);
      else reject(new Error(`${path.basename(command)} ล้มเหลว (exit ${code}): ${stderr.trim().slice(0, 500)}`));
    });
  });
}

/** รหัสผ่านส่งผ่านตัวแปรสภาพแวดล้อม ไม่ใส่ใน argv (argv ของโปรเซสมองเห็นได้จากผู้ใช้อื่นบนเครื่อง) */
function pgEnv(target: PgTarget): NodeJS.ProcessEnv {
  return { ...process.env, PGPASSWORD: target.password };
}

function connArgs(target: PgTarget): string[] {
  return ["-h", target.host, "-p", target.port, "-U", target.user, "-d", target.database];
}

/** pg_dump แบบ custom format (-Fc) → ไฟล์ · คืนเวอร์ชันของ pg_dump ที่ใช้ */
export async function dumpDatabase(cfg: PgToolsConfig, url: string, outFile: string): Promise<string> {
  const target = parsePgUrl(url);
  const user = assertSafeIdentifier(target.user, "ชื่อผู้ใช้ฐานข้อมูล");
  const db = assertSafeIdentifier(target.database, "ชื่อฐานข้อมูล");
  if (cfg.dockerContainer) {
    const c = cfg.dockerContainer;
    // ในคอนเทนเนอร์ต่อผ่าน unix socket (ไม่ต้องใช้รหัสผ่าน) — role ยังเป็น boq_backup ที่อ่านได้อย่างเดียว
    await run("docker", ["exec", c, "pg_dump", "-U", user, "-d", db, "-Fc"], { stdoutFile: outFile });
    return (await run("docker", ["exec", c, "pg_dump", "--version"])).trim();
  }
  await run(bin(cfg, "pg_dump"), [...connArgs(target), "-Fc", "-f", outFile], { env: pgEnv(target) });
  return (await run(bin(cfg, "pg_dump"), ["--version"])).trim();
}

/**
 * อ่านสารบัญของไฟล์สำรอง (pg_restore --list) — ไฟล์ที่เขียนไม่ครบหรือเสียจะอ่านไม่ผ่าน
 * คืนจำนวนตารางที่มีข้อมูลอยู่ในไฟล์
 */
export async function listDumpTables(cfg: PgToolsConfig, dumpFile: string): Promise<number> {
  const listing = cfg.dockerContainer
    ? await run("docker", ["exec", "-i", cfg.dockerContainer, "pg_restore", "--list"], { stdinFile: dumpFile })
    : await run(bin(cfg, "pg_restore"), ["--list", dumpFile]);
  return listing.split("\n").filter((line) => line.includes(" TABLE DATA ")).length;
}

/**
 * กู้ไฟล์สำรองลงฐานข้อมูลปลายทาง (ต้องใช้ role เจ้าของ — boq)
 * clean = ลบของเดิมที่ชื่อซ้ำก่อน (ใช้ตอนกู้ทับฐานข้อมูลที่มีตารางอยู่แล้ว)
 * ทั้งหมดอยู่ในทรานแซกชันเดียว (--single-transaction) พังกลางทาง = ไม่มีอะไรเปลี่ยน
 */
export async function restoreDump(
  cfg: PgToolsConfig,
  adminUrl: string,
  database: string,
  dumpFile: string,
  opts: { clean: boolean },
): Promise<void> {
  const target = { ...parsePgUrl(adminUrl), database };
  const user = assertSafeIdentifier(target.user, "ชื่อผู้ใช้ฐานข้อมูล");
  const db = assertSafeIdentifier(database, "ชื่อฐานข้อมูล");
  const flags = ["--single-transaction", "--exit-on-error", ...(opts.clean ? ["--clean", "--if-exists"] : [])];
  if (cfg.dockerContainer) {
    await run("docker", ["exec", "-i", cfg.dockerContainer, "pg_restore", "-U", user, "-d", db, ...flags], {
      stdinFile: dumpFile,
    });
    return;
  }
  await run(bin(cfg, "pg_restore"), [...connArgs(target), ...flags, dumpFile], { env: pgEnv(target) });
}
