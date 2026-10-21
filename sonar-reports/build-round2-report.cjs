/**
 * รายงาน SonarQube รอบที่ 2 = หน้าปกภาษาไทย (ไฟล์นี้สร้าง) + รายงานจากสคริปต์ของคู่มือ (ไม่แก้สักบรรทัด)
 *
 * ขั้นตอนตามคู่มือ หัวข้อ 7 ยังทำเหมือนเดิมทุกอย่าง:
 *   python D:/SonarQube/sonar_report.py --host http://localhost:9000 --project systemboq --token <TOKEN>
 *          --output sonar-reports/systemboq_round2_report.pdf
 * สคริปต์ของคู่มือไม่มีช่องให้เขียนว่า "รอบที่ 2" หรือบอกว่ายกเว้นอะไรจาก coverage จึงเติมหน้าปก
 * ไว้ด้านหน้าแทน แล้วต่อหน้าของรายงานคู่มือตามหลังแบบไม่แตะเนื้อหา → sonar-report-round2.pdf
 *
 * ใช้งาน (จากโฟลเดอร์ราก):
 *   SONAR_TOKEN=<token> node sonar-reports/build-round2-report.cjs --scanned-at <ISO> --tests "1,537/1,537"
 *     [--e2e "457/457 เคส"] [--fixed-from 443]   (ส่วน "สิ่งที่ทำก่อนสแกนรอบนี้" ขึ้นเมื่อใส่สองตัวนี้)
 * ตัวเลขทุกตัวบนหน้าปกดึงจาก SonarQube ตอนรัน (ยกเว้นวันเวลาสแกนกับผลเทสต์ที่ส่งเข้ามา) และเซฟไว้ที่
 * sonar-reports/round2-snapshot.json เป็นหลักฐาน — SonarQube ลบข้อที่ปิดแล้วทิ้งหลัง 30 วัน
 */
const fs = require("node:fs");
const path = require("node:path");
const puppeteer = require("puppeteer");
const { PDFDocument } = require("pdf-lib");

const ROOT = path.resolve(__dirname, "..");
const HOST = (process.env.SONAR_HOST || "http://localhost:9000").replace(/\/+$/, "");
const PROJECT = process.env.SONAR_PROJECT || "systemboq";
const TOKEN = process.env.SONAR_TOKEN || "";
const MANUAL_PDF = path.join(__dirname, "systemboq_round2_report.pdf");
const OUT_PDF = path.join(__dirname, "sonar-report-round2.pdf");
const SNAPSHOT = path.join(__dirname, "round2-snapshot.json");

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : null;
};

/** ส่วนของโปรเจกต์ — ตรงกับ sonar.sources และ sonar.coverage.exclusions ใน sonar-project.properties */
const PARTS = [
  { dir: "server/src", label: "server/src — API (Express + Prisma)", excluded: null },
  { dir: "packages/shared-types/src", label: "packages/shared-types — กติกากลางที่ server กับหน้าจอใช้ร่วมกัน", excluded: null },
  { dir: "staff-app/src", label: "staff-app — หน้าจอพนักงาน (React)", excluded: "หน้าจอ — ทดสอบผ่านเบราว์เซอร์ด้วย Robot Framework" },
  { dir: "client-app/src", label: "client-app — หน้าจอลูกค้า (React)", excluded: "หน้าจอ — ทดสอบผ่านเบราว์เซอร์ด้วย Robot Framework" },
  { dir: "server/scripts", label: "server/scripts — สคริปต์สั่งรันเอง", excluded: "สคริปต์บรรทัดคำสั่ง ไม่ใช่โค้ดที่ระบบเรียกตอนทำงาน" },
  { dir: "server/prisma", label: "server/prisma — seed / ตั้งค่าฐานข้อมูลทดสอบ", excluded: "สคริปต์บรรทัดคำสั่ง ไม่ใช่โค้ดที่ระบบเรียกตอนทำงาน" },
];

async function api(q) {
  const res = await fetch(`${HOST}${q}`, { headers: { Authorization: "Basic " + Buffer.from(`${TOKEN}:`).toString("base64") } });
  if (!res.ok) throw new Error(`${res.status} ${q}`);
  return res.json();
}

async function measures(component, keys) {
  const d = await api(`/api/measures/component?component=${encodeURIComponent(component)}&metricKeys=${keys.join(",")}`);
  return Object.fromEntries(d.component.measures.map((m) => [m.metric, m.value ?? m.period?.value ?? null]));
}

async function collect() {
  if (!TOKEN) throw new Error("ต้องตั้ง SONAR_TOKEN");
  const keys = [
    "coverage", "line_coverage", "branch_coverage", "lines_to_cover", "uncovered_lines",
    "conditions_to_cover", "uncovered_conditions", "ncloc", "bugs", "vulnerabilities", "code_smells",
    "security_hotspots", "duplicated_lines_density", "reliability_rating", "security_rating", "sqale_rating",
    "violations", "new_violations", "new_coverage", "alert_status",
  ];
  const project = await measures(PROJECT, keys);
  const parts = [];
  for (const p of PARTS) {
    parts.push({ ...p, m: await measures(`${PROJECT}:${p.dir}`, ["ncloc", "coverage", "lines_to_cover", "uncovered_lines", "violations"]) });
  }
  const gate = (await api(`/api/qualitygates/project_status?projectKey=${PROJECT}`)).projectStatus;
  const open = await api(`/api/issues/search?componentKeys=${PROJECT}&resolved=false&ps=1`);
  const all = await api(`/api/issues/search?componentKeys=${PROJECT}&ps=1`);
  const status = await api("/api/system/status");
  return {
    fetchedAt: new Date().toISOString(),
    scannedAt: arg("--scanned-at"),
    tests: arg("--tests"),
    e2e: arg("--e2e"),
    fixedFrom: arg("--fixed-from"),
    serverVersion: status.version,
    project,
    parts,
    gate,
    openIssues: open.total,
    issuesIncludingClosed: all.total,
  };
}

// ---------------------------------------------------------------------------

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString("en-US"));
const pct = (n) => (n == null ? "—" : `${Number(n).toFixed(1)}%`);
const thDateTime = (iso) =>
  new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" }) + " น.";
const RATING = { "1.0": "A", "2.0": "B", "3.0": "C", "4.0": "D", "5.0": "E" };
const METRIC_TH = {
  new_coverage: "Coverage ของโค้ดใหม่",
  new_duplicated_lines_density: "โค้ดซ้ำในโค้ดใหม่",
  new_violations: "จำนวนปัญหาในโค้ดใหม่",
};

function fontFace() {
  const dir = path.join(ROOT, "server/src/assets/fonts");
  const face = (file, weight) =>
    `@font-face{font-family:"Sarabun";font-weight:${weight};src:url(data:font/ttf;base64,${fs.readFileSync(path.join(dir, file)).toString("base64")}) format("truetype");}`;
  return face("Sarabun-Regular.ttf", 400) + face("Sarabun-Bold.ttf", 700);
}

const CSS = `
:root{--ink:#1b1f2e;--muted:#5a6078;--rule:#dcdfe8;--band:#f4f5f9;--brand:#000099;--ok:#1d6b45;--bad:#a32020}
*{box-sizing:border-box} html,body{margin:0;background:#fff;color:var(--ink)}
body{font-family:"Sarabun",Tahoma,sans-serif;font-size:10.5pt;line-height:1.65}
h1,h2{margin:0;font-weight:700}
.eyebrow{font-size:9.5pt;letter-spacing:.06em;color:var(--brand);font-weight:700}
h1{font-size:20pt;line-height:1.3;margin-top:2mm}
h2{break-after:avoid;font-size:13pt;line-height:1.6;margin:6mm 0 2.5mm;padding:1.2mm 0;border-bottom:1.5px solid var(--brand);color:var(--brand)}
p{margin:0 0 2.5mm}
.round{display:inline-block;margin-top:3mm;padding:1mm 4mm;border:1.5px solid var(--brand);border-radius:1.5mm;color:var(--brand);font-weight:700;font-size:12pt}
.meta{display:grid;grid-template-columns:38mm 1fr;gap:1mm 4mm;margin:4mm 0 0;font-size:9.5pt}
.meta dt{color:var(--muted)} .meta dd{margin:0}
table{width:100%;border-collapse:collapse;font-size:9.5pt;margin:1mm 0 2mm}
th{background:var(--brand);color:#fff;font-weight:700;text-align:left;padding:1.5mm 2.2mm;font-size:9pt}
td{padding:1.4mm 2.2mm;border-bottom:1px solid var(--rule);vertical-align:top}
tr{break-inside:avoid} tbody tr:nth-child(even) td{background:var(--band)}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.ok{color:var(--ok);font-weight:700} .bad{color:var(--bad);font-weight:700} .muted{color:var(--muted)}
.gate{display:inline-block;padding:1mm 4mm;border-radius:1.5mm;font-weight:700;color:#fff}
.gate.ok{background:var(--ok);color:#fff} .gate.bad{background:var(--bad);color:#fff}
.note{break-inside:avoid;border-left:2px solid var(--brand);padding:2mm 3.5mm;background:var(--band);font-size:9.5pt;margin:3mm 0}
.note p:last-child{margin:0}
.code{font-family:Consolas,"Courier New",monospace;font-size:8.8pt;overflow-wrap:break-word}
ul{margin:0 0 2mm;padding-left:5mm} li{margin-bottom:1mm}
.page-break{break-before:page}
`;

function cover(s) {
  const p = s.project;
  const gateOk = s.gate.status === "OK";
  const covered = s.parts.filter((x) => !x.excluded);
  const excluded = s.parts.filter((x) => x.excluded);
  const sum = (rows, k) => rows.reduce((a, r) => a + Number(r.m[k] ?? 0), 0);

  return `
  <div class="eyebrow">SONARQUBE · SYSTEMBOQ</div>
  <h1>รายงานผลการวิเคราะห์คุณภาพโค้ด</h1>
  <div class="round">การสแกนรอบที่ 2</div>
  <dl class="meta">
    <dt>โปรเจกต์</dt><dd>SystemBOQ (<span class="code">${esc(PROJECT)}</span>)</dd>
    <dt>สแกนรอบที่ 2 เมื่อ</dt><dd>${s.scannedAt ? esc(thDateTime(s.scannedAt)) : "—"}</dd>
    <dt>ดึงตัวเลขเมื่อ</dt><dd>${esc(thDateTime(s.fetchedAt))}</dd>
    <dt>เซิร์ฟเวอร์</dt><dd>${esc(HOST)} · SonarQube Community Build ${esc(s.serverVersion)}</dd>
    <dt>ไฟล์ issues รอบนี้</dt><dd><span class="code">issues_round2_page1.json</span> … (ข้อที่ยังเปิดอยู่ ${fmt(s.openIssues)} ข้อ)</dd>
  </dl>

  <h2>Quality Gate</h2>
  <p><span class="gate ${gateOk ? "ok" : "bad"}">${gateOk ? "PASSED" : "FAILED"}</span>
     <span class="muted">ใช้เกณฑ์มาตรฐาน “Sonar way” ตามคู่มือ · โค้ดใหม่นับตั้งแต่ ${esc(s.gate.period?.date ? thDateTime(s.gate.period.date) : "—")}</span></p>
  <table>
    <thead><tr><th>เงื่อนไข</th><th class="num">เกณฑ์</th><th class="num">ผลรอบที่ 2</th><th>ผล</th></tr></thead>
    <tbody>${s.gate.conditions
      .map((c) => {
        const isPct = c.metricKey !== "new_violations";
        const v = isPct ? pct(c.actualValue) : fmt(c.actualValue);
        const t = c.comparator === "LT" ? `≥ ${c.errorThreshold}${isPct ? "%" : ""}` : `≤ ${c.errorThreshold}${isPct ? "%" : ""}`;
        return `<tr><td>${esc(METRIC_TH[c.metricKey] ?? c.metricKey)} <span class="muted code">${esc(c.metricKey)}</span></td><td class="num">${esc(t)}</td><td class="num">${esc(v)}</td><td class="${c.status === "OK" ? "ok" : "bad"}">${c.status === "OK" ? "ผ่าน" : "ไม่ผ่าน"}</td></tr>`;
      })
      .join("")}</tbody>
  </table>

  ${
    s.fixedFrom
      ? `<h2>สิ่งที่ทำก่อนสแกนรอบนี้</h2>
  <ul>
    <li>แก้ปัญหาในโค้ดใหม่ (new code) ที่ Quality Gate นับ จาก <b>${fmt(s.fixedFrom)}</b> ข้อ เหลือ <b>${fmt(p.new_violations)}</b> ข้อ
        — แก้ที่ตัวโค้ดจริงทุกข้อ ไม่ได้กด “Won't fix / False positive” ในหน้า SonarQube</li>
    <li>ตรวจว่าระบบไม่พังหลังแก้: เทสต์ Jest ของ server <b>${esc(s.tests ?? "—")}</b>
        · Robot Framework (หน้าจอ + API) <b>${esc(s.e2e ?? "—")}</b> · build staff-app และ client-app ผ่าน</li>
  </ul>`
      : ""
  }

  <h2>Coverage และส่วนที่ยกเว้น</h2>
  <p>Coverage รวมของโปรเจกต์ <b>${pct(p.coverage)}</b> (บรรทัด ${pct(p.line_coverage)} · เงื่อนไข if/else ${pct(p.branch_coverage)})
     คิดจาก ${fmt(sum(covered, "lines_to_cover"))} บรรทัดที่ต้องมีเทสต์ ในส่วนที่วัด coverage</p>
  <table>
    <thead><tr><th>ส่วนของโปรเจกต์</th><th class="num">บรรทัดโค้ด</th><th class="num">Coverage</th><th>นับใน coverage</th></tr></thead>
    <tbody>
      ${covered.map((x) => `<tr><td>${esc(x.label)}</td><td class="num">${fmt(x.m.ncloc)}</td><td class="num">${pct(x.m.coverage)}</td><td class="ok">นับ</td></tr>`).join("")}
      ${excluded.map((x) => `<tr><td>${esc(x.label)}</td><td class="num">${fmt(x.m.ncloc)}</td><td class="num muted">—</td><td>ยกเว้น · ${esc(x.excluded)}</td></tr>`).join("")}
    </tbody>
  </table>

  <div class="note">
    <p><b>สิ่งที่ยกเว้น</b> — ตั้งใน <span class="code">sonar-project.properties</span> บรรทัดเดียว:</p>
    <p class="code">sonar.coverage.exclusions=staff-app/**,client-app/**,server/scripts/**,server/prisma/**</p>
    <ul>
      <li><b>ยกเว้นเฉพาะการคิด coverage</b> — ไฟล์เหล่านี้ยังถูกสแกนหา Bug / Vulnerability / Code Smell ครบทุกไฟล์
          (ปัญหาที่พบใน staff-app ${fmt(s.parts[2].m.violations)} ข้อ · client-app ${fmt(s.parts[3].m.violations)} ข้อ อยู่ในตัวเลขรวมของรายงานนี้)</li>
      <li><b>staff-app / client-app</b> เป็นหน้าจอ React ที่ไม่มี unit test — ทดสอบผ่านเบราว์เซอร์จริงด้วย Robot Framework
          (โฟลเดอร์ <span class="code">robot-tests/</span>) ซึ่งไม่สร้างไฟล์ coverage ให้ SonarQube อ่าน ถ้านับรวม สองแอปนี้จะถูกนับเป็น 0%
          และ coverage รวมจะเหลือราว 53% (ผลจากการสแกนรอบที่ 2 ครั้งแรกที่ยังไม่ได้ตั้งข้อยกเว้น)</li>
      <li><b>server/scripts, server/prisma</b> คือสคริปต์ที่คนสั่งรันเองทางบรรทัดคำสั่ง (seed ข้อมูล · สำรอง/กู้ข้อมูล · ตั้งค่าฐานข้อมูลทดสอบ)</li>
      <li><b>shared-types ไม่ได้ยกเว้น</b> — วัดจริงจากเทสต์ของ server ที่เรียกใช้กติกาเหล่านี้อยู่</li>
    </ul>
  </div>

  <h2>ที่มาของตัวเลข coverage</h2>
  <ul>
    <li>รันเทสต์อัตโนมัติของ server ด้วย Jest: <b>${esc(s.tests ?? "—")}</b> ผ่านทั้งหมด
        (<span class="code">cd server && npx jest -c jest.coverage.config.js --coverage</span>)</li>
    <li>แก้ path ในไฟล์ lcov ให้ตรงกับที่ตัวสแกนใน docker มอง (<span class="code">node sonar-reports/fix-lcov-paths.cjs</span>)
        — รอบที่ 1 ขึ้น 0% เพราะ path ไม่ตรง ตัวสแกนจึงจับคู่ผลเทสต์กับไฟล์ไม่ได้</li>
    <li>สแกนด้วยคำสั่งในคู่มือหัวข้อ 5 (<span class="code">docker run … sonarsource/sonar-scanner-cli</span>) ไม่เปลี่ยนอะไร</li>
  </ul>

  <h2>ภาพรวมรอบที่ 2</h2>
  <table>
    <thead><tr><th>ตัวชี้วัด</th><th class="num">ค่า</th></tr></thead>
    <tbody>
      <tr><td>Bugs · Reliability</td><td class="num">${fmt(p.bugs)} · ${RATING[p.reliability_rating] ?? "—"}</td></tr>
      <tr><td>Vulnerabilities · Security</td><td class="num">${fmt(p.vulnerabilities)} · ${RATING[p.security_rating] ?? "—"}</td></tr>
      <tr><td>Code Smells · Maintainability</td><td class="num">${fmt(p.code_smells)} · ${RATING[p.sqale_rating] ?? "—"}</td></tr>
      <tr><td>Security Hotspots</td><td class="num">${fmt(p.security_hotspots)}</td></tr>
      <tr><td>Duplicated lines</td><td class="num">${pct(p.duplicated_lines_density)}</td></tr>
      <tr><td>Lines of code</td><td class="num">${fmt(p.ncloc)}</td></tr>
      <tr><td>ปัญหาที่ยังเปิดอยู่ทั้งหมด · ในโค้ดใหม่</td><td class="num">${fmt(p.violations)} · ${fmt(p.new_violations)}</td></tr>
    </tbody>
  </table>

  <div class="note">
    <p><b>อ่านหน้าถัดไปอย่างไร</b> — หน้าถัดจากนี้คือรายงานที่สร้างด้วย <span class="code">sonar_report.py</span> ตามคู่มือหัวข้อ 7 โดยไม่แก้สคริปต์
       (ไฟล์เดี่ยว: <span class="code">sonar-reports/systemboq_round2_report.pdf</span>) ข้อควรรู้สองข้อของสคริปต์นั้น:</p>
    <ul>
      <li>ตาราง “จำนวน Issues แยกตาม Severity” ของสคริปต์ไม่ได้กรองข้อที่แก้แล้ว จึงนับข้อที่ปิดไปตั้งแต่รอบที่ 1 รวมเข้าไปด้วย
          (ทั้งหมด ${fmt(s.issuesIncludingClosed)} ข้อ เทียบกับที่ยังเปิดอยู่จริง ${fmt(s.openIssues)} ข้อ)</li>
      <li>สคริปต์ไม่ได้ใส่ฟอนต์ภาษาไทย หัวข้อภาษาไทยบางบรรทัดในหน้านั้นจึงแสดงเป็นสี่เหลี่ยม ตัวเลขและข้อความภาษาอังกฤษอ่านได้ปกติ</li>
    </ul>
  </div>`;
}

async function main() {
  const snapshot = await collect();
  fs.writeFileSync(SNAPSHOT, JSON.stringify(snapshot, null, 1));

  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>SonarQube รอบที่ 2</title><style>${fontFace()}${CSS}</style></head><body>${cover(snapshot)}</body></html>`;
  const browser = await puppeteer.launch({ headless: true });
  let coverBytes;
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    coverBytes = await page.pdf({ format: "A4", printBackground: true, margin: { top: "14mm", bottom: "14mm", left: "15mm", right: "15mm" } });
  } finally {
    await browser.close();
  }

  const out = await PDFDocument.create();
  for (const bytes of [coverBytes, fs.readFileSync(MANUAL_PDF)]) {
    const src = await PDFDocument.load(bytes);
    for (const p of await out.copyPages(src, src.getPageIndices())) out.addPage(p);
  }
  out.setTitle("SonarQube — SystemBOQ — การสแกนรอบที่ 2");
  fs.writeFileSync(OUT_PDF, await out.save());
  console.log(`${path.relative(ROOT, OUT_PDF)} (${out.getPageCount()} หน้า) · ${path.relative(ROOT, SNAPSHOT)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
