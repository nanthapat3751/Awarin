// แปลงผล jest (--json) เป็น annotation ของ GitHub Actions — เห็นชื่อเทสต์ที่พัง + ข้อความ error
// ในหน้าสรุปของรอบ (และอ่านผ่าน API ได้) โดยไม่ต้องเปิด log ยาว ๆ
//   node .github/scripts/jest-annotate.cjs server/jest-results.json
const fs = require("node:fs");
const path = require("node:path");

const file = process.argv[2];
if (!fs.existsSync(file)) {
  console.log(`::error::ไม่มีไฟล์ผลเทสต์ ${file} — jest อาจล้มก่อนเริ่มรัน (ดู log ขั้นเทสต์)`);
  process.exit(0);
}
const result = JSON.parse(fs.readFileSync(file, "utf8"));
const strip = (s) => String(s ?? "").replace(/\u001b\[[0-9;]*m/g, "");
const oneLine = (s, max) => strip(s).split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 8).join(" ⏎ ").slice(0, max);
const rel = (p) => path.relative(process.cwd(), p).split(path.sep).join("/");

let count = 0;
for (const suite of result.testResults) {
  const failed = suite.assertionResults.filter((a) => a.status === "failed");
  if (suite.status === "failed" && failed.length === 0) {
    // ทั้งไฟล์รันไม่ขึ้น หรือพังใน beforeAll/afterAll
    console.log(`::error file=${rel(suite.name)}::ทั้งไฟล์พัง — ${oneLine(suite.message, 900)}`);
    count++;
  }
  for (const a of failed) {
    console.log(`::error file=${rel(suite.name)}::${a.fullName} — ${oneLine(a.failureMessages[0], 600)}`);
    count++;
  }
}
console.log(`สรุป: ${result.numFailedTests} เคสพัง จาก ${result.numTotalTests} · ${result.numFailedTestSuites} ไฟล์ · annotation ${count}`);
