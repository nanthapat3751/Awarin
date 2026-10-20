import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

/**
 * ค่าที่ต้องรู้โดเมนจริงของเว็บ — การ์ดตอนแชร์ลิงก์ (og:image ต้องเป็น URL เต็ม) และ robots.txt
 *
 * VITE_SITE_URL      โดเมนเว็บลูกค้า เช่น https://awarin.co.th (ไม่ตั้ง = http://localhost:5174)
 * VITE_API_BASE_URL  ที่อยู่ API ตัวเดียวกับที่แอปเรียก — robots.txt ชี้ไป sitemap.xml ที่ API สร้างจากข้อมูลจริง
 *
 * LINE/Facebook ไม่รันโค้ดหน้าเว็บ อ่านแค่ index.html ตั้งต้น การ์ดจึงเหมือนกันทุกหน้า (รูป + ชื่อบริษัท)
 * การ์ดรายแบบบ้านต้องให้เซิร์ฟเวอร์ใส่ข้อมูลก่อนส่งหน้า — ทำได้เมื่อเลือกที่ deploy แล้ว
 */
function siteMeta(siteUrl: string, apiUrl: string): Plugin {
  // หน้าที่ต้องล็อกอิน/ลิงก์ใช้ครั้งเดียว — ให้เครื่องมือค้นหาเก็บไปก็ได้แค่หน้าล็อกอินหรือ "ลิงก์หมดอายุ"
  const robots = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /my/",
    "Disallow: /login",
    "Disallow: /register",
    "Disallow: /verify-email",
    "Disallow: /forgot-password",
    "Disallow: /reset-password/",
    "Disallow: /activate/",
    "",
    `Sitemap: ${apiUrl}/api/public/sitemap.xml`,
    "",
  ].join("\n");

  const serveRobots = (req: { url?: string }, res: { setHeader: (k: string, v: string) => void; end: (b: string) => void }, next: () => void) => {
    if (req.url !== "/robots.txt") return next();
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(robots);
  };

  return {
    name: "site-meta",
    // order "pre" = แทนค่าก่อน Vite ประมวลผล HTML — Vite ถือว่า og:image เป็นไฟล์ในเว็บ ถ้ายังเป็น __SITE_URL__
    // ตอนนั้นจะถูกเติม "/" นำหน้ากลายเป็น "/http://..." (เจอจริงตอนทดสอบ)
    transformIndexHtml: { order: "pre", handler: (html) => html.replaceAll("__SITE_URL__", siteUrl) },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "robots.txt", source: robots });
    },
    configureServer: (server) => void server.middlewares.use(serveRobots),
    configurePreviewServer: (server) => void server.middlewares.use(serveRobots),
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const trim = (s: string) => s.replace(/\/+$/, "");
  const siteUrl = trim(env.VITE_SITE_URL || "http://localhost:5174");
  const apiUrl = trim(env.VITE_API_BASE_URL || "http://localhost:4000");
  return {
    plugins: [react(), tailwindcss(), siteMeta(siteUrl, apiUrl)],
    server: {
      port: 5174,
    },
  };
});
