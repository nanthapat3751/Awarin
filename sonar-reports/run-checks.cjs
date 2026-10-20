/**
 * รันชุดตรวจว่า "แก้ตาม SonarQube แล้วระบบยังใช้งานได้" แล้วเก็บผลจริงเป็นไฟล์ JSON
 * ให้ build-sonar-reports.cjs เอาไปพิมพ์ลงรายงานภาพรวม
 *
 * ต้องเปิดฐานข้อมูลทดสอบก่อน (docker compose up -d db) เพราะ jest ต่อฐานข้อมูลจริง
 * ใช้งาน: node sonar-reports/run-checks.cjs  →  sonar-reports/checks-<วันที่>.json
 *
 * ผลที่บันทึกคือ exit code + ตัวเลขที่เครื่องมือรายงานเอง ไม่ได้ตีความเพิ่ม
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const JEST_JSON = path.join(os.tmpdir(), `sonar-checks-jest-${process.pid}.json`);

const CHECKS = [
  { id: "shared-build", label: "build shared-types (CJS + ESM)", cwd: "packages/shared-types", cmd: "npm run build" },
  { id: "tsc-server", label: "ตรวจ type — server", cwd: "server", cmd: "npx tsc --noEmit -p ." },
  { id: "tsc-staff", label: "ตรวจ type — staff-app", cwd: "staff-app", cmd: "npx tsc --noEmit -p tsconfig.app.json" },
  { id: "tsc-client", label: "ตรวจ type — client-app", cwd: "client-app", cmd: "npx tsc --noEmit -p tsconfig.app.json" },
  { id: "tsc-shared", label: "ตรวจ type — shared-types", cwd: "packages/shared-types", cmd: "npx tsc --noEmit -p tsconfig.json" },
  { id: "build-staff", label: "build staff-app (tsc -b + vite build)", cwd: "staff-app", cmd: "npm run build" },
  { id: "build-client", label: "build client-app (tsc -b + vite build)", cwd: "client-app", cmd: "npm run build" },
  {
    id: "jest",
    label: "เทสต์อัตโนมัติ — server (Jest)",
    cwd: "server",
    cmd: `npx jest --json --outputFile="${JEST_JSON}"`,
  },
];

const results = [];
for (const c of CHECKS) {
  process.stdout.write(`${c.id} ... `);
  const started = Date.now();
  const r = spawnSync(c.cmd, { cwd: path.join(ROOT, c.cwd), shell: true, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const entry = {
    id: c.id,
    label: c.label,
    command: `(${c.cwd}) ${c.cmd.replace(JEST_JSON, "<tmp>.json")}`,
    exitCode: r.status,
    passed: r.status === 0,
    seconds: Math.round((Date.now() - started) / 1000),
  };
  if (c.id === "jest" && fs.existsSync(JEST_JSON)) {
    const j = JSON.parse(fs.readFileSync(JEST_JSON, "utf8"));
    entry.detail = {
      suites: j.numTotalTestSuites,
      suitesPassed: j.numPassedTestSuites,
      tests: j.numTotalTests,
      passed: j.numPassedTests,
      failed: j.numFailedTests,
      pending: j.numPendingTests,
    };
    entry.failures = j.testResults
      .flatMap((s) => s.assertionResults.filter((a) => a.status === "failed").map((a) => `${path.basename(s.name)} › ${a.fullName}`))
      .slice(0, 20);
    fs.rmSync(JEST_JSON, { force: true });
  }
  if (!entry.passed) entry.tail = `${r.stdout}\n${r.stderr}`.trim().split("\n").slice(-15).join("\n");
  results.push(entry);
  console.log(`${entry.passed ? "PASS" : "FAIL"} (${entry.seconds}s)${entry.detail ? ` ${entry.detail.passed}/${entry.detail.tests}` : ""}`);
}

const ranAt = new Date();
const stamp = ranAt.toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
const out = path.join(__dirname, `checks-${stamp}.json`);
fs.writeFileSync(
  out,
  JSON.stringify({ ranAt: ranAt.toISOString(), node: process.version, platform: `${os.type()} ${os.release()}`, results }, null, 1),
);
console.log(`saved ${path.basename(out)}`);
process.exit(results.every((r) => r.passed) ? 0 : 1);
