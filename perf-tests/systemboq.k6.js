// Performance test ของ SystemBOQ ด้วย k6 — รันผ่าน perf-tests/run-all.sh (k6 ใน Docker)
//
// ผู้ใช้จำลอง 2 กลุ่มพร้อมกัน:
//   visitor = คนเปิดเว็บลูกค้า (ค่าตั้งเว็บ แบบบ้าน ผลงาน) ไม่ต้องล็อกอิน
//   staff   = พนักงานทำงานประจำ (แดชบอร์ด → รายการโครงการ → เปิดโครงการ → BOQ → คลังวัสดุ ฯลฯ)
//   pdf     = สร้าง PDF ใบเสนอราคา (หนักสุด: เปิด Chromium) — แยกทดสอบเป็นของมันเอง
//
// TEST_TYPE เลือกรูปแบบโหลด: smoke · load · stress · spike · pdf
// ล็อกอินครั้งเดียวใน setup() แล้วทุกคนใช้ session เดิม — เส้นล็อกอินจำกัด 20 ครั้ง/15 นาที/IP
// ไม่ยิงเส้นที่ส่งอีเมล (สมัคร ลืมรหัส ส่งรหัสยืนยัน) และไม่เขียนข้อมูล — อ่านอย่างเดียว
import http from "k6/http";
import { check, group, sleep } from "k6";

const API = __ENV.API || "http://host.docker.internal:4000";
const PROJECT = __ENV.PROJECT_ID;
const QUOTE = __ENV.QUOTE_ID;
const TYPE = __ENV.TEST_TYPE || "smoke";

// ระดับผู้ใช้ของแต่ละรูปแบบ — staff กับ visitor ไต่พร้อมกันจำนวนเท่ากัน
const PROFILES = {
  smoke: [{ duration: "30s", target: 1 }],
  load: [
    { duration: "1m", target: 20 },
    { duration: "3m", target: 20 },
    { duration: "30s", target: 0 },
  ],
  stress: [
    { duration: "1m", target: 25 },
    { duration: "1m", target: 50 },
    { duration: "1m", target: 100 },
    { duration: "1m", target: 150 },
    { duration: "30s", target: 0 },
  ],
  spike: [
    { duration: "30s", target: 5 },
    { duration: "10s", target: 150 },
    { duration: "40s", target: 150 },
    { duration: "10s", target: 5 },
    { duration: "40s", target: 5 },
  ],
};

function ramping(exec) {
  return { executor: "ramping-vus", startVUs: TYPE === "smoke" ? 1 : 0, stages: PROFILES[TYPE], exec, gracefulRampDown: "10s" };
}

export const options = {
  scenarios:
    TYPE === "pdf"
      ? {
          // PDF ทีละระดับ 1 → 3 → 5 คนพร้อมกัน ระดับละ 1 นาที
          pdf: {
            executor: "ramping-vus",
            startVUs: 1,
            stages: [
              { duration: "1m", target: 1 },
              { duration: "10s", target: 3 },
              { duration: "1m", target: 3 },
              { duration: "10s", target: 5 },
              { duration: "1m", target: 5 },
            ],
            exec: "pdfFlow",
          },
        }
      : { staff: ramping("staffFlow"), visitor: ramping("visitorFlow") },
  // เกณฑ์ที่รายงานใช้ตัดสิน (ไม่หยุดการทดสอบเมื่อไม่ผ่าน — อยากเห็นจุดที่พัง)
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{kind:read}": ["p(95)<800"],
    "http_req_duration{kind:pdf}": ["p(95)<15000"],
  },
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max", "count"],
  discardResponseBodies: true,
  insecureSkipTLSVerify: true,
};

export function setup() {
  const res = http.post(
    `${API}/api/auth/staff/login`,
    JSON.stringify({ username: __ENV.STAFF_USER, password: __ENV.STAFF_PASS }),
    { headers: { "Content-Type": "application/json" }, responseType: "text", tags: { name: "setup:login" } },
  );
  if (res.status !== 200) throw new Error(`ล็อกอินบัญชีทดสอบไม่ผ่าน: ${res.status}`);
  const cookie = Object.entries(res.cookies)
    .map(([name, values]) => `${name}=${values[0].value}`)
    .join("; ");
  return { cookie };
}

function get(path, name, cookie, kind = "read") {
  // ส่ง Accept-Encoding แบบเบราว์เซอร์จริง (รอบ 2 ขึ้นไป — เซิร์ฟเวอร์บีบอัด gzip ให้เมื่อผู้ขอรองรับ)
  // รอบ 1 เซิร์ฟเวอร์ยังไม่บีบอัด หัวนี้จึงไม่มีผลต่อการเทียบ
  const headers = { "Accept-Encoding": "gzip, deflate, br" };
  if (cookie) headers.Cookie = cookie;
  const params = { tags: { name, kind }, headers, timeout: kind === "pdf" ? "120s" : "60s" };
  const res = http.get(`${API}${path}`, params);
  check(res, { [`${name} 200`]: (r) => r.status === 200 });
  return res;
}

export function visitorFlow() {
  group("visitor", () => {
    get("/api/public/settings", "public:settings");
    get("/api/public/house-designs/featured", "public:house-designs-featured");
    get("/api/public/house-designs", "public:house-designs");
    get("/api/public/portfolio", "public:portfolio");
  });
  sleep(1 + Math.random() * 2); // เวลาอ่านหน้าเว็บ
}

export function staffFlow(data) {
  const c = data.cookie;
  group("staff", () => {
    get("/api/auth/me", "staff:me", c);
    get("/api/dashboard/summary", "staff:dashboard-summary", c);
    get("/api/dashboard/pipeline", "staff:dashboard-pipeline", c);
    get("/api/notifications", "staff:notifications", c);
    sleep(1);
    get("/api/projects?page=1", "staff:projects-list", c);
    get(`/api/projects/${PROJECT}`, "staff:project-detail", c);
    get(`/api/projects/${PROJECT}/boq`, "staff:project-boq", c);
    get(`/api/projects/${PROJECT}/quotes`, "staff:project-quotes", c);
    sleep(1);
    get("/api/materials", "staff:materials", c);
    get("/api/customers", "staff:customers", c);
    get("/api/leads", "staff:leads", c);
  });
  sleep(1 + Math.random() * 2);
}

export function pdfFlow(data) {
  get(`/api/projects/${PROJECT}/quotes/${QUOTE}/pdf`, "pdf:quote", data.cookie, "pdf");
  sleep(1);
}

// ผลสรุปเป็น JSON ให้ตัวสร้างรายงาน Excel อ่าน
export function handleSummary(data) {
  // setup_data = ค่าที่ setup() คืน = cookie session ของบัญชีทดสอบ — ห้ามเขียนลงไฟล์ผล
  delete data.setup_data;
  const m = data.metrics;
  const p95 = (name) => (m[name] ? Math.round(m[name].values["p(95)"]) : "-");
  const line =
    `${TYPE}: requests ${m.http_reqs.values.count} · ${m.http_reqs.values.rate.toFixed(1)}/s · ` +
    `failed ${(m.http_req_failed.values.rate * 100).toFixed(2)}% · p95 ${p95("http_req_duration")} ms\n`;
  return { stdout: line, [`/results/${TYPE}-summary.json`]: JSON.stringify(data, null, 2) };
}
