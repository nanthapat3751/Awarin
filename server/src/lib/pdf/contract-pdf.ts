import {
  type ContractStructure,
  INSTALLMENT_TABLE_TOKEN,
  thaiLongDate,
} from "../contract-template";
import { renderHtmlToPdf } from "./browser";
import { sarabunFontFaceCss } from "./fonts";
import { splitWithholding, type Withholding } from "../billing-party";
import { renderCustomerParty, type CustomerPartyPdfData } from "./billing-block";
import { type CompanyDocFields, renderCompanySigner } from "./company-blocks";
import { companyLogoDataUri, documentChrome, LETTERHEAD_CSS, renderLetterhead } from "./letterhead";

/**
 * `signatory` ของสัญญามาจากค่าที่ตรึงไว้กับฉบับนั้นตอนออก (Contract.signatoryName/Title)
 * ไม่ใช่ค่าปัจจุบันในหน้าตั้งค่า — ดู generateContractPdf
 */
export interface ContractPdfData extends CustomerPartyPdfData, CompanyDocFields {
  contractNo: string;
  projectNo: string;
  projectName: string;
  siteAddress: string | null;
  startDate: Date | null;
  targetEndDate: Date | null;
  date: Date;
  contractAmount: number;
  signedAt: Date | null;
  /** ชื่อเอกสารบนหน้าปก เช่น "สัญญาเหมาทำการก่อสร้าง" */
  docTitle: string;
  /**
   * เนื้อสัญญาที่แช่แข็งไว้กับฉบับนี้ (แทนค่าตัวแปรแล้ว)
   * null = สัญญาเก่าที่ออกก่อนมีระบบแม่แบบ → พิมพ์แบบย่อเหมือนเดิม ไม่ใช่พิมพ์หน้าเปล่า
   */
  body: ContractStructure | null;
  /** งวดการชำระเงินของฉบับนี้ — ไปแทนที่โทเคน {{ตารางงวดงาน}} ในข้อ 7 ตอนพิมพ์ */
  installments: { seq: number; milestone: string; amount: number }[];
  /**
   * ภาษีหัก ณ ที่จ่ายของสัญญาทั้งฉบับ — null = ไม่ต้องหัก หรือคำนวณไม่ได้
   *
   * "คำนวณไม่ได้" คือสัญญาที่ออกก่อนระบบตรึงยอด VAT ไว้กับสัญญา จึงแยกฐานภาษีออกจากยอดรวม
   * ไม่ได้ — กรณีนั้นพิมพ์แค่คำอธิบายว่าผู้ว่าจ้างมีหน้าที่หัก แต่ไม่พิมพ์ตัวเลขที่เดาเอา
   */
  withholding?: Withholding | null;
}

function money(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** สัญญาไทยใช้ พ.ศ. ทั้งฉบับ — หัวเอกสารเป็น ค.ศ. แต่เนื้อในเป็น พ.ศ. คืออ่านแล้วสับสนว่าคนละวัน */
function formatDate(d: Date): string {
  return thaiLongDate(d);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * ข้อความหลายย่อหน้าที่พนักงานพิมพ์ในแม่แบบ → HTML
 *
 * ต้อง escape ก่อนแล้วค่อยแปลงขึ้นบรรทัดใหม่ ไม่ใช่ทางกลับกัน — ถ้ามีใครพิมพ์ <b> ลงในแม่แบบ
 * มันต้องโผล่เป็นตัวอักษรบนสัญญา ไม่ใช่กลายเป็นตัวหนา (และไม่ใช่ช่องทางแทรก HTML ลงเอกสาร)
 */
function paragraphs(text: string): string {
  return escapeHtml(text)
    .split(/\n{2,}/)
    .map((block) => `<p class="para">${block.replaceAll("\n", "<br />")}</p>`)
    .join("");
}

/** บรรทัดเลขผู้เสียภาษีบนปก — เฉพาะผู้ว่าจ้างนิติบุคคลที่มีเลข */
function coverTaxIdLine(data: ContractPdfData): string {
  if (!data.customerIsCompany || !data.customerTaxId) return "";
  const branch = data.customerBranch ? ` · ${escapeHtml(data.customerBranch)}` : "";
  return `<div><span class="cover-label">เลขประจำตัวผู้เสียภาษี</span>${escapeHtml(data.customerTaxId)}${branch}</div>`;
}

/** บรรทัดระยะเวลาก่อสร้าง — ไม่มีทั้งวันเริ่มและวันเสร็จ = ไม่พิมพ์ */
function constructionPeriodLine(data: ContractPdfData): string {
  if (!data.startDate && !data.targetEndDate) return "";
  const start = data.startDate ? formatDate(data.startDate) : "-";
  const end = data.targetEndDate ? formatDate(data.targetEndDate) : "-";
  return `<div>ระยะเวลาก่อสร้าง: ${start} ถึง ${end}</div>`;
}

function renderCover(data: ContractPdfData): string {
  const logo = data.logo !== undefined ? data.logo : companyLogoDataUri();
  return `
    <section class="cover">
      <h1 class="cover-title">${escapeHtml(data.docTitle)}</h1>
      ${
        data.body?.coverSubtitle
          ? `<p class="cover-subtitle">${escapeHtml(data.body.coverSubtitle)}</p>`
          : ""
      }
      <div class="cover-fields">
        <div><span class="cover-label">เจ้าของ</span>${escapeHtml(data.customerName ?? "-")}</div>
        ${coverTaxIdLine(data)}
        ${
          data.siteAddress
            ? `<div><span class="cover-label">สถานที่ก่อสร้าง</span>${escapeHtml(data.siteAddress)}</div>`
            : ""
        }
        <div><span class="cover-label">เลขที่สัญญา</span>${escapeHtml(data.contractNo)} · ${escapeHtml(
          data.projectNo,
        )}</div>
      </div>
      <div class="cover-company">
        ${logo ? `<img class="cover-logo" src="${logo}" alt="" />` : ""}
        <div class="cover-company-text">
          <div class="cover-company-name">${escapeHtml(data.companyName)}</div>
          <div>${escapeHtml(data.companyAddress)}</div>
          <div>โทร. ${escapeHtml(data.companyPhone)}${
            data.companyEmail ? ` · อีเมล ${escapeHtml(data.companyEmail)}` : ""
          }</div>
          ${data.companyTaxId ? `<div>เลขประจำตัวผู้เสียภาษี ${escapeHtml(data.companyTaxId)}</div>` : ""}
        </div>
      </div>
    </section>`;
}

/** สัญญาเก่าที่ออกก่อนมีระบบแม่แบบ — พิมพ์รูปแบบย่อเดิมไว้ ไม่ให้เอกสารเดิมกลายเป็นหน้าว่าง */
function renderLegacyBody(data: ContractPdfData): string {
  return `
    <div class="info">
      <div>โครงการ: ${escapeHtml(data.projectName)} (${escapeHtml(data.projectNo)})</div>
      ${renderCustomerParty(data, "ผู้ว่าจ้าง")}
      ${data.siteAddress ? `<div>สถานที่ก่อสร้าง: ${escapeHtml(data.siteAddress)}</div>` : ""}
      <div>ผู้รับจ้าง: ${escapeHtml(data.companyName)}</div>
      <div>ที่อยู่ผู้รับจ้าง: ${escapeHtml(data.companyAddress)}</div>
      <div>โทรศัพท์: ${escapeHtml(data.companyPhone)}</div>
      ${data.companyTaxId ? `<div>เลขประจำตัวผู้เสียภาษีผู้รับจ้าง: ${escapeHtml(data.companyTaxId)}</div>` : ""}
      ${constructionPeriodLine(data)}
    </div>
    <p class="para">
      สัญญาฉบับนี้ทำขึ้นระหว่างผู้ว่าจ้างและผู้รับจ้างตามรายละเอียดโครงการและใบเสนอราคาที่ทั้งสองฝ่ายตกลงกัน
    </p>
    <div class="amount-box">
      <div class="label">มูลค่าสัญญา (ตามใบเสนอราคาที่ตกลง)</div>
      <div class="value">${money(data.contractAmount)} บาท</div>
    </div>`;
}

/**
 * ตารางงวดเงิน — แต่ละงวดมีช่องลงชื่อ + วันที่กำกับ เพราะผู้ว่าจ้างเซ็นรับมอบงานทีละงวด
 * บนกระดาษแผ่นเดียวกัน (แบบเดียวกับสัญญาฉบับจริงของบริษัท)
 */
function renderInstallments(
  items: ContractPdfData["installments"],
  withholding: Withholding | null,
  contractAmount: number,
): string {
  if (items.length === 0) return "";

  // ของจริงหัก 3% "ทุกงวดที่จ่าย" ไม่ใช่ก้อนเดียวตอนเซ็นสัญญา — ฝ่ายบัญชีของผู้ว่าจ้างต้องรู้ว่า
  // แต่ละงวดโอนจริงเท่าไร ไม่งั้นต้องนั่งคำนวณเองทุกงวดและมีโอกาสได้ตัวเลขไม่ตรงกับของเรา
  const perInstallment = withholding
    ? splitWithholding(withholding, contractAmount, items)
    : [];

  const rows = items
    .map((i, index) => {
      const wh = perInstallment[index];
      return `
        <div class="inst">
          <div class="inst-line">
            <span>งวดที่ ${i.seq} — ชำระเมื่อ ${escapeHtml(i.milestone)}</span>
            <span class="inst-amount">${money(i.amount)} บาท</span>
          </div>
          ${
            wh
              ? `<div class="inst-wh">หักภาษี ณ ที่จ่าย ${withholding!.pct}% ${money(
                  wh.tax,
                )} บาท · โอนสุทธิ ${money(wh.netTransfer)} บาท</div>`
              : ""
          }
          <div class="inst-sign">ลงชื่อ ....................................................... วันที่ ........./........./.........</div>
        </div>`;
    })
    .join("");

  const total = items.reduce((sum, i) => sum + i.amount, 0);
  return `<div class="inst-table">${rows}
      <div class="inst-total"><span>รวมทั้งสิ้น</span><span class="inst-amount">${money(total)} บาท</span></div>
      ${
        withholding
          ? `<div class="inst-wh-note">ผู้ว่าจ้างเป็นนิติบุคคล จึงหักภาษี ณ ที่จ่าย ${
              withholding.pct
            }% ของมูลค่างานก่อนภาษีมูลค่าเพิ่ม รวมทั้งสิ้น ${money(
              withholding.tax,
            )} บาท นำส่งกรมสรรพากร และออกหนังสือรับรองการหักภาษี ณ ที่จ่ายให้ผู้รับจ้างทุกงวด — ยอดที่หักไม่ใช่ส่วนลด มูลค่าสัญญายังคงเดิม</div>`
          : ""
      }
    </div>`;
}

function renderClauses(
  body: ContractStructure,
  installments: ContractPdfData["installments"],
  withholding: Withholding | null,
  contractAmount: number,
): string {
  const clauses = body.clauses
    .map((c) => {
      // โทเคนบล็อกถูกแทนที่ตอนพิมพ์ ไม่ใช่ตอนแช่แข็ง — งวดเงินเป็นข้อมูลของสัญญาฉบับนี้
      // ที่แก้ได้จนกว่าจะลงนาม จึงต้องอ่านค่าล่าสุดเสมอ
      const parts = c.body.split(INSTALLMENT_TABLE_TOKEN);
      const rendered =
        parts.length === 1
          ? paragraphs(c.body)
          : parts
              .map((t) => (t.trim() ? paragraphs(t) : ""))
              .join(renderInstallments(installments, withholding, contractAmount));
      return `
        <div class="clause">
          <div class="clause-heading">${escapeHtml(c.heading)}</div>
          ${rendered}
        </div>`;
    })
    .join("");

  return `
    ${paragraphs(body.preamble)}
    ${clauses}
    ${body.closing ? paragraphs(body.closing) : ""}`;
}

export function buildContractPdfHtml(data: ContractPdfData): string {
  return `
    <!doctype html>
    <html lang="th">
      <head>
        <meta charset="utf-8" />
        <style>
          ${sarabunFontFaceCss()}
          ${LETTERHEAD_CSS}
          * { font-family: "Sarabun", sans-serif; box-sizing: border-box; }
          body { margin: 0; font-size: 12px; color: #1a1a1a; }
          /* ระยะขอบกำหนดที่ page.pdf() แทน เพราะต้องเผื่อที่ให้แถบหัว/ท้ายทุกหน้า */
          @page { size: A4; }

          /* ---------- หน้าปก ---------- */
          .cover { text-align: center; padding-top: 80px; page-break-after: always; }
          .cover-title { font-size: 30px; font-weight: 700; margin: 0; letter-spacing: 1px; }
          .cover-subtitle { font-size: 18px; margin: 12px 0 0; }
          .cover-fields { margin-top: 60px; font-size: 14px; line-height: 2.2; }
          /* ป้ายกำกับกว้างคงที่ ค่าจึงเรียงตรงแนวกันทุกบรรทัดแม้ป้ายยาวไม่เท่ากัน */
          .cover-label { display: inline-block; width: 120px; text-align: right; margin-right: 14px; color: #555; }
          .cover-company { margin-top: 90px; display: flex; align-items: center; justify-content: center; gap: 14px; }
          /* กรอบแทนความสูงตายตัว — โลโก้ที่บริษัทอัปโหลดเองอาจยาวมาก ๆ (4:1) แล้วกินครึ่งหน้าปก */
          .cover-logo { width: auto; height: auto; max-height: 54px; max-width: 180px; }
          .cover-company-text { text-align: left; font-size: 11px; line-height: 1.7; }
          .cover-company-name { font-weight: 700; font-size: 13px; }

          /* ---------- เนื้อสัญญา ---------- */
          .info { margin-top: 16px; line-height: 1.9; }
          .amount-box { margin-top: 30px; }
          .amount-box .label { font-size: 12px; font-weight: 700; }
          .amount-box .value { font-size: 18px; font-weight: 700; margin-top: 6px; }
          .para { margin: 10px 0 0; line-height: 1.8; text-indent: 0; text-align: justify; }
          .clause { margin-top: 18px; }
          .inst-table { margin-top: 10px; }
          /* หนึ่งงวด = บรรทัดเงื่อนไข + ช่องเซ็น ห้ามให้สองส่วนนี้แยกคนละหน้ากัน */
          .inst { margin-bottom: 10px; page-break-inside: avoid; }
          .inst-line { display: flex; justify-content: space-between; gap: 12px; line-height: 1.7; }
          .inst-amount { white-space: nowrap; font-variant-numeric: tabular-nums; }
          .inst-sign { margin-top: 2px; color: #444; }
          /* บรรทัดหัก ณ ที่จ่ายเป็นข้อมูลประกอบของงวด ต้องเล็กกว่ายอดงวดชัดเจน ไม่งั้นจะอ่าน
             ว่ามีสองยอดให้เลือกจ่าย */
          .inst-wh { margin-top: 2px; font-size: 11px; color: #555; }
          .inst-wh-note { margin-top: 8px; font-size: 11px; color: #444; line-height: 1.6; }
          .inst-total {
            display: flex; justify-content: space-between; gap: 12px;
            margin-top: 6px; padding-top: 6px; border-top: 1px solid #888; font-weight: 700;
          }
          /* ห้ามหัวข้อค้างท้ายหน้าโดยเนื้อความไปขึ้นหน้าใหม่ — ห้ามใช้ page-break-inside: avoid
             กับทั้งข้อ เพราะข้อ 9 ยาวเกินหนึ่งหน้า จะถูกดันไปขึ้นหน้าใหม่แล้วเหลือหน้าว่างครึ่งหน้า */
          .clause-heading { font-weight: 700; page-break-after: avoid; break-after: avoid; }
          .signatures { display: flex; justify-content: space-between; margin-top: 60px; }
          /* ต้องเป็นลูกโดยตรง — เดิมเป็น ".signatures div" ซึ่งไปโดน div ข้างในด้วย
             ทำให้บรรทัด "ลงชื่อ ... ผู้ว่าจ้าง" ถูกบีบเหลือ 45% ของคอลัมน์ (~130px) แล้วตัดคำมั่ว */
          .signatures > div { width: 45%; }
          .witnesses { display: flex; justify-content: space-between; margin-top: 46px; }
          .witnesses > div { width: 45%; }
          .sign-block { page-break-inside: avoid; }
        </style>
      </head>
      <body>
        ${data.body ? renderCover(data) : ""}

        ${renderLetterhead(data, {
          titleTh: data.docTitle,
          titleEn: "CONSTRUCTION CONTRACT",
          meta: [`เลขที่สัญญา ${data.contractNo}`, `วันที่ ${formatDate(data.date)}`],
        })}

        ${
          data.body
            ? renderClauses(
                data.body,
                data.installments,
                data.withholding ?? null,
                data.contractAmount,
              )
            : renderLegacyBody(data)
        }

        <div class="sign-block">
          <div class="signatures">
            <div>
              <div>ลงชื่อ ....................................... ผู้ว่าจ้าง</div>
              <div style="margin-top:16px">( ${escapeHtml(data.customerName ?? "...........................")} )</div>
            </div>
            <div>
              <div>ลงชื่อ ....................................... ผู้รับจ้าง</div>
              ${renderCompanySigner(data.companyName, data.signatory)}
            </div>
          </div>
          ${
            data.body
              ? `<div class="witnesses">
                   <div>
                     <div>ลงชื่อ ....................................... พยาน</div>
                     <div style="margin-top:16px">(...........................)</div>
                   </div>
                   <div>
                     <div>ลงชื่อ ....................................... พยาน</div>
                     <div style="margin-top:16px">(...........................)</div>
                   </div>
                 </div>`
              : ""
          }
        </div>

        ${data.signedAt ? `<p style="margin-top:24px;font-size:10px">ลงนามเมื่อ: ${formatDate(data.signedAt)}</p>` : ""}
      </body>
    </html>`;
}

export async function renderContractPdf(data: ContractPdfData): Promise<Uint8Array> {
  return renderHtmlToPdf(
    buildContractPdfHtml(data),
    documentChrome(
      {
        companyName: data.companyName,
        docLabel: `สัญญาเลขที่ ${data.contractNo}`,
        logoSmall: data.logoSmall,
      },
      "20mm",
      // สัญญาที่มีเนื้อหาเต็มเท่านั้นที่ต้องเซ็นกำกับรายหน้า (ฉบับเก่าแบบย่อมีหน้าเดียว)
      data.body
        ? {
            // เส้นประยาวเท่ากันทั้งสองข้าง และไม่มีช่องว่างคั่นในเครื่องหมายคำพูด
            left: "…………………………………… “ผู้ว่าจ้าง”",
            right: "…………………………………… “ผู้รับจ้าง”",
          }
        : undefined,
    ),
    {
      title: `สัญญา ${data.contractNo} · ${data.projectName}`,
      author: data.companyName,
      subject: `โครงการ ${data.projectNo} ${data.projectName}`,
    },
  );
}
