import { Router } from "express";

import { clientBaseUrl } from "../../lib/access-token";
import { prisma } from "../../lib/prisma";

/**
 * sitemap.xml ของเว็บไซต์ลูกค้า — บอก Google ว่ามีหน้าอะไรบ้าง รวมแบบบ้าน/ผลงานรายหลังที่เผยแพร่อยู่
 *
 * อยู่ที่ API เพราะรายการแบบบ้าน/ผลงานเปลี่ยนตามข้อมูล (ไฟล์คงที่ในเว็บจะเก่าทันทีที่พนักงานเพิ่มหลังใหม่)
 * robots.txt ของเว็บลูกค้าชี้มาที่นี่ (ดู client-app/vite.config.ts) — โปรโตคอล sitemap ยอมให้อยู่คนละโดเมน
 * ได้เมื่อ robots.txt ของเว็บเป็นคนชี้ · URL ในไฟล์ใช้ CLIENT_BASE_URL ตัวเดียวกับลิงก์ในอีเมล
 *
 * ไม่ใส่หน้าพอร์ทัล /my/* และหน้าเข้าสู่ระบบ — ต้องล็อกอิน คนค้นหาเปิดแล้วเจอแต่หน้าล็อกอิน
 */
const STATIC_PAGES: { path: string; priority: string; changefreq: string }[] = [
  { path: "/", priority: "1.0", changefreq: "weekly" },
  { path: "/house-designs", priority: "0.9", changefreq: "weekly" },
  { path: "/portfolio", priority: "0.8", changefreq: "weekly" },
  { path: "/about", priority: "0.6", changefreq: "monthly" },
  { path: "/services", priority: "0.7", changefreq: "monthly" },
  { path: "/contact", priority: "0.6", changefreq: "yearly" },
  { path: "/privacy", priority: "0.2", changefreq: "yearly" },
];

const escapeXml = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");

const day = (d: Date) => d.toISOString().slice(0, 10);

export async function buildSitemapXml(): Promise<string> {
  const base = clientBaseUrl();
  const [designs, portfolio] = await Promise.all([
    prisma.houseDesign.findMany({
      where: { published: true, deletedAt: null },
      select: { id: true, updatedAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.portfolio.findMany({
      where: { published: true, deletedAt: null },
      select: { id: true, publishedAt: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const urls = [
    ...STATIC_PAGES.map((p) => ({ loc: `${base}${p.path}`, lastmod: null as string | null, ...p })),
    ...designs.map((d) => ({
      loc: `${base}/house-designs/${d.id}`,
      lastmod: day(d.updatedAt),
      priority: "0.8",
      changefreq: "monthly",
    })),
    ...portfolio.map((p) => ({
      loc: `${base}/portfolio/${p.id}`,
      lastmod: day(p.publishedAt ?? p.createdAt),
      priority: "0.6",
      changefreq: "yearly",
    })),
  ];

  const body = urls
    .map(
      (u) =>
        `  <url>\n    <loc>${escapeXml(u.loc)}</loc>\n` +
        (u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>\n` : "") +
        `    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

export const sitemapRouter = Router();

sitemapRouter.get("/", async (_req, res) => {
  const xml = await buildSitemapXml();
  // ให้ Google/CDN เก็บไว้ได้ชั่วโมงหนึ่ง — แบบบ้านใหม่ไม่ต้องขึ้นใน sitemap ภายในวินาที
  res.setHeader("Cache-Control", "public, max-age=3600");
  // helmet ตั้ง CORP same-origin — ไฟล์นี้ตั้งใจให้คนนอกโดเมน (โปรแกรมของเครื่องมือค้นหา) อ่าน
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.type("application/xml").send(xml);
});
