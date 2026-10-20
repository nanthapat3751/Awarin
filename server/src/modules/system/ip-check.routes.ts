import { classifyIp, type IpCheckDto, type IpCheckVerdict, type IpInfo } from "@systemboq/shared-types";
import { Router, type Request } from "express";

import { geoLookup, geoipStatus } from "../../lib/geoip";
import { requireAuth } from "../../middleware/auth";
import { requireRole } from "../../middleware/rbac";

/**
 * ตรวจว่าไอพีที่ระบบบันทึกเป็นของคนใช้งานจริงไหม — หน้าตั้งค่า > การรับ IP (เฉพาะ OWNER)
 *
 * ไอพีในแฟ้มลูกค้าจะเชื่อถือได้ก็ต่อเมื่อการตั้งค่า proxy ถูก: ถ้า API อยู่หลัง Docker/nginx แล้วไม่ได้
 * ตั้ง TRUST_PROXY ทุกแถวจะเป็นไอพีของ proxy ตัวเดียวกันหมด (เช่น 172.21.0.1) ดูจากตารางไม่ออกว่าผิด
 * ปลายทางนี้ให้เจ้าของเปิดจากเน็ตข้างนอกหนึ่งครั้งหลังขึ้นระบบ แล้วได้คำตอบตรง ๆ ว่าใช้ได้หรือต้องแก้อะไร
 *
 * คืนเฉพาะไอพีของ "คนที่กำลังเปิด" (คือเจ้าของเอง) กับชื่อหัวข้อมูลที่ proxy ใส่มา ไม่คืนค่าหัวอื่น
 */
const FORWARD_HEADERS = ["x-forwarded-for", "x-real-ip", "forwarded", "cf-connecting-ip", "true-client-ip"];

function forwardedChain(req: Request): IpInfo[] {
  const raw = req.get("x-forwarded-for");
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => classifyIp(part))
    .filter((ip): ip is IpInfo => ip !== null);
}

/** ตัดสินจากสิ่งที่เห็นในคำขอ — ลำดับสำคัญ: ปัญหาความปลอดภัยก่อน แล้วค่อยดูว่าได้ไอพีจริงไหม */
export function ipCheckVerdict(input: {
  seen: IpInfo | null;
  forwardedFor: IpInfo[];
  trustProxy: string | null;
}): IpCheckVerdict {
  // เชื่อทุกชั้น = ใครก็ส่ง X-Forwarded-For ปลอมมาได้ ไอพีในบันทึกกับ rate limit ต่อไอพีจึงเชื่อไม่ได้
  if (input.trustProxy === "true") return "trust-all";
  if (input.seen?.kind === "public") return "ok";
  // มีไอพีสาธารณะอยู่ในหัว แต่ระบบไม่ได้ใช้ = proxy ทำงานแล้ว เหลือแค่บอกให้ระบบเชื่อ
  if (input.forwardedFor.some((ip) => ip.kind === "public")) return "proxy-untrusted";
  if (input.seen?.kind === "loopback" && input.forwardedFor.length === 0) return "local";
  if (input.forwardedFor.length > 0) return "local-network";
  // มาจากวงภายใน (Docker/proxy) โดยไม่มีใครส่งไอพีต้นทางมา — แยกจากเปิดในวง LAN ไม่ได้ ให้ลองจากเน็ตข้างนอก
  return input.seen?.kind === "private" || input.seen?.kind === "cgnat" ? "proxy-no-forward" : "local-network";
}

export const ipCheckRouter = Router();

ipCheckRouter.get("/ip-check", requireAuth, requireRole("OWNER"), (req, res) => {
  const forwardedFor = forwardedChain(req);
  const trustProxy = process.env.TRUST_PROXY?.trim() || null;
  const seen = classifyIp(req.ip);
  const body: IpCheckDto = {
    seen,
    socket: classifyIp(req.socket.remoteAddress),
    forwardedFor,
    forwardHeaders: FORWARD_HEADERS.filter((h) => req.get(h) !== undefined),
    trustProxy,
    verdict: ipCheckVerdict({ seen, forwardedFor, trustProxy }),
    seenGeo: geoLookup(seen?.address),
    geoip: geoipStatus(),
  };
  res.setHeader("Cache-Control", "no-store");
  res.json(body);
});
