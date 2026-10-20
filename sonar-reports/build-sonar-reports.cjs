/**
 * สร้างรายงาน PDF ผลการแก้ไขตาม SonarQube — หนึ่งไฟล์ต่อหนึ่งชุด export (issues.json,
 * issues_page2.json, issues_page3.json) และอีกหนึ่งไฟล์ภาพรวมทั้งโปรเจกต์
 *
 * ทำไมไม่ใช้ sonar_report.py ของคู่มือตรง ๆ
 *   1. reportlab ไม่จัดตำแหน่งสระ/วรรณยุกต์ไทย — ต่อให้ใส่ฟอนต์ไทยแล้ว "ที่" ก็ยังพิมพ์ออกมาเป็น "ที"
 *      เพราะวรรณยุกต์ทับสระบน ที่นี่จึงให้ Chrome (puppeteer) พิมพ์แทน ซึ่งจัดตัวอักษรไทยถูก
 *   2. สคริปต์เดิมเรียก /api/issues/search โดยไม่ใส่ resolved=false จึงนับข้อที่แก้แล้ว (CLOSED)
 *      รวมเข้าไปด้วย ตัวเลขตาม severity เลยขัดกับตารางตัวชี้วัดบนหน้าเดียวกัน
 *
 * วิธีเทียบก่อน/หลัง: ทุกข้อใน export มี `key` ประจำตัว เมื่อสแกนรอบใหม่แล้วไม่เจอปัญหานั้นอีก
 * SonarQube จะปิดข้อนั้นเองเป็น CLOSED/FIXED โดยใช้ key เดิม — รายงานนี้แค่ถามเซิร์ฟเวอร์ว่า
 * แต่ละ key ตอนนี้สถานะอะไร ไม่ได้ตัดสินเองว่าข้อไหนแก้แล้ว
 *
 * ข้อจำกัด: SonarQube ลบข้อที่ปิดแล้วทิ้งหลัง 30 วัน (sonar.dbcleaner.daysBeforeDeletingClosedIssues)
 * สคริปต์จึงเซฟสถานะที่ดึงมาไว้เป็น issues_after_<วันที่>.json ข้างไฟล์ก่อนแก้ทุกครั้ง
 *
 * ใช้งาน (จากโฟลเดอร์ราก):
 *   SONAR_TOKEN=<token> node sonar-reports/build-sonar-reports.cjs
 *   ตัวเลือก: SONAR_HOST (ค่าเริ่มต้น http://localhost:9000) · SONAR_PROJECT (systemboq)
 *   รันแบบไม่ต่อเซิร์ฟเวอร์ด้วยไฟล์สถานะที่เซฟไว้: node sonar-reports/build-sonar-reports.cjs --from issues_after_2026-09-28.json
 */
const fs = require("node:fs");
const path = require("node:path");
const puppeteer = require("puppeteer");
const RULE_GUIDE = require("./rule-guide.cjs");

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = __dirname;
const HOST = (process.env.SONAR_HOST || "http://localhost:9000").replace(/\/+$/, "");
const PROJECT = process.env.SONAR_PROJECT || "systemboq";
const TOKEN = process.env.SONAR_TOKEN || "";

const PAGES = [
  { n: 1, file: "issues.json", out: "sonar-report-page1.pdf" },
  { n: 2, file: "issues_page2.json", out: "sonar-report-page2.pdf" },
  { n: 3, file: "issues_page3.json", out: "sonar-report-page3.pdf" },
];

const SEVERITIES = ["BLOCKER", "CRITICAL", "MAJOR", "MINOR", "INFO"];
const TYPES = [
  ["BUG", "Bug"],
  ["VULNERABILITY", "Vulnerability"],
  ["CODE_SMELL", "Code Smell"],
];
const APPS = [
  ["server/", "server (API)"],
  ["staff-app/", "staff-app (ฝั่งพนักงาน)"],
  ["client-app/", "client-app (ฝั่งลูกค้า)"],
  ["packages/", "packages/shared-types"],
];

/**
 * ข้อที่ตั้งใจไม่แก้ — ทุกข้อต้องมีเหตุผลที่อธิบายได้ ไม่ใช่แค่ "ไม่ได้ทำ"
 * จับคู่ด้วยกฎ + ไฟล์ (ไม่ใช้เลขบรรทัด เพราะบรรทัดเลื่อนทุกครั้งที่แก้ไฟล์)
 */
const EXCEPTIONS = [
  {
    rule: "S2699",
    files: ["server/tests/integration/customer-file.test.ts"],
    kind: "fp",
    reason:
      "False positive — เทสต์ตรวจผลด้วย supertest .expect(status) ซึ่งเป็นการ assert อยู่แล้ว แต่ SonarQube ไม่นับรูปแบบนี้เป็น assertion",
  },
  {
    rule: "S6479",
    files: [
      "client-app/src/components/WaveField.tsx",
      "client-app/src/pages/PrivacyPage.tsx",
      "staff-app/src/components/BoqPriceDriftNotice.tsx",
      "staff-app/src/components/BoqVersionCompare.tsx",
      "staff-app/src/components/OtpInput.tsx",
      "staff-app/src/components/VariableField.tsx",
    ],
    kind: "intentional",
    reason:
      "ตั้งใจไม่แก้ — เป็นรายการแสดงผลที่ไม่มีการสลับ แทรก หรือลบระหว่างใช้งาน การใช้ลำดับ (index) เป็น key จึงถูกต้องตามหลักของ React",
  },
  {
    rule: "S6848",
    files: ["staff-app/src/components/VariablePicker.tsx"],
    kind: "intentional",
    reason:
      "ตั้งใจไม่แก้ — onMouseDown บนกรอบรายการมีไว้กันช่องพิมพ์เสียโฟกัสตอนคลิก ไม่ได้ทำหน้าที่เป็นปุ่ม ตัวเลือกข้างในเป็น <button> ที่ใช้คีย์บอร์ดได้ครบ",
  },
];

const QUALITIES = [
  ["SECURITY", "Security", "ความปลอดภัย"],
  ["RELIABILITY", "Reliability", "ความถูกต้องของการทำงาน"],
  ["MAINTAINABILITY", "Maintainability", "ความง่ายในการดูแลแก้ไข"],
];

/** เวลาแก้ที่ SonarQube ประเมิน ("5min", "1h30min", "1d" = 8 ชม.) → นาที */
function effortMinutes(effort) {
  let total = 0;
  for (const [, n, unit] of String(effort || "").matchAll(/(\d+)(d|h|min)/g)) {
    total += Number(n) * { d: 480, h: 60, min: 1 }[unit];
  }
  return total;
}

function hoursText(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} นาที`;
  return m === 0 ? `${fmt(h)} ชม.` : `${fmt(h)} ชม. ${m} นาที`;
}

/** ผลรันชุดตรวจล่าสุด (run-checks.cjs) — ไม่มีไฟล์ก็ข้ามหัวข้อนั้นไป ไม่แต่งตัวเลขขึ้นมาเอง */
function latestChecks() {
  const files = fs.readdirSync(OUT_DIR).filter((f) => /^checks-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  if (files.length === 0) return null;
  return { file: files.at(-1), ...JSON.parse(fs.readFileSync(path.join(OUT_DIR, files.at(-1)), "utf8")) };
}

const STATUS = {
  fixed: { label: "แก้แล้ว", note: "SonarQube ปิดเป็น FIXED" },
  fp: { label: "False positive", note: "ตรวจแล้วโค้ดถูกต้อง" },
  intentional: { label: "ตั้งใจไม่แก้", note: "มีเหตุผลกำกับ" },
  open: { label: "ยังไม่ได้แก้", note: "ยังเปิดอยู่" },
  gone: { label: "ไม่พบบนเซิร์ฟเวอร์", note: "ถูกลบหลังปิดครบ 30 วัน" },
};

// ---------------------------------------------------------------------------
// ข้อมูล
// ---------------------------------------------------------------------------

async function api(pathAndQuery) {
  const res = await fetch(`${HOST}${pathAndQuery}`, {
    headers: { Authorization: "Basic " + Buffer.from(`${TOKEN}:`).toString("base64") },
  });
  if (!res.ok) throw new Error(`${res.status} ${pathAndQuery}`);
  return res.json();
}

async function apiOrNull(pathAndQuery) {
  try {
    return await api(pathAndQuery);
  } catch {
    return null;
  }
}

async function fetchAfter() {
  if (!TOKEN) throw new Error("ต้องตั้ง SONAR_TOKEN (หรือใช้ --from <ไฟล์สถานะที่เซฟไว้>)");
  const issues = [];
  for (let p = 1; ; p++) {
    const d = await api(`/api/issues/search?components=${PROJECT}&ps=500&p=${p}`);
    issues.push(...d.issues);
    if (issues.length >= d.total || d.issues.length === 0) break;
  }
  const ruleKeys = [...new Set(issues.map((i) => i.rule))].sort();
  const rules = {};
  for (const k of ruleKeys) {
    const r = await apiOrNull(`/api/rules/show?key=${encodeURIComponent(k)}`);
    rules[k] = r ? r.rule.name : "";
  }
  const metricKeys = [
    "bugs", "vulnerabilities", "security_hotspots", "code_smells", "coverage",
    "duplicated_lines_density", "ncloc", "reliability_rating", "security_rating",
    "sqale_rating", "alert_status",
  ];
  const m = await apiOrNull(`/api/measures/component?component=${PROJECT}&metricKeys=${metricKeys.join(",")}`);
  const measures = m ? Object.fromEntries(m.component.measures.map((x) => [x.metric, x.value])) : {};
  const gate = await apiOrNull(`/api/qualitygates/project_status?projectKey=${PROJECT}`);
  const status = await apiOrNull(`/api/system/status`);
  return {
    fetchedAt: new Date().toISOString(),
    host: HOST,
    project: PROJECT,
    serverVersion: status ? status.version : null,
    measures,
    gate: gate ? gate.projectStatus : null,
    rules,
    issues,
  };
}

function loadBefore() {
  return PAGES.map((p) => {
    const d = JSON.parse(fs.readFileSync(path.join(ROOT, p.file), "utf8"));
    return { ...p, total: d.total, issues: d.issues };
  });
}

const relFile = (component) => component.slice(component.indexOf(":") + 1);
const ruleId = (rule) => rule.slice(rule.indexOf(":") + 1);

function classify(before, after) {
  if (!after) return { kind: "gone" };
  if (after.status === "CLOSED" || after.resolution === "FIXED" || after.resolution === "REMOVED") {
    return { kind: "fixed" };
  }
  if (after.resolution === "FALSE-POSITIVE" || after.issueStatus === "FALSE_POSITIVE") {
    return { kind: "fp", reason: "ทำเครื่องหมาย False positive ใน SonarQube แล้ว" };
  }
  if (after.resolution === "WONTFIX" || after.issueStatus === "ACCEPTED") {
    return { kind: "intentional", reason: "ทำเครื่องหมาย Accepted / Won't fix ใน SonarQube แล้ว" };
  }
  const ex = EXCEPTIONS.find(
    (e) => e.rule === ruleId(before.rule) && e.files.includes(relFile(before.component)),
  );
  if (ex) return { kind: ex.kind, reason: ex.reason };
  return { kind: "open" };
}

function tally(rows, keyOf) {
  const map = new Map();
  for (const r of rows) {
    const k = keyOf(r);
    if (!map.has(k)) map.set(k, { key: k, total: 0, fixed: 0, fp: 0, intentional: 0, open: 0, gone: 0 });
    const t = map.get(k);
    t.total++;
    t[r.state.kind]++;
  }
  return map;
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const thDate = (iso) =>
  new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" });
const thDateTime = (iso) =>
  new Date(iso).toLocaleString("th-TH", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok",
  }) + " น.";

const fmt = (n) => Number(n).toLocaleString("en-US");

function fontFace() {
  const dir = path.join(ROOT, "server/src/assets/fonts");
  const face = (file, weight) =>
    `@font-face{font-family:"Sarabun";font-weight:${weight};src:url(data:font/ttf;base64,${fs
      .readFileSync(path.join(dir, file))
      .toString("base64")}) format("truetype");}`;
  return face("Sarabun-Regular.ttf", 400) + face("Sarabun-Bold.ttf", 700);
}

const CSS = `
:root{
  --ink:#1b1f2e; --muted:#5a6078; --faint:#8a8fa3; --rule:#dcdfe8; --band:#f4f5f9;
  --brand:#000099;
  --fixed:#1d6b45; --fixed-bg:#e7f3ec;
  --held:#58607a; --held-bg:#eceef4;
  --open:#9a4a00; --open-bg:#fbefdf;
}
*{box-sizing:border-box}
html,body{margin:0;background:#fff;color:var(--ink)}
body{font-family:"Sarabun",Tahoma,sans-serif;font-size:10.5pt;line-height:1.65}
h1,h2,h3{margin:0;font-weight:700;color:var(--ink)}
.eyebrow{font-size:9pt;letter-spacing:.06em;color:var(--brand);font-weight:700}
h1{font-size:19pt;line-height:1.3;margin-top:2mm;text-wrap:balance}
h2{break-after:avoid;font-size:13pt;line-height:1.6;margin:7mm 0 2.5mm;padding:1.5mm 0 1.5mm;border-bottom:1.5px solid var(--brand);color:var(--brand)}
h3{break-after:avoid;font-size:11pt;margin:5mm 0 2mm}
.keep,table.keep{break-inside:avoid}
p{margin:0 0 2.5mm}
.lede{color:var(--muted);max-width:165mm}
.meta{display:grid;grid-template-columns:34mm 1fr;gap:1mm 4mm;margin:5mm 0 0;font-size:9.5pt}
.meta dt{color:var(--muted)} .meta dd{margin:0}
.header{padding-bottom:4mm;border-bottom:1px solid var(--rule)}
.tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm;margin:5mm 0 3mm}
.tile{border:1px solid var(--rule);border-radius:2mm;padding:3mm 3.5mm}
.tile .n{font-size:20pt;font-weight:700;line-height:1.1;font-variant-numeric:tabular-nums}
.tile .l{font-size:9pt;color:var(--muted)}
.tile.fixed .n{color:var(--fixed)} .tile.held .n{color:var(--held)} .tile.open .n{color:var(--open)}
.bar{display:flex;gap:2px;height:4mm;border-radius:1mm;overflow:hidden;margin:1mm 0 1.5mm}
.bar span{display:block;height:100%}
.bar .fixed{background:var(--fixed)} .bar .held{background:#9aa1b8} .bar .open{background:#d9892b}
.legend{display:flex;gap:6mm;font-size:9pt;color:var(--muted)}
.legend i{display:inline-block;width:3mm;height:3mm;border-radius:.6mm;margin-right:1.5mm;vertical-align:-.3mm}
table{width:100%;border-collapse:collapse;font-size:9.5pt;margin:1mm 0 2mm}
thead{display:table-header-group}
/* Chrome พิมพ์ tfoot ซ้ำท้ายทุกหน้า — แถว "รวม" จะโผล่กลางตารางที่ยาวข้ามหน้า */
tfoot{display:table-row-group}
th{background:var(--brand);color:#fff;font-weight:700;text-align:left;padding:1.6mm 2.2mm;font-size:9pt}
td{padding:1.4mm 2.2mm;border-bottom:1px solid var(--rule);vertical-align:top}
tr{break-inside:avoid}
tbody tr:nth-child(even) td{background:var(--band)}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
tfoot td{font-weight:700;border-top:1.5px solid var(--ink);border-bottom:none;background:#fff}
.zero{color:var(--faint)}
.pill{display:inline-block;padding:.2mm 2mm;border-radius:10mm;font-size:8.5pt;font-weight:700;white-space:nowrap}
.pill.fixed{color:var(--fixed);background:var(--fixed-bg)}
.pill.fp,.pill.intentional{color:var(--held);background:var(--held-bg)}
.pill.open,.pill.gone{color:var(--open);background:var(--open-bg)}
.sev{font-size:8.5pt;font-weight:700;letter-spacing:.02em}
.code{font-family:Consolas,"Courier New",monospace;font-size:8.6pt;word-break:break-all}
.small{font-size:8.8pt}
.muted{color:var(--muted)}
.reason{font-size:8.8pt;color:var(--muted);margin-top:.6mm}
.note{break-inside:avoid;border-left:2px solid var(--brand);padding:2mm 3.5mm;background:var(--band);font-size:9.5pt;margin:3mm 0}
.note p:last-child{margin:0}
.gate{display:inline-block;padding:1mm 4mm;border-radius:1.5mm;font-weight:700;color:#fff}
.gate.ok{background:var(--fixed)} .gate.error{background:#a32020}
ol.method{padding-left:5mm;margin:0} ol.method li{margin-bottom:1.5mm}
.page-break{break-before:page}
.debt{display:flex;align-items:baseline;gap:4mm;border:1px solid var(--rule);border-radius:2mm;padding:2.5mm 3.5mm;margin-top:3mm;font-size:9.5pt}
.debt .t{color:var(--muted);min-width:34mm}
.debt b{font-size:13pt;font-variant-numeric:tabular-nums}
.debt .arrow{color:var(--faint)}
.debt .down{color:var(--fixed);font-weight:700}
.rg{margin-top:1mm;font-size:8.8pt;line-height:1.5}
.rg .k{color:var(--muted);font-weight:700}
td.rulecell{width:62%}
.pass{color:var(--fixed);font-weight:700} .fail{color:#a32020;font-weight:700}
`;

function ruleCell(ruleKey) {
  const g = RULE_GUIDE[ruleId(ruleKey)];
  return `<span class="code"><b>${esc(ruleId(ruleKey))}</b></span> <span class="small muted">${esc(RULES_NAME[ruleKey] || "")}</span>${
    g
      ? `<div class="rg"><span class="k">ปัญหา:</span> ${esc(g.problem)}</div><div class="rg"><span class="k">แก้โดย:</span> ${esc(g.fix)}</div>`
      : ""
  }`;
}

let RULES_NAME = {};

function pill(kind) {
  return `<span class="pill ${kind}">${esc(STATUS[kind].label)}</span>`;
}

function num(n) {
  return n === 0 ? `<span class="zero">0</span>` : fmt(n);
}

function breakdownTable(title, map, order, labelOf, opts = {}) {
  const rows = order.filter((k) => map.has(k)).map((k) => map.get(k));
  const sum = (f) => rows.reduce((s, r) => s + r[f], 0);
  const held = (r) => r.fp + r.intentional;
  const extraHead = opts.extraHead ?? "";
  return `
  <table>
    <thead><tr><th>${esc(title)}</th>${extraHead}<th class="num">ก่อนแก้</th><th class="num">แก้แล้ว</th><th class="num">ตั้งใจไม่แก้ / FP</th><th class="num">ยังไม่ได้แก้</th></tr></thead>
    <tbody>${rows
      .map(
        (r) =>
          `<tr><td${opts.firstClass ? ` class="${opts.firstClass}"` : ""}>${labelOf(r.key)}</td>${opts.extraCell ? opts.extraCell(r.key) : ""}<td class="num">${num(r.total)}</td><td class="num">${num(r.fixed)}</td><td class="num">${num(held(r))}</td><td class="num">${num(r.open + r.gone)}</td></tr>`,
      )
      .join("")}</tbody>
    <tfoot><tr><td>รวม</td>${opts.extraCell ? "<td></td>" : ""}<td class="num">${fmt(sum("total"))}</td><td class="num">${fmt(sum("fixed"))}</td><td class="num">${fmt(sum("fp") + sum("intentional"))}</td><td class="num">${fmt(sum("open") + sum("gone"))}</td></tr></tfoot>
  </table>`;
}

function summaryBlock(rows) {
  const c = { fixed: 0, fp: 0, intentional: 0, open: 0, gone: 0 };
  for (const r of rows) c[r.state.kind]++;
  const total = rows.length;
  const held = c.fp + c.intentional;
  const open = c.open + c.gone;
  const pct = (n) => ((n / total) * 100).toFixed(1);
  const w = (n) => (n === 0 ? "" : `<span class="__K__" style="flex:${n}"></span>`);
  const debtBefore = rows.reduce((s, r) => s + effortMinutes(r.b.effort), 0);
  const debtLeft = rows.filter((r) => r.state.kind !== "fixed").reduce((s, r) => s + effortMinutes(r.b.effort), 0);
  const debtDrop = debtBefore === 0 ? 0 : ((1 - debtLeft / debtBefore) * 100).toFixed(1);
  return {
    c,
    html: `
  <div class="tiles">
    <div class="tile"><div class="n">${fmt(total)}</div><div class="l">ข้อในชุดนี้ (ก่อนแก้)</div></div>
    <div class="tile fixed"><div class="n">${fmt(c.fixed)}</div><div class="l">แก้แล้ว · ${pct(c.fixed)}%</div></div>
    <div class="tile held"><div class="n">${fmt(held)}</div><div class="l">ตั้งใจไม่แก้ / false positive</div></div>
    <div class="tile open"><div class="n">${fmt(open)}</div><div class="l">ยังไม่ได้แก้</div></div>
  </div>
  <div class="bar" role="img" aria-label="แก้แล้ว ${c.fixed} ตั้งใจไม่แก้ ${held} ยังไม่ได้แก้ ${open} จาก ${total}">
    ${w(c.fixed).replace("__K__", "fixed")}${w(held).replace("__K__", "held")}${w(open).replace("__K__", "open")}
  </div>
  <div class="legend">
    <span><i style="background:var(--fixed)"></i>แก้แล้ว ${fmt(c.fixed)}</span>
    <span><i style="background:#9aa1b8"></i>ตั้งใจไม่แก้ / FP ${fmt(held)}</span>
    <span><i style="background:#d9892b"></i>ยังไม่ได้แก้ ${fmt(open)}</span>
  </div>
  <div class="debt">
    <span class="t">หนี้ทางเทคนิค<br><span class="small">(เวลาแก้ที่ SonarQube ประเมิน)</span></span>
    <span>ก่อนแก้ <b>${hoursText(debtBefore)}</b></span>
    <span class="arrow">→</span>
    <span>คงเหลือ <b>${hoursText(debtLeft)}</b></span>
    <span class="down">ลดลง ${debtDrop}%</span>
  </div>
  <p class="small muted" style="margin-top:1mm">คงเหลือนับรวมข้อที่ตั้งใจไม่แก้ด้วย เพราะ SonarQube ยังนับเป็นหนี้อยู่จนกว่าจะกดปิดบนเซิร์ฟเวอร์</p>`,
  };
}

function remainingTable(rows) {
  const left = rows.filter((r) => r.state.kind !== "fixed");
  if (left.length === 0) return `<p>ไม่มี — ทุกข้อในชุดนี้ SonarQube ปิดเป็น FIXED แล้ว</p>`;
  return `
  <table>
    <thead><tr><th style="width:17mm">สถานะ</th><th style="width:19mm">Severity</th><th style="width:15mm">กฎ</th><th>ไฟล์ · ข้อความจาก SonarQube · เหตุผล</th></tr></thead>
    <tbody>${left
      .map(
        (r) => `<tr>
        <td>${pill(r.state.kind)}</td>
        <td class="sev">${esc(r.b.severity)}</td>
        <td class="code">${esc(ruleId(r.b.rule))}</td>
        <td><div class="code">${esc(relFile(r.b.component))}:${esc(r.a?.line ?? r.b.line ?? "-")}</div>
            <div class="small">${esc(r.b.message)}</div>
            ${r.state.reason ? `<div class="reason">${esc(r.state.reason)}</div>` : ""}
            ${r.state.kind === "open" ? `<div class="reason">ยังไม่ได้แก้ — หลุดจากรอบแก้ไข</div>` : ""}</td>
      </tr>`,
      )
      .join("")}</tbody>
  </table>`;
}

function fullList(rows) {
  const order = (r) => SEVERITIES.indexOf(r.b.severity);
  const sorted = [...rows].sort(
    (x, y) => order(x) - order(y) || relFile(x.b.component).localeCompare(relFile(y.b.component)) || (x.b.line ?? 0) - (y.b.line ?? 0),
  );
  return `
  <table>
    <thead><tr><th class="num" style="width:9mm">#</th><th style="width:19mm">Severity</th><th style="width:15mm">กฎ</th><th>ไฟล์:บรรทัด (ตอนสแกนก่อนแก้) · ข้อความ</th><th style="width:24mm">สถานะ</th></tr></thead>
    <tbody>${sorted
      .map(
        (r, i) => `<tr>
        <td class="num small muted">${i + 1}</td>
        <td class="sev">${esc(r.b.severity)}</td>
        <td class="code">${esc(ruleId(r.b.rule))}</td>
        <td><div class="code">${esc(relFile(r.b.component))}:${esc(r.b.line ?? "-")}</div><div class="small">${esc(r.b.message)}</div></td>
        <td>${pill(r.state.kind)}</td>
      </tr>`,
      )
      .join("")}</tbody>
  </table>`;
}

function methodNote(after) {
  return `
  <h2>วิธีตรวจสอบผล</h2>
  <ol class="method">
    <li>ข้อมูล "ก่อนแก้" คือไฟล์ที่ export จาก SonarQube Web API (<span class="code">/api/issues/search?ps=200</span>) หลังสแกนครั้งแรกเมื่อ 18 ก.ย. 2569 ทุกข้อมีสถานะ OPEN</li>
    <li>หลังแก้โค้ดแล้วสแกนใหม่ด้วย sonar-scanner-cli โปรเจกต์เดิม (project key <span class="code">${esc(after.project)}</span>) SonarQube จะจับคู่ปัญหาเดิมด้วยรหัส <span class="code">key</span> ของแต่ละข้อ ข้อที่ไม่พบอีกจะถูกปิดเป็น <b>CLOSED / FIXED</b> โดยเซิร์ฟเวอร์เอง</li>
    <li>รายงานนี้ดึงสถานะปัจจุบันของทุก key จากเซิร์ฟเวอร์เมื่อ ${esc(thDateTime(after.fetchedAt))} แล้วนับตามสถานะนั้นตรง ๆ — คำว่า "แก้แล้ว" ในรายงานหมายถึงสถานะที่ SonarQube ตั้งให้ ไม่ได้ตัดสินเอง</li>
    <li>ข้อที่ยังเปิดอยู่แต่ตั้งใจไม่แก้ ระบุเหตุผลไว้รายข้อ และนับแยกจากข้อที่ยังไม่ได้แก้</li>
  </ol>
  <div class="note"><p>ตรวจซ้ำได้บนหน้าเว็บ SonarQube: เมนู Issues ของโปรเจกต์ ตั้งตัวกรอง Status = Closed/Fixed หรือเปิด
  <span class="code">${esc(after.host)}/api/issues/search?issues=&lt;key&gt;</span> ด้วยรหัส key ใดก็ได้จากไฟล์ export ·
  SonarQube ลบข้อที่ปิดแล้วทิ้งหลังปิดครบ 30 วัน สถานะที่ใช้ทำรายงานนี้จึงเซฟไว้เป็นไฟล์ issues_after_*.json ข้างไฟล์ก่อนแก้</p></div>`;
}

function header(eyebrow, title, lede, after, extraMeta = "") {
  return `
  <div class="header">
    <div class="eyebrow">${esc(eyebrow)}</div>
    <h1>${esc(title)}</h1>
    <p class="lede" style="margin-top:2mm">${lede}</p>
    <dl class="meta">
      <dt>โปรเจกต์</dt><dd>SystemBOQ (<span class="code">${esc(after.project)}</span>)</dd>
      ${extraMeta}
      <dt>สแกนก่อนแก้</dt><dd>18 ก.ย. 2569</dd>
      <dt>สถานะหลังแก้</dt><dd>ดึงจากเซิร์ฟเวอร์เมื่อ ${esc(thDateTime(after.fetchedAt))}</dd>
      <dt>เซิร์ฟเวอร์</dt><dd>${esc(after.host)}${after.serverVersion ? ` · SonarQube ${esc(after.serverVersion)} Community` : ""}</dd>
    </dl>
  </div>`;
}

function pageReport(page, rows, after) {
  const { c, html: summary } = summaryBlock(rows);
  const bySev = tally(rows, (r) => r.b.severity);
  const byType = tally(rows, (r) => r.b.type);
  const byApp = tally(rows, (r) => (APPS.find(([p]) => relFile(r.b.component).startsWith(p)) || ["", "อื่น ๆ"])[1]);
  const byRule = tally(rows, (r) => r.b.rule);
  const ruleOrder = [...byRule.values()].sort((a, b) => b.total - a.total || a.key.localeCompare(b.key)).map((r) => r.key);
  const byFile = tally(rows, (r) => relFile(r.b.component));
  const fileOrder = [...byFile.values()].sort((a, b) => b.total - a.total || a.key.localeCompare(b.key)).map((r) => r.key);

  const first = (page.n - 1) * 200 + 1;
  const last = first + rows.length - 1;
  const heldN = c.fp + c.intentional;
  const openN = c.open + c.gone;

  const body = `
  ${header(
    `รายงานผลการแก้ไขตาม SonarQube · ชุดที่ ${page.n} จาก ${PAGES.length}`,
    `ชุดที่ ${page.n}: ${page.file}`,
    `ปัญหาลำดับที่ ${fmt(first)}–${fmt(last)} จากทั้งหมด ${fmt(page.total)} ข้อของการสแกนครั้งแรก (export หน้าละ 200 ข้อ)
     รายงานนี้ติดตามว่าแต่ละข้อในชุดนี้ตอนนี้อยู่ในสถานะใด`,
    after,
    `<dt>ไฟล์ต้นทาง</dt><dd class="code">${esc(page.file)}</dd>`,
  )}

  <h2>สรุปผล</h2>
  ${summary}
  <p style="margin-top:3mm">จาก ${fmt(rows.length)} ข้อในชุดนี้ SonarQube ยืนยันว่าแก้แล้ว ${fmt(c.fixed)} ข้อ${
    heldN ? ` · อีก ${fmt(heldN)} ข้อตรวจแล้วตั้งใจไม่แก้หรือเป็น false positive (มีเหตุผลรายข้อในหัวข้อ "ข้อที่ยังเปิดอยู่")` : ""
  }${openN ? ` · <b>ยังไม่ได้แก้ ${fmt(openN)} ข้อ</b>` : " · ไม่มีข้อที่ยังไม่ได้แก้"}</p>

  <h2>แยกตามความรุนแรง (Severity)</h2>
  ${breakdownTable("Severity", bySev, SEVERITIES, (k) => `<span class="sev">${esc(k)}</span>`)}

  <h2>แยกตามประเภท</h2>
  ${breakdownTable("ประเภท", byType, TYPES.map(([k]) => k), (k) => esc(Object.fromEntries(TYPES)[k] || k))}

  <h2>แยกตามส่วนของระบบ</h2>
  ${breakdownTable("ส่วนของระบบ", byApp, APPS.map(([, l]) => l).concat("อื่น ๆ"), esc)}

  <h2>ข้อที่ยังเปิดอยู่</h2>
  ${remainingTable(rows)}

  <h2 class="page-break">แยกตามกฎ (${fmt(byRule.size)} กฎ) — ปัญหาคืออะไร และแก้อย่างไร</h2>
  <p class="small muted">"แก้โดย" เขียนตามวิธีที่ใช้จริงในโปรเจกต์นี้ ไม่ใช่คำแนะนำทั่วไปของกฎ</p>
  ${breakdownTable("กฎ", byRule, ruleOrder, ruleCell, { firstClass: "rulecell" })}

  <h2>แยกตามไฟล์ (${fmt(byFile.size)} ไฟล์)</h2>
  ${breakdownTable("ไฟล์", byFile, fileOrder, (k) => `<span class="code">${esc(k)}</span>`)}

  ${methodNote(after)}
  <div class="note"><p>ผลการตรวจว่าระบบยังทำงานได้หลังแก้ (ตรวจ type, build และเทสต์อัตโนมัติ) รันกับทั้งระบบพร้อมกันครั้งเดียว
  จึงอยู่ในรายงานภาพรวม <span class="code">sonar-report-overview.pdf</span> หัวข้อ "หลักฐานว่าแก้แล้วระบบยังทำงานได้"</p></div>

  <h2 class="page-break">ภาคผนวก: รายการทั้งหมด ${fmt(rows.length)} ข้อในชุดนี้</h2>
  <p class="small muted">เรียงตาม severity แล้วตามไฟล์ · เลขบรรทัดเป็นตำแหน่งตอนสแกนก่อนแก้</p>
  ${fullList(rows)}
  `;
  return body;
}

function overviewReport(pageRows, after) {
  const all = pageRows.flat();
  const { c, html: summary } = summaryBlock(all);
  const beforeKeys = new Set(all.map((r) => r.b.key));
  const openNow = after.issues.filter((i) => i.status !== "CLOSED" && !i.resolution);
  const newOpen = openNow.filter((i) => !beforeKeys.has(i.key));
  const oldOpen = openNow.filter((i) => beforeKeys.has(i.key));
  const m = after.measures;
  const rating = (v) => ({ "1.0": "A", "2.0": "B", "3.0": "C", "4.0": "D", "5.0": "E" })[v] || v || "-";
  const gate = after.gate;

  const sevRow = (sev) => {
    const b = all.filter((r) => r.b.severity === sev).length;
    const o = oldOpen.filter((i) => i.severity === sev).length;
    const n = newOpen.filter((i) => i.severity === sev).length;
    return `<tr><td class="sev">${sev}</td><td class="num">${num(b)}</td><td class="num">${num(o)}</td><td class="num">${num(n)}</td><td class="num">${num(o + n)}</td></tr>`;
  };

  const perPage = PAGES.map((p, i) => {
    const rows = pageRows[i];
    const k = (x) => rows.filter((r) => r.state.kind === x).length;
    return `<tr><td>ชุดที่ ${p.n} · <span class="code">${esc(p.file)}</span></td><td class="num">${fmt(rows.length)}</td><td class="num">${num(k("fixed"))}</td><td class="num">${num(k("fp") + k("intentional"))}</td><td class="num">${num(k("open") + k("gone"))}</td><td class="small">${esc(p.out)}</td></tr>`;
  }).join("");

  const gateConditions = gate?.conditions?.length
    ? `<table class="keep"><thead><tr><th>เงื่อนไข</th><th class="num">ค่าจริง</th><th class="num">เกณฑ์</th><th>ผล</th></tr></thead><tbody>${gate.conditions
        .map(
          (x) =>
            `<tr><td class="code">${esc(x.metricKey)}</td><td class="num">${esc(x.actualValue)}</td><td class="num">${esc(x.comparator === "LT" ? "≥ " : "≤ ")}${esc(x.errorThreshold)}</td><td>${x.status === "OK" ? '<span class="pill fixed">ผ่าน</span>' : '<span class="pill open">ไม่ผ่าน</span>'}</td></tr>`,
        )
        .join("")}</tbody></table>`
    : "";

  const newList = newOpen.length
    ? `<table><thead><tr><th style="width:19mm">Severity</th><th style="width:15mm">กฎ</th><th>ไฟล์:บรรทัด · ข้อความ</th></tr></thead><tbody>${[...newOpen]
        .sort((x, y) => SEVERITIES.indexOf(x.severity) - SEVERITIES.indexOf(y.severity) || relFile(x.component).localeCompare(relFile(y.component)))
        .map(
          (i) =>
            `<tr><td class="sev">${esc(i.severity)}</td><td class="code">${esc(ruleId(i.rule))}</td><td><div class="code">${esc(relFile(i.component))}:${esc(i.line ?? "-")}</div><div class="small">${esc(i.message)}</div></td></tr>`,
        )
        .join("")}</tbody></table>`
    : "<p>ไม่มี</p>";

  // --- คุณภาพซอฟต์แวร์ (Clean Code taxonomy) — หนึ่งข้ออาจกระทบได้มากกว่าหนึ่งด้าน
  const hasQ = (issue, q) => (issue.impacts || []).some((x) => x.softwareQuality === q);
  const mins = (list) => list.reduce((s, i) => s + effortMinutes(i.effort), 0);
  const allBefore = all.map((r) => r.b);
  const qualityRows = QUALITIES.map(([q, en, th]) => {
    const b = allBefore.filter((i) => hasQ(i, q));
    const o = oldOpen.filter((i) => hasQ(i, q));
    const n = newOpen.filter((i) => hasQ(i, q));
    return `<tr><td><b>${en}</b> <span class="small muted">${th}</span></td><td class="num">${num(b.length)}</td><td class="num">${num(o.length)}</td><td class="num">${num(n.length)}</td><td class="num">${num(o.length + n.length)}</td><td class="num">${hoursText(mins(b))}</td><td class="num">${hoursText(mins([...o, ...n]))}</td></tr>`;
  }).join("");
  const debtRow = `<tr><td>รวมทุกข้อ</td><td class="num">${fmt(allBefore.length)}</td><td class="num">${fmt(oldOpen.length)}</td><td class="num">${fmt(newOpen.length)}</td><td class="num">${fmt(openNow.length)}</td><td class="num">${hoursText(mins(allBefore))}</td><td class="num">${hoursText(mins(openNow))}</td></tr>`;

  // --- 10 กฎที่เจอบ่อยสุด
  const ruleTally = tally(all, (r) => r.b.rule);
  const topRules = [...ruleTally.values()].sort((a, b) => b.total - a.total || a.key.localeCompare(b.key)).slice(0, 10);
  const topRulesTable = `<table><thead><tr><th>กฎ · ปัญหาคืออะไร</th><th class="num">ก่อนแก้</th><th class="num">แก้แล้ว</th><th class="num">ตั้งใจไม่แก้ / FP</th><th class="num">ยังไม่ได้แก้</th></tr></thead><tbody>${topRules
    .map((r) => {
      const g = RULE_GUIDE[ruleId(r.key)];
      return `<tr><td class="rulecell"><span class="code"><b>${esc(ruleId(r.key))}</b></span> <span class="small muted">${esc(after.rules[r.key] || "")}</span>${g ? `<div class="rg">${esc(g.problem)}</div>` : ""}</td><td class="num">${num(r.total)}</td><td class="num">${num(r.fixed)}</td><td class="num">${num(r.fp + r.intentional)}</td><td class="num">${num(r.open + r.gone)}</td></tr>`;
    })
    .join("")}</tbody></table>`;

  // --- หลักฐานว่าระบบยังทำงานได้
  const checks = latestChecks();
  const checksBlock = checks
    ? `<p>รันเมื่อ ${esc(thDateTime(checks.ranAt))} บนเครื่องพัฒนา (Node ${esc(checks.node)}, ${esc(checks.platform)}) ด้วยสคริปต์ <span class="code">sonar-reports/run-checks.cjs</span> · ผลดิบอยู่ในไฟล์ <span class="code">${esc(checks.file)}</span></p>
  <table class="keep"><thead><tr><th>รายการตรวจ</th><th>คำสั่ง</th><th>ผล</th><th class="num">เวลา</th></tr></thead><tbody>${checks.results
    .map(
      (r) =>
        `<tr><td>${esc(r.label)}${
          r.detail
            ? `<div class="small muted">${fmt(r.detail.passed)}/${fmt(r.detail.tests)} เทสต์ผ่าน · ${fmt(r.detail.suitesPassed)}/${fmt(r.detail.suites)} ไฟล์เทสต์${r.detail.failed ? ` · ล้ม ${fmt(r.detail.failed)}` : ""}${r.detail.pending ? ` · ข้าม ${fmt(r.detail.pending)}` : ""}</div>`
            : ""
        }${(r.failures || []).map((f) => `<div class="small fail">${esc(f)}</div>`).join("")}</td><td class="code">${esc(r.command)}</td><td>${r.passed ? '<span class="pass">ผ่าน</span>' : '<span class="fail">ไม่ผ่าน</span>'}</td><td class="num">${fmt(r.seconds)} วิ.</td></tr>`,
    )
    .join("")}</tbody></table>`
    : `<p>ยังไม่มีผลรัน — รัน <span class="code">node sonar-reports/run-checks.cjs</span> ก่อนสร้างรายงาน</p>`;

  const historyBlock = `
  <h3>บันทึกการตรวจระหว่างแก้ (19 ก.ย. 2569)</h3>
  <p class="small muted">บันทึกไว้ในบันทึกการทำงานระหว่างแก้แต่ละชุด ไม่มีไฟล์ log ต้นฉบับแนบ — ตัวเลขเทสต์น้อยกว่าผลปัจจุบันเพราะเทสต์ถูกเขียนเพิ่มภายหลัง</p>
  <table class="keep"><thead><tr><th style="width:38mm">หลังแก้</th><th>สิ่งที่ตรวจและผล</th></tr></thead><tbody>
    <tr><td>ชุดที่ 1</td><td>ตรวจ type ทุกแพ็กเกจผ่าน · build ทั้งสองแอปผ่าน · Jest 632/632 · ทดสอบ API แบบอ่านอย่างเดียว 38/38 (จำนวนแถวข้อมูลธุรกิจไม่เปลี่ยน) · ทดสอบบนเบราว์เซอร์ฝั่งลูกค้า: แถบเมนู ลิ้นชักเมนูมือถือ กล่องยืนยัน การตรวจอีเมล</td></tr>
    <tr><td>ชุดที่ 2</td><td>ตรวจ type 5/5 · Jest 632/632 · API 38/38 · ทดสอบบนเบราว์เซอร์ฝั่งพนักงาน 21/21 (2FA, ช่องค้นหา, กล่องยืนยัน, แฟ้มลูกค้า) · หน้าหมวดงาน 13/13 · แท็บ BOQ 15/15</td></tr>
    <tr><td>ชุดที่ 3</td><td>ตรวจ type + build ผ่าน · ทดสอบบนเบราว์เซอร์ 36/36 (ล็อกอิน + 2FA, การ์ดแม่แบบ, กล่องคำขอ, ตั้งค่า, คลังรูป, หน้าโครงการ) · ชุดเดิม 21/21, 15/15, 13/13 · API 38/38</td></tr>
    <tr><td>แยก ProjectDetailPage (S3776)</td><td>ข้อความบนหน้าจอของโครงการจริง 3 โครงการ ตรงกับไฟล์ก่อนแยกครบทั้ง 39 สถานะ</td></tr>
    <tr><td>แยก TemplateDetailPage (S3776)</td><td>เทียบ HTML ของหน้าบนแม่แบบจริง 2 ชุด 49 สถานะ ตรงกันทุกไบต์</td></tr>
  </tbody></table>
  <div class="note"><p><b>ขอบเขตของหลักฐานนี้:</b> การผ่านทั้งหมดยืนยันว่าเทสต์และการตรวจที่มีอยู่ไม่พังหลังแก้ ไม่ได้พิสูจน์ว่าไม่มีบั๊กเลย ·
  เทสต์อัตโนมัติ (Jest) มีเฉพาะฝั่ง server ส่วนหน้าเว็บทั้งสองแอปตรวจด้วย type check, build และสคริปต์ทดสอบบนเบราว์เซอร์ระหว่างทำงาน</p></div>`;

  const openVulns = openNow.filter((i) => i.type === "VULNERABILITY");
  const vulnNote = openVulns.length
    ? `<div class="note"><p><b>Vulnerability ที่เปิดอยู่ ${fmt(openVulns.length)} ข้อ</b> (ที่มาของ Security Rating ${rating(m.security_rating)}):</p>${openVulns
        .map(
          (i) =>
            `<p><span class="code">${esc(ruleId(i.rule))}</span> ${esc(after.rules[i.rule] || "")} — <span class="code">${esc(relFile(i.component))}:${esc(i.line ?? "-")}</span> · ${
              beforeKeys.has(i.key) ? "อยู่ในชุด export เดิม" : "เป็นข้อใหม่หลังการสแกนครั้งแรก ไม่อยู่ใน 542 ข้อเดิม"
            }</p>`,
        )
        .join("")}</div>`
    : "";
  const coverageNote =
    m.coverage === "0.0"
      ? `<div class="note"><p><b>Test Coverage 0.0%</b> ไม่ได้แปลว่าไม่มีเทสต์ — ฝั่ง server มีเทสต์อัตโนมัติ (Jest) แต่การสแกนรอบนี้ไม่ได้รัน <span class="code">npx jest --coverage</span> ก่อน จึงไม่มีไฟล์ <span class="code">server/coverage/lcov.info</span> ส่งให้ SonarQube
      ${gate && gate.status !== "OK" ? " · Quality Gate ที่ไม่ผ่านมาจากเงื่อนไขในตารางด้านบน" : ""}</p></div>`
      : "";

  return `
  ${header(
    "รายงานผลการแก้ไขตาม SonarQube · ภาพรวม",
    "ภาพรวมก่อนและหลังแก้ทั้งโปรเจกต์",
    `สรุปรวมทั้ง 3 ชุด export (${fmt(all.length)} ข้อ) พร้อมสถานะปัจจุบันของโปรเจกต์ตามหัวข้อในคู่มือ (Quality Gate, ตัวชี้วัดหลัก, จำนวนตาม severity)
     รายละเอียดรายข้อแยกอยู่ในรายงานของแต่ละชุด`,
    after,
  )}

  <h2>ผลการแก้ไข ${fmt(all.length)} ข้อจากการสแกนครั้งแรก</h2>
  ${summary}
  <table class="keep" style="margin-top:4mm">
    <thead><tr><th>ชุด</th><th class="num">ข้อ</th><th class="num">แก้แล้ว</th><th class="num">ตั้งใจไม่แก้ / FP</th><th class="num">ยังไม่ได้แก้</th><th>ไฟล์รายงาน</th></tr></thead>
    <tbody>${perPage}</tbody>
    <tfoot><tr><td>รวม</td><td class="num">${fmt(all.length)}</td><td class="num">${fmt(c.fixed)}</td><td class="num">${fmt(c.fp + c.intentional)}</td><td class="num">${fmt(c.open + c.gone)}</td><td></td></tr></tfoot>
  </table>

  <h2>หนี้ทางเทคนิคและคุณภาพซอฟต์แวร์</h2>
  <p class="small muted">แยกตาม Software Quality ของ SonarQube รุ่นใหม่ · หนึ่งข้ออาจกระทบมากกว่าหนึ่งด้าน ผลรวมรายด้านจึงอาจมากกว่าแถวรวม · เวลาเป็นค่าที่ SonarQube ประเมิน (1 วัน = 8 ชม.)</p>
  <table class="keep">
    <thead><tr><th>ด้าน</th><th class="num">ก่อนแก้</th><th class="num">ข้อเดิมที่ยังเปิด</th><th class="num">ข้อใหม่</th><th class="num">เปิดอยู่ตอนนี้</th><th class="num">เวลาแก้ ก่อน</th><th class="num">เวลาแก้ ตอนนี้</th></tr></thead>
    <tbody>${qualityRows}</tbody>
    <tfoot>${debtRow}</tfoot>
  </table>

  <h2>กฎที่เจอบ่อยที่สุด 10 อันดับ</h2>
  <p class="small muted">วิธีแก้ของทุกกฎอยู่ในรายงานแต่ละชุด หัวข้อ "แยกตามกฎ"</p>
  ${topRulesTable}

  <h2>จำนวนข้อที่เปิดอยู่ตาม Severity</h2>
  <p class="small muted">นับเฉพาะข้อที่ยังเปิด (resolved=false) · "ข้อใหม่" คือปัญหาจากโค้ดที่เขียนหลังการสแกนครั้งแรก ไม่อยู่ในไฟล์ export ทั้ง 3 ชุด</p>
  <table class="keep">
    <thead><tr><th>Severity</th><th class="num">ก่อนแก้ (18 ก.ย.)</th><th class="num">ข้อเดิมที่ยังเปิด</th><th class="num">ข้อใหม่</th><th class="num">เปิดอยู่ตอนนี้</th></tr></thead>
    <tbody>${SEVERITIES.map(sevRow).join("")}</tbody>
    <tfoot><tr><td>รวม</td><td class="num">${fmt(all.length)}</td><td class="num">${fmt(oldOpen.length)}</td><td class="num">${fmt(newOpen.length)}</td><td class="num">${fmt(openNow.length)}</td></tr></tfoot>
  </table>

  <h2>Quality Gate และตัวชี้วัดหลัก (ปัจจุบัน)</h2>
  <p>Quality Gate: ${gate ? `<span class="gate ${gate.status === "OK" ? "ok" : "error"}">${gate.status === "OK" ? "PASSED" : "FAILED"}</span>` : "ไม่มีสิทธิ์อ่านด้วย token นี้"}</p>
  ${gateConditions}
  <table class="keep">
    <thead><tr><th>ตัวชี้วัด</th><th class="num">ค่า</th></tr></thead>
    <tbody>
      <tr><td>Bugs</td><td class="num">${esc(m.bugs ?? "-")}</td></tr>
      <tr><td>Vulnerabilities</td><td class="num">${esc(m.vulnerabilities ?? "-")}</td></tr>
      <tr><td>Security Hotspots</td><td class="num">${esc(m.security_hotspots ?? "-")}</td></tr>
      <tr><td>Code Smells</td><td class="num">${esc(m.code_smells ?? "-")}</td></tr>
      <tr><td>Test Coverage (%)</td><td class="num">${esc(m.coverage ?? "-")}</td></tr>
      <tr><td>Duplicated Lines (%)</td><td class="num">${esc(m.duplicated_lines_density ?? "-")}</td></tr>
      <tr><td>Lines of Code</td><td class="num">${m.ncloc ? fmt(m.ncloc) : "-"}</td></tr>
      <tr><td>Reliability Rating</td><td class="num">${rating(m.reliability_rating)}</td></tr>
      <tr><td>Security Rating</td><td class="num">${rating(m.security_rating)}</td></tr>
      <tr><td>Maintainability Rating</td><td class="num">${rating(m.sqale_rating)}</td></tr>
    </tbody>
  </table>
  ${vulnNote}
  ${coverageNote}

  <h2>หลักฐานว่าแก้แล้วระบบยังทำงานได้</h2>
  <p>การแก้ code smell หลายร้อยจุดเสี่ยงทำให้ส่วนที่เคยทำงานได้พังโดยไม่ตั้งใจ จึงตรวจทั้งระบบซ้ำด้วยเครื่องมือชุดเดียวกับที่ใช้ระหว่างพัฒนา</p>
  <h3>ผลตรวจล่าสุด</h3>
  ${checksBlock}
  ${historyBlock}

  <h2>ข้อใหม่หลังการสแกนครั้งแรก (${fmt(newOpen.length)} ข้อ)</h2>
  <p class="small muted">ปัญหาเหล่านี้มาจากโค้ดที่เพิ่มหรือแก้หลัง 18 ก.ย. 2569 จึงไม่อยู่ในไฟล์ export ทั้ง 3 ชุดและไม่ได้นับในผลการแก้ไขด้านบน</p>
  ${newList}

  ${methodNote(after)}
  `;
}

function wrap(title, body) {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(title)}</title>
  <style>${fontFace()}${CSS}</style></head><body>${body}</body></html>`;
}

async function toPdf(browser, html, outFile, title) {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.pdf({
    path: outFile,
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: "<span></span>",
    footerTemplate: `<div style="width:100%;font-size:7.5pt;color:#8a8fa3;padding:0 16mm;display:flex;justify-content:space-between;font-family:Tahoma,sans-serif">
      <span>SystemBOQ · SonarQube · ${esc(title)}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    margin: { top: "15mm", bottom: "16mm", left: "16mm", right: "16mm" },
  });
  await page.close();
}

async function main() {
  const fromIdx = process.argv.indexOf("--from");
  let after;
  if (fromIdx > -1) {
    after = JSON.parse(fs.readFileSync(path.resolve(ROOT, process.argv[fromIdx + 1]), "utf8"));
  } else {
    after = await fetchAfter();
    const stamp = new Date(after.fetchedAt).toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
    const snap = path.join(ROOT, `issues_after_${stamp}.json`);
    fs.writeFileSync(snap, JSON.stringify(after, null, 1));
    console.log(`saved snapshot ${path.basename(snap)} (${after.issues.length} issues)`);
  }

  RULES_NAME = after.rules;
  const byKey = new Map(after.issues.map((i) => [i.key, i]));
  const pages = loadBefore();
  const pageRows = pages.map((p) =>
    p.issues.map((b) => {
      const a = byKey.get(b.key) || null;
      return { b, a, state: classify(b, a) };
    }),
  );

  const browser = await puppeteer.launch({ args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  try {
    for (let i = 0; i < pages.length; i++) {
      const title = `ชุดที่ ${pages[i].n} (${pages[i].file})`;
      await toPdf(browser, wrap(`SonarQube ${title}`, pageReport(pages[i], pageRows[i], after)), path.join(OUT_DIR, pages[i].out), `page ${pages[i].n} (${pages[i].file})`);
      const k = (x) => pageRows[i].filter((r) => r.state.kind === x).length;
      console.log(`${pages[i].out}: ${pageRows[i].length} issues · fixed ${k("fixed")} · fp ${k("fp")} · intentional ${k("intentional")} · open ${k("open")} · gone ${k("gone")}`);
    }
    await toPdf(browser, wrap("SonarQube ภาพรวม", overviewReport(pageRows, after)), path.join(OUT_DIR, "sonar-report-overview.pdf"), "overview");
    console.log("sonar-report-overview.pdf");
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
