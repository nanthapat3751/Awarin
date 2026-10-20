/**
 * แปลง User-Agent เป็นข้อความที่คนอ่านออก สำหรับหน้า "อุปกรณ์ที่เข้าสู่ระบบ" เช่น "Chrome · Windows"
 *
 * เขียนเองไม่กี่บรรทัดแทน ua-parser-js เพราะรุ่นใหม่ของตัวนั้นเปลี่ยนไลเซนส์เป็น AGPL และที่นี่ต้อง
 * การแค่ชื่อเบราว์เซอร์/ระบบ ไม่ต้องรู้รุ่นเครื่อง · ลำดับการเช็คสำคัญ: Edge/Opera/Samsung ใส่คำว่า
 * "Chrome" มาด้วย และ Chrome ใส่คำว่า "Safari" มาด้วย ตัวที่เจาะจงกว่าต้องเช็คก่อน
 */
export interface DeviceInfo {
  browser: string;
  os: string;
  kind: "desktop" | "mobile" | "tablet" | "bot";
}

// โปรแกรมที่ยิงคำขอเอง ไม่ใช่คนเปิดเบราว์เซอร์ — ต้องเช็คก่อนตารางเบราว์เซอร์ เพราะ HeadlessChrome
// ใส่คำว่า "Chrome" มาด้วย แถวแบบนี้ในแฟ้มลูกค้าแปลว่าสคริปต์/บอท ไม่ใช่ลูกค้านั่งดูเอง
const AUTOMATION: [RegExp, string][] = [
  [/HeadlessChrome/, "Chrome อัตโนมัติ (Headless)"],
  [/^curl\//i, "เครื่องมืออัตโนมัติ (curl)"],
  [/^Wget\//i, "เครื่องมืออัตโนมัติ (Wget)"],
  [/PostmanRuntime\//, "เครื่องมืออัตโนมัติ (Postman)"],
  [/python-requests|aiohttp|httpx/i, "เครื่องมืออัตโนมัติ (Python)"],
  [/node-fetch|undici|axios|^node$/i, "เครื่องมืออัตโนมัติ (Node.js)"],
  [/okhttp/i, "เครื่องมืออัตโนมัติ (OkHttp)"],
  [/bot\b|crawler|spider/i, "บอท/โปรแกรมเก็บข้อมูล"],
];

const BROWSERS: [RegExp, string][] = [
  [/EdgA?\/|Edg\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/Line\//, "LINE"],
  [/FBAN|FBAV/, "Facebook"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
];

const SYSTEMS: [RegExp, string][] = [
  [/iPad/, "iPad"],
  [/iPhone|iPod/, "iPhone"],
  [/Android/, "Android"],
  [/Windows/, "Windows"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/CrOS/, "ChromeOS"],
  [/Linux/, "Linux"],
];

function firstMatch(ua: string, table: [RegExp, string][]): string | null {
  return table.find(([re]) => re.test(ua))?.[1] ?? null;
}

function kindOf(ua: string, os: string | null): DeviceInfo["kind"] {
  if (os === "iPad" || (/Android/.test(ua) && !/Mobile/.test(ua))) return "tablet";
  if (os === "iPhone" || /Mobile/.test(ua)) return "mobile";
  return "desktop";
}

export function describeUserAgent(ua: string | null | undefined): DeviceInfo {
  if (!ua) return { browser: "ไม่ทราบเบราว์เซอร์", os: "ไม่ทราบระบบ", kind: "desktop" };
  const tool = firstMatch(ua, AUTOMATION);
  if (tool) return { browser: tool, os: firstMatch(ua, SYSTEMS) ?? "ระบบอื่น", kind: "bot" };
  const os = firstMatch(ua, SYSTEMS);
  return {
    browser: firstMatch(ua, BROWSERS) ?? "เบราว์เซอร์อื่น",
    os: os ?? "ระบบอื่น",
    kind: kindOf(ua, os),
  };
}

/** ข้อความสั้นหนึ่งบรรทัดสำหรับตาราง — "Chrome · Windows" · เครื่องมืออัตโนมัติไม่ต่อชื่อระบบ · ไม่มี UA = null */
export function deviceLabel(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const d = describeUserAgent(ua);
  return d.kind === "bot" ? d.browser : `${d.browser} · ${d.os}`;
}
