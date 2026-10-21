import {
  GEOIP_ATTRIBUTION,
  IP_KIND_LABEL,
  type IpCheckDto,
  type IpCheckVerdict,
  type IpGeo,
  type IpInfo,
} from "@systemboq/shared-types";
import { Network } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { ApiError } from "../lib/api";
import { getIpCheck } from "../lib/system-api";
import { Button } from "./Button";

const CARD = "bg-white border border-slate-200 rounded-lg p-4 flex flex-col gap-3";

/** ป้ายผล + คำอธิบาย + สิ่งที่ต้องทำ ของแต่ละผลตรวจ — เขียนให้คนที่ไม่ได้ตั้งเซิร์ฟเวอร์เองอ่านรู้เรื่อง */
const VERDICT: Record<IpCheckVerdict, { tone: string; label: string; explain: string; todo?: ReactNode }> = {
  ok: {
    tone: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    label: "ได้ IP จริงของผู้ใช้",
    explain: "IP ที่บันทึกในแฟ้มลูกค้าเป็นของเครื่องที่เปิดใช้งานจริง ใช้ตรวจสอบย้อนหลังได้",
  },
  local: {
    tone: "bg-slate-100 text-slate-700 ring-slate-200",
    label: "ยังตรวจไม่ได้ — เปิดจากเครื่องเซิร์ฟเวอร์เอง",
    explain:
      "ตอนนี้ระบบรันอยู่บนเครื่องเดียวกับที่คุณเปิด ทุกคำขอจึงมาจาก “เครื่องเซิร์ฟเวอร์เอง” ซึ่งเป็นเรื่องปกติระหว่างพัฒนา",
    todo: "หลังขึ้นระบบจริง ให้เปิดหน้านี้จากมือถือที่ใช้เน็ตมือถือ (ไม่ใช่ Wi-Fi ออฟฟิศ) อีกครั้ง",
  },
  "local-network": {
    tone: "bg-slate-100 text-slate-700 ring-slate-200",
    label: "ยังตรวจไม่ได้ — เปิดจากเครือข่ายภายใน",
    explain: "คำขอมาจากวงเครือข่ายเดียวกับเซิร์ฟเวอร์ (เช่น Wi-Fi ออฟฟิศ) จึงยังไม่มี IP สาธารณะให้เทียบ",
    todo: "เปิดหน้านี้จากมือถือที่ใช้เน็ตมือถือแทน แล้วกดตรวจอีกครั้ง",
  },
  "proxy-untrusted": {
    tone: "bg-amber-50 text-amber-800 ring-amber-200",
    label: "บันทึก IP ผิด — ระบบยังไม่เชื่อ proxy",
    explain:
      "มี proxy (เช่น nginx หรือ Docker) ส่ง IP จริงมาให้แล้ว แต่ระบบยังบันทึก IP ของ proxy แทน ทุกแถวในแฟ้มลูกค้าจึงเป็น IP เดียวกันหมด",
    todo: (
      <>
        ตั้ง <code className="rounded bg-slate-100 px-1">TRUST_PROXY=1</code> ในไฟล์ server/.env (1 = มี proxy หนึ่งชั้น
        ถ้ามีสองชั้น เช่น Cloudflare + nginx ใช้ 2) แล้วรีสตาร์ตเซิร์ฟเวอร์ และกดตรวจอีกครั้ง
      </>
    ),
  },
  "proxy-no-forward": {
    tone: "bg-amber-50 text-amber-800 ring-amber-200",
    label: "บันทึก IP ผิด — proxy ไม่ได้ส่ง IP จริงมา",
    explain:
      "คำขอผ่านเครือข่ายภายใน (เช่น Docker) มาถึงระบบ แต่ไม่มีใครบอกว่าต้นทางคือใคร ทุกแถวในแฟ้มลูกค้าจะเป็น IP ของเครือข่ายภายในเหมือนกันหมด",
    todo: (
      <>
        ให้ proxy ส่งหัว X-Forwarded-For มาด้วย (nginx:{" "}
        <code className="rounded bg-slate-100 px-1">proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;</code>)
        แล้วตั้ง <code className="rounded bg-slate-100 px-1">TRUST_PROXY=1</code> ใน server/.env · ถ้าเปิดจาก Wi-Fi
        ออฟฟิศที่อยู่วงเดียวกับเซิร์ฟเวอร์ ให้ลองจากเน็ตมือถือก่อน
      </>
    ),
  },
  "trust-all": {
    tone: "bg-red-50 text-red-700 ring-red-200",
    label: "ไม่ปลอดภัย — ใครก็ปลอม IP ได้",
    explain:
      "TRUST_PROXY=true แปลว่าเชื่อหัว X-Forwarded-For ทุกชั้น ผู้ใช้ส่ง IP ปลอมมาเองได้ ทั้ง IP ในบันทึกและการจำกัดจำนวนครั้งต่อ IP จึงเชื่อถือไม่ได้",
    todo: (
      <>
        เปลี่ยนเป็นจำนวนชั้นของ proxy ที่มีจริง เช่น <code className="rounded bg-slate-100 px-1">TRUST_PROXY=1</code>{" "}
        แล้วรีสตาร์ตเซิร์ฟเวอร์
      </>
    ),
  },
};

function IpText({ ip }: Readonly<{ ip: IpInfo | null }>) {
  if (!ip) return <span className="text-slate-400">—</span>;
  const label = IP_KIND_LABEL[ip.kind];
  return (
    <span>
      <span className="font-mono tabular-nums">{ip.address}</span>
      <span className="ml-2 text-xs text-slate-500">{label ?? "IP สาธารณะ"}</span>
    </span>
  );
}

/** ประเทศ · ผู้ให้บริการ + ป้ายต่างประเทศ ใต้ IP */
function GeoText({ geo }: Readonly<{ geo: IpGeo }>) {
  return (
    <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
      {[geo.country, geo.network].filter(Boolean).join(" · ")}
      {geo.foreign && (
        <span className="rounded border border-red-200 bg-red-50 px-1.5 text-[11px] font-medium text-red-700">ต่างประเทศ</span>
      )}
    </span>
  );
}

function Detail({ label, children }: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="w-44 shrink-0 text-xs text-slate-500">{label}</dt>
      <dd className="min-w-0 text-sm text-slate-800 wrap-anywhere">{children}</dd>
    </div>
  );
}

/**
 * การรับ IP — เฉพาะ OWNER (ตัวเรียกเป็นคนตัดสินว่าจะแสดง)
 *
 * IP ในแฟ้มลูกค้าจะเชื่อได้ก็ต่อเมื่อตั้งค่า proxy ถูก — ถ้าผิด ทุกแถวเป็น IP ของ Docker/nginx ตัวเดียวกัน
 * แต่ดูจากตารางไม่ออก หน้านี้ตอบตรง ๆ ว่า "IP ที่ระบบเห็นของคุณตอนนี้คืออะไร และใช้ได้ไหม"
 */
export function IpCheckSettings() {
  const [result, setResult] = useState<IpCheckDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      setResult(await getIpCheck());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ตรวจการรับ IP ไม่สำเร็จ");
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const verdict = result ? VERDICT[result.verdict] : null;

  return (
    <div className={CARD}>
      <div className="flex items-center gap-2">
        <Network size={18} className="text-[#000099]" />
        <h2 className="text-sm font-semibold text-slate-800">การรับ IP</h2>
      </div>
      <p className="text-xs text-slate-500">
        ตรวจว่า IP ที่บันทึกในแฟ้มลูกค้าเป็นของคนใช้งานจริงหรือไม่ — ผลขึ้นกับการตั้งค่าเซิร์ฟเวอร์
        จึงควรตรวจอีกครั้งทุกครั้งที่ย้ายเครื่องหรือเปลี่ยนวิธีขึ้นระบบ
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {result && verdict && (
        <>
          <div>
            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${verdict.tone}`}>
              {verdict.label}
            </span>
          </div>
          <p className="text-sm text-slate-700">{verdict.explain}</p>
          {verdict.todo && (
            <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <span className="font-medium text-slate-800">ต้องทำ: </span>
              {verdict.todo}
            </div>
          )}

          <dl className="flex flex-col gap-2 border-t border-slate-100 pt-3">
            <Detail label="IP ที่ระบบบันทึกของคุณ">
              <IpText ip={result.seen} />
              {result.seenGeo && <GeoText geo={result.seenGeo} />}
            </Detail>
            <Detail label="เครื่องที่ต่อเข้ามาตรง ๆ">
              <IpText ip={result.socket} />
            </Detail>
            <Detail label="IP ที่ proxy ส่งต่อมา">
              {result.forwardedFor.length === 0 ? (
                <span className="text-slate-400">ไม่มี</span>
              ) : (
                <span className="flex flex-col gap-0.5">
                  {result.forwardedFor.map((ip, i) => (
                    <IpText key={`${ip.address}-${i}`} ip={ip} />
                  ))}
                </span>
              )}
            </Detail>
            <Detail label="TRUST_PROXY">
              {result.trustProxy ? (
                <code className="rounded bg-slate-100 px-1">{result.trustProxy}</code>
              ) : (
                <span className="text-slate-500">ไม่ได้ตั้ง (ไม่เชื่อ proxy)</span>
              )}
            </Detail>
            {result.forwardHeaders.length > 0 && (
              <Detail label="หัวข้อมูลจาก proxy">{result.forwardHeaders.join(" · ")}</Detail>
            )}
            <Detail label="ฐานข้อมูลประเทศ/ผู้ให้บริการ">
              {result.geoip.available ? (
                <span>
                  ข้อมูลเดือน {result.geoip.month ?? "ไม่ทราบ"}
                  <span className="ml-2 text-xs text-slate-500">
                    {result.geoip.autoUpdate ? "อัปเดตเองทุกเดือน" : "ไม่อัปเดตเอง — รัน npm run geoip:update -w server"}
                  </span>
                </span>
              ) : (
                <span className="text-amber-700">
                  ยังไม่มีไฟล์ — รัน <code className="rounded bg-slate-100 px-1">npm run geoip:update -w server</code>{" "}
                  {result.geoip.autoUpdate && "หรือรอเซิร์ฟเวอร์ดาวน์โหลดเอง (หลังเปิดเครื่องประมาณ 30 วินาที)"}
                </span>
              )}
            </Detail>
          </dl>

          <p className="text-xs text-slate-500">
            เทียบกับ IP ที่โลกภายนอกเห็นได้จากมือถือเครื่องเดียวกัน (เช่น ค้นใน Google ว่า “what is my ip”) ถ้าตรงกัน
            แปลว่าระบบบันทึกถูกต้อง · ประเทศ/ผู้ให้บริการค้นจากฐานข้อมูลในเซิร์ฟเวอร์เอง ไม่ส่ง IP ออกไปข้างนอก (<a
              href={GEOIP_ATTRIBUTION.url}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              {GEOIP_ATTRIBUTION.text}
            </a>)
          </p>
        </>
      )}

      <div>
        <Button variant="neutral" onClick={() => void check()} disabled={checking}>
          {checking ? "กำลังตรวจ..." : "ตรวจอีกครั้ง"}
        </Button>
      </div>
    </div>
  );
}
