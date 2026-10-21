/**
 * แก้ path ในไฟล์ coverage ของ jest ให้ SonarScanner (ที่รันใน docker) หาไฟล์เจอ
 *
 * jest เขียน path เทียบกับโฟลเดอร์ server แบบ Windows ("SF:src\app.ts") แต่ตัวสแกนมองโปรเจกต์จาก
 * โฟลเดอร์รากที่ /usr/src — ต้องเป็น "SF:server/src/app.ts" ไม่งั้น SonarQube อ่านไฟล์ได้แต่จับคู่
 * กับไฟล์โค้ดไม่ได้เลย coverage จึงขึ้น 0% (สาเหตุของตัวเลข 0% ในการสแกนรอบที่ 1)
 *
 * ใช้งาน (จากโฟลเดอร์ราก หลังรัน jest --coverage ใน server/):
 *   node sonar-reports/fix-lcov-paths.cjs
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const LCOV = path.join(ROOT, "server", "coverage", "lcov.info");

const text = fs.readFileSync(LCOV, "utf8");
let changed = 0;
const fixed = text.replace(/^SF:(.+)$/gm, (_line, file) => {
  const abs = path.isAbsolute(file) ? file : path.join(ROOT, "server", file);
  const rel = path.relative(ROOT, abs).split(path.sep).join("/");
  changed += 1;
  return `SF:${rel}`;
});
fs.writeFileSync(LCOV, fixed);

const missing = [...fixed.matchAll(/^SF:(.+)$/gm)].map((m) => m[1]).filter((f) => !fs.existsSync(path.join(ROOT, f)));
console.log(`แก้ path ${changed} ไฟล์ใน ${path.relative(ROOT, LCOV)}`);
if (missing.length > 0) {
  console.error(`หาไฟล์ไม่เจอ ${missing.length} ไฟล์ เช่น ${missing.slice(0, 3).join(", ")}`);
  process.exit(1);
}
