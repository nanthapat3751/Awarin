# MASTER PROMPT — ระบบประเมินราคาต้นทุนงานก่อสร้างและเว็บแอปพลิเคชันสำหรับลูกค้า

> เอกสารนี้กรอกจาก `PROMPT_System_Skeleton_TEMPLATE.md` โดยอ้างอิงเนื้อหาจาก `Proposal.pdf` (โครงร่างปัญหาพิเศษ 02739498)
> และการตัดสินใจทางเทคนิคที่ตกลงกับผู้ใช้เพิ่มเติมในส่วนที่ proposal ไม่ได้ระบุ

---

## 0. ข้อกำหนดเบื้องต้น

1. สร้างโปรเจกต์ใหม่ทั้งหมดในโฟลเดอร์นี้ (`systemboq/`) แบบ **monorepo 3 ส่วน**: `server/`, `staff-app/`, `client-app/`
2. ห้ามเข้าถึง repo อื่น / ห้าม commit `.env`
3. ภาษา UI: ไทย (ทุกหน้าจอทั้ง staff-app และ client-app) · ภาษาโค้ด/คอมเมนต์: อังกฤษ
4. ไม่มี git remote ตอนเริ่ม — จะ `git init` ในโฟลเดอร์นี้

---

## 1. บริบทโปรเจกต์

**ระบบ:** ระบบประเมินราคาต้นทุนงานก่อสร้างและจัดทำ BOQ (Bill of Quantities) สำหรับบริษัทรับออกแบบและรับสร้างบ้าน
พร้อมเว็บแอปพลิเคชันฝั่งลูกค้าสำหรับดูแบบบ้าน/ผลงาน และส่งคำขอติดต่อ

**เป้าหมาย:** ทดแทนการจัดทำ BOQ และประเมินราคาด้วยสเปรดชีต/คำนวณมือ (ซึ่งเสี่ยง Human Error สูง) ด้วยระบบที่คำนวณ
ต้นทุนวัสดุ+ค่าแรง บวกค่าดำเนินการกำไร 10% และ VAT 7% โดยอัตโนมัติ พร้อมเปิดช่องทางออนไลน์ให้ลูกค้าเข้าถึงข้อมูล
บริษัทและส่งคำขอได้โดยตรง

### ผู้ใช้ & บทบาท (Roles)

| Role | คำอธิบาย | การเข้าถึง |
|---|---|---|
| `OWNER` | เจ้าของธุรกิจ/ผู้ใช้งานหลักฝั่งบริษัท | เต็มสิทธิ์: ตั้งค่าระบบ, จัดการฐานข้อมูลวัสดุ/ค่าแรง/หมวดงาน, สร้าง-แก้ไข BOQ, อนุมัติราคา, ออกใบเสนอราคา/สัญญา, เผยแพร่ผลงาน, ดู lead ลูกค้า |
| `CUSTOMER` | ลูกค้า สมัครสมาชิก/ล็อกอินผ่าน client-app | ดูแบบบ้าน/ผลงาน/บริการ (public ไม่ต้องล็อกอินก็ดูได้), ต้องล็อกอินเพื่อ: ส่งคำขอ, ดูใบเสนอราคาของตนเอง, แจ้งขอปรับแก้รายละเอียดงาน |
| `ADMIN` | ผู้ดูแลระบบ (superuser) | สิทธิ์สูงสุดเทียบเท่า OWNER + จัดการบัญชีผู้ใช้/บทบาททั้งหมด |

> ขอบเขตนี้เป็นระบบ SME ขนาดเล็ก จึงไม่มีหลายบทบาทฝั่งพนักงาน (1 user = 1 role) แต่ออกแบบ RBAC ให้ขยายเพิ่ม role
> เช่น `STAFF` (พนักงานประเมินราคา) ได้ในอนาคตโดยไม่ต้องแก้โครงสร้างหลัก

---

## 2. Technology Stack

| ชั้น | เทคโนโลยีที่เลือก |
|---|---|
| Framework / Frontend | React 19 (Vite) — แยกเป็น 2 แอป: `staff-app` (ฝั่งบริษัท), `client-app` (ฝั่งลูกค้า) |
| ภาษา | TypeScript (strict) ทั้ง server และ frontend |
| Backend / API | Express.js บน Node.js 22, REST API |
| ORM | Prisma |
| Database | PostgreSQL 17 |
| Cache / Queue | ไม่ใช้ (นอกขอบเขต proposal) |
| Auth | Session-based custom auth (cookie httpOnly + Secure + SameSite=Lax), เก็บ session ใน DB table `Session` เพื่อ revoke ได้ทันทีผ่าน `sessionVersion` |
| Password hashing | Argon2id |
| Validation | Zod (ทุก input ฝั่ง server) |
| Realtime | ไม่ใช้ WebSocket — ใช้ polling เบา ๆ สำหรับแจ้งเตือน lead ใหม่ฝั่ง OWNER (nice-to-have, ไม่ blocking) |
| ไฟล์ / Export | `pdf-lib` สำหรับสร้าง PDF รายงาน BOQ / ใบเสนอราคา / สัญญา ฝั่ง server |
| การชำระเงิน | ไม่มี (นอกขอบเขต proposal) |
| งานตามเวลา (cron) | ไม่มี (นอกขอบเขต proposal) |
| Styling / UI | Tailwind CSS + shadcn/ui |
| Test | Jest (unit) + Supertest (API integration) + Playwright (e2e เสริมถ้าเวลาเพียงพอ) |
| Mobile | ไม่มี |
| Deploy | Docker Compose (Postgres, dev local) + Railway.app (server+db) / Vercel (static frontends) |

---

## 3. โครงสร้างโปรเจกต์

```
systemboq/
├── docker-compose.yml            # postgres (+ server สำหรับ dev แบบเต็ม)
├── .env.example
├── README.md
├── server/                       # Express REST API
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts               # ข้อมูลตั้งต้น + บัญชี admin
│   ├── src/
│   │   ├── modules/
│   │   │   ├── auth/              # login/register/session ทั้ง staff+customer
│   │   │   ├── users/
│   │   │   ├── categories/        # หมวดงานลำดับชั้น 3 ระดับ
│   │   │   ├── materials/         # วัสดุ + ค่าแรง + หน่วยนับ
│   │   │   ├── projects/          # โครงการ + version
│   │   │   ├── boq/                # รายการ BOQ + คำนวณ
│   │   │   ├── templates/         # แม่แบบโครงการ
│   │   │   ├── quotes/            # ใบเสนอราคา + PDF
│   │   │   ├── contracts/         # สัญญาก่อสร้าง + PDF
│   │   │   ├── houseDesigns/      # แบบบ้าน (public)
│   │   │   ├── portfolio/         # ผลงาน
│   │   │   ├── leads/             # คำขอติดต่อจากลูกค้า
│   │   │   ├── settings/
│   │   │   └── dashboard/
│   │   ├── lib/                   # pure core logic (pricing.ts, state-machine.ts) — ไม่แตะ DB, มี unit test ครบ
│   │   ├── middleware/            # auth guard, rbac guard, error handler, audit log
│   │   ├── app.ts
│   │   └── server.ts
│   └── tests/
│       ├── lib/                   # unit test core logic
│       └── integration/           # supertest ต่อ API
├── staff-app/                     # React SPA ฝั่งบริษัท (OWNER/ADMIN)
│   └── src/{pages,components,api,lib}
├── client-app/                    # React SPA ฝั่งลูกค้า (public + CUSTOMER)
│   └── src/{pages,components,api,lib}
└── packages/
    └── shared-types/              # TS types/DTO ที่ใช้ร่วมกันทั้ง 3 ส่วน
```

---

## 4. Database Schema

### Enums
```
enum Role            { OWNER, ADMIN, CUSTOMER }
enum WorkCategoryLevel { CATEGORY, SUBGROUP, ITEM }   // หมวดงาน / กลุ่มงานย่อย / รายการ
enum ProjectStatus    { DRAFT, QUOTED, APPROVED, COMPLETED, CANCELLED }
enum QuoteStatus      { DRAFT, SENT, ACCEPTED, REJECTED, REVISED }
enum LeadStatus       { NEW, CONTACTED, QUOTED, CLOSED, REJECTED }
enum PortfolioType    { DESIGN, CONSTRUCTION }        // งานออกแบบ / งานก่อสร้าง
```

### ตารางหลัก
| ตาราง | รายละเอียด |
|---|---|
| `User` | id, email(uniq), passwordHash, fullName, role, active, sessionVersion, failedAttempts, lockedUntil, createdAt |
| `CustomerProfile` | userId(uniq, FK→User), phone, address |
| `Session` | id, userId, sessionVersion, expiresAt, userAgent, ip, createdAt |
| `WorkCategory` | id, parentId(self-FK, nullable), level, code, name, sortOrder |
| `Material` | id, categoryId?(FK), name, unit, **materialUnitPrice, laborUnitPrice** (ราคาต่อหน่วยของวัสดุและค่าแรงเก็บคู่กันในแถวเดียว ตาม Unit Cost Method — ไม่แยกเป็นสองแถว), active, updatedAt |
| `Customer` (= User role CUSTOMER + CustomerProfile) | ดูด้านบน |
| `HouseDesign` | id, name, description, area, images(Json), plans(Json), published, createdById |
| `Project` | id, projectNo(uniq, auto), name, customerId?(FK→User), houseDesignId?(FK), status, createdById, createdAt |
| `ProjectVersion` | id, projectId(FK), versionNo, directCost, overheadProfitPct, overheadProfitAmt, vatPct, vatAmt, netPrice, pricePerSqm, createdById, createdAt — **immutable หลังสร้าง** |
| `BoqItem` | id, projectVersionId(FK), categoryId(FK), materialId?(FK, nullable สำหรับรายการ ad-hoc), name(snapshot), quantity, unit, materialUnitPrice, materialTotal, laborUnitPrice, laborTotal, lineTotal, sortOrder, note? |
| `Template` | id, name, houseDesignId?(FK), structure(Json — snapshot ของ BoqItem ตั้งต้น) |
| `Quote` | id, projectId(FK), projectVersionId(FK), quoteNo(uniq, auto), pdfUrl, status, sentAt, respondedAt |
| `Contract` | id, projectId(FK), contractNo(uniq, auto), pdfUrl, signedAt |
| `Portfolio` | id, title, type(DESIGN/CONSTRUCTION), images(Json), description, published, publishedAt, createdById |
| `Lead` | id, customerId?(FK→User, nullable ถ้าไม่ล็อกอิน), name, phone, email, serviceType, houseDesignId?(FK), message, attachments(Json), status |
| `AuditLog` | id, userId?, action, entityType, entityId, details(Json), ip, userAgent, createdAt — **append-only** |
| `Setting` | key(uniq), value, updatedById(FK), updatedAt |

### ข้อตกลง Schema
- Index ที่จำเป็น: `WorkCategory(parentId)`, `Material(categoryId)`, `Project(status)`, `Project(customerId)`, `Lead(status)`, `BoqItem(projectVersionId)`, `Quote(projectId)`
- Unique: `User.email`, `Project.projectNo`, `Quote.quoteNo`, `Contract.contractNo`, `Setting.key`, `CustomerProfile.userId`
- `AuditLog` append-only — REVOKE UPDATE/DELETE จาก DB user ของ app
- `ProjectVersion` และ `BoqItem` ที่ผูกกับ version ที่ถูกใช้ออกใบเสนอราคาแล้ว **ห้ามแก้ไข** (immutable) — แก้ต้องสร้าง version ใหม่
- เวลาเก็บ `TIMESTAMPTZ` · timezone `Asia/Bangkok`
- **ราคา/เปอร์เซ็นต์/ยอดรวมทั้งหมดคำนวณที่ server เท่านั้น** ห้ามเชื่อค่าที่ client ส่งมา

### Seed
- บัญชี OWNER/ADMIN เริ่มต้น (รหัสผ่านสุ่ม พิมพ์ log ตอน seed, บังคับเปลี่ยนรหัสผ่านตอนล็อกอินครั้งแรก)
- `WorkCategory` ระดับ 1 (CATEGORY) ครบ 6 หมวดตามเอกสาร BOQ จริงที่ได้รับ: A หมวดงานเตรียมการ, B หมวดงานโครงสร้าง, C หมวดงานสถาปัตยกรรม, D หมวดงานโครงสร้างอื่นๆ, E หมวดงานระบบสุขาภิบาลและป้องกันอัคคีภัย, F หมวดงานระบบไฟฟ้าและสื่อสาร + ตัวอย่าง SUBGROUP/ITEM ใต้หมวด B
- `Material` ตัวอย่าง (ราคาต่อหน่วยวัสดุ+ค่าแรงในแถวเดียวกัน อ้างอิงจากเอกสาร BOQ จริง)
- `Setting` เริ่มต้น: `overheadProfitPercent=10`, `vatPercent=7`, `companyName`, `companyAddress`, `companyPhone`

---

## 5. Business Rules / Core Logic

> ตรรกะคำนวณราคาและ state machine อยู่ใน `server/src/lib/` เป็น pure function (ไม่แตะ DB) และมี unit test ครบ

### ค่าตั้งต้น (แก้ได้เฉพาะหน้า Settings โดย OWNER/ADMIN)
```
overheadProfitPercent = 10   // ค่าดำเนินการและกำไร
vatPercent = 7                // ภาษีมูลค่าเพิ่ม
```

### กฎธุรกิจ
| # | กฎ |
|---|---|
| **BR-01** | แต่ละรายการ BOQ (`BoqItem`) มีทั้งราคาวัสดุและค่าแรงต่อหน่วยในบรรทัดเดียวกัน (Unit Cost Method): materialTotal = quantity × materialUnitPrice, laborTotal = quantity × laborUnitPrice, lineTotal = materialTotal + laborTotal. ต้นทุนตรง (Direct Cost) ของ version = Σ lineTotal ของทุกรายการ |
| **BR-02** | ค่าดำเนินการและกำไร = directCost × overheadProfitPercent (ค่าเริ่มต้น 10%) |
| **BR-03** | ราคาก่อน VAT = directCost + overheadProfit |
| **BR-04** | VAT = (directCost + overheadProfit) × vatPercent (ค่าเริ่มต้น 7%) |
| **BR-05** | ราคาสุทธิ (netPrice) = directCost + overheadProfit + VAT |
| **BR-06** | ราคาต่อตารางเมตร = netPrice / houseArea (ถ้าไม่มีพื้นที่ = null, ไม่คำนวณ) |
| **BR-07** | แก้ไข BOQ ของโครงการที่เคยออกใบเสนอราคาแล้ว (มี `Quote` สถานะ SENT ขึ้นไป) → ต้องสร้าง `ProjectVersion` ใหม่เสมอ ห้ามแก้ version เดิม |
| **BR-08** | เลขที่โครงการ (`projectNo`) ออกอัตโนมัติรูปแบบ `PRJ-YYYY-NNNN` (เรียงตามปีปฏิทินไทย/สากลตามที่ตกลง) |
| **BR-09** | ข้อมูลต้นทุน/อัตรากำไร/ราคาต่อหน่วยวัสดุ เข้าถึงได้เฉพาะ role `OWNER`/`ADMIN` เท่านั้น — `CUSTOMER` เห็นเฉพาะ `netPrice` และรายละเอียดงานในใบเสนอราคาของตน |
| **BR-10** | Portfolio ที่ `published=true` แสดงบน client-app ทันที (ไม่ต้อง cache invalidation manual) |
| **BR-11** | Lead ใหม่จาก client-app ต้องบันทึกและแจ้งเตือน OWNER (badge/list ใน dashboard) ภายในคำขอถัดไป (polling) |

### Test cases ตัวอย่าง
| อินพุต | ผลลัพธ์ที่ถูกต้อง |
|---|---|
| BOQ หลายรายการ (บางรายการมีทั้งวัสดุ+แรง, บางรายการมีแรงอย่างเดียวหรือวัสดุอย่างเดียว) | directCost, overheadProfit, vat, netPrice ตรงสูตร 100% เทียบ BOQ จริง (ยืนยันแล้วกับเอกสาร BOQ จริง 8%/0%VAT) |
| แก้ไข BOQ ของโครงการที่ status=QUOTED | ต้องสร้าง ProjectVersion ใหม่ (versionNo +1) ห้ามแก้ของเดิม |
| CUSTOMER เรียก endpoint `/materials` (ราคาต้นทุน) | ตอบ 403 |
| overheadProfitPercent เปลี่ยนหลังสร้าง version แล้ว | version เก่าไม่เปลี่ยนค่า (เก็บ % ที่ใช้จริงไว้ใน version) |

---

## 6. State Machine

### Project
```
DRAFT ──(ออกใบเสนอราคา)──► QUOTED ──(ลูกค้ายืนยัน/Quote ACCEPTED)──► APPROVED ──(ส่งมอบ/ปิดงาน)──► COMPLETED
DRAFT / QUOTED ──(ยกเลิก)──► CANCELLED
// ระบบไม่ติดตามช่วงก่อสร้าง จึงไม่มีสถานะ IN_PROGRESS — อนุมัติแล้วปิดงานเป็น COMPLETED โดยตรง
```
**Guard:**
- สถานะ terminal (`COMPLETED`, `CANCELLED`) แก้ไขไม่ได้อีก
- `QUOTED → APPROVED` ต้องมี `Quote` ที่ `status=ACCEPTED` ก่อนเท่านั้น
- ทุก transition บันทึก `AuditLog` (`fromStatus → toStatus`)
- transition ผิดกฎ → `throw InvalidTransitionError`

### Quote
```
DRAFT ──(ส่งให้ลูกค้า)──► SENT ──(ลูกค้าตอบรับ)──► ACCEPTED
                          SENT ──(ลูกค้าปฏิเสธ)──► REJECTED
                          SENT ──(ลูกค้าขอปรับ)──► REVISED ──(สร้าง version+quote ใหม่)──► DRAFT
```

---

## 7. External Integrations

ไม่มี external payment/API ตามขอบเขต proposal (§1.3.1) — ข้ามส่วนนี้ในรอบพัฒนานี้

---

## 8. Scheduled Jobs

ไม่มี worker/cron ตามขอบเขต proposal — ข้ามส่วนนี้ในรอบพัฒนานี้

---

## 9. รายละเอียดหน้าจอ

### staff-app (ต้องล็อกอิน role OWNER/ADMIN ทั้งหมด)

| หน้า | หน้าที่ | การกระทำหลัก |
|---|---|---|
| `/login` | ล็อกอินฝั่งบริษัท | rate limit + lockout, redirect ตาม role |
| `/dashboard` | ภาพรวมโครงการ, ยอดเสนอราคา, lead ใหม่ | ดูสรุป, ลิงก์ไปยังโครงการ/lead |
| `/settings` | ตั้งค่าบริษัท, % กำไร, VAT, จัดการ user | แก้ค่าตั้งต้น (OWNER/ADMIN เท่านั้น), audit log ทุกครั้งที่แก้ |
| `/categories` | จัดการหมวดงาน 3 ระดับ | CRUD แบบ tree, reorder |
| `/materials` | จัดการวัสดุ/ค่าแรง/หน่วยนับ | CRUD, ผูกกับหมวดงาน |
| `/customers` | รายชื่อลูกค้า (จาก User role CUSTOMER) | ดูประวัติ, ผูกกับโครงการ |
| `/projects` | รายการโครงการ + สร้างใหม่ | filter ตามสถานะ, ค้นหาประวัติเดิม |
| `/projects/:id/boq` | จัดทำ/แก้ไข BOQ | เลือกวัสดุ/ค่าแรงจากฐานข้อมูล, คำนวณอัตโนมัติ real-time, บันทึกเป็น version |
| `/templates` | จัดการแม่แบบโครงการ | สร้างจากโครงการเดิม, ใช้เป็นจุดตั้งต้นโครงการใหม่ |
| `/projects/:id/quotes` | ใบเสนอราคา | generate PDF, ส่งให้ลูกค้า, ดูสถานะตอบรับ |
| `/projects/:id/contract` | สัญญาก่อสร้าง | generate PDF |
| `/house-designs` | จัดการแบบบ้าน (เผยแพร่ client-app) | CRUD, upload รูป/แปลน, publish toggle |
| `/portfolio` | จัดการผลงาน | CRUD แยกตามประเภท, publish toggle |
| `/leads` | คำขอติดต่อจากลูกค้า | รายการ + สถานะ, badge แจ้งเตือนใหม่ |

**Validation/สิทธิ์:** ทุกหน้าที่เกี่ยวข้องกับต้นทุน/กำไรต้องผ่าน RBAC guard 2 ชั้น (middleware + ตรวจสิทธิ์ในตัว handler)
**Empty/Error state:** ทุกหน้าตารางต้องมี empty state และ error state ที่อ่านง่าย ไม่โชว์ stack trace

### client-app (public + ต้องล็อกอินเฉพาะบางฟังก์ชัน)

| หน้า | ต้องล็อกอิน? | หน้าที่ |
|---|---|---|
| `/` (หน้าแรก) | ไม่ | ข้อมูลบริษัท, บริการ (ออกแบบ/ก่อสร้าง), ขั้นตอนการสร้างบ้าน |
| `/house-designs`, `/house-designs/:id` | ไม่ | แสดงแบบบ้าน, รูปภาพ, แปลน, พื้นที่ |
| `/portfolio` | ไม่ | ผลงานแยกตามประเภท พร้อมรูปภาพ |
| `/contact` | ไม่ (ล็อกอินแล้ว auto-fill ข้อมูล) | ส่งคำขอ ระบุประเภทบริการที่สนใจ + แนบไฟล์ |
| `/register`, `/login` | — | สมัครสมาชิก/ล็อกอินลูกค้า |
| `/my/requests` | ใช่ | ดูประวัติคำขอของตนเอง |
| `/my/quotes/:id` | ใช่ | ดูใบเสนอราคาที่บริษัทออกให้ (netPrice + รายละเอียดงาน ไม่โชว์ต้นทุน), ปุ่มแจ้งขอปรับเพิ่ม/ลดรายละเอียด |

**Validation:** ฟอร์ม contact/register ต้อง validate ฝั่ง server ด้วย Zod ทั้งหมด, กันไฟล์แนบชนิด/ขนาดไม่เหมาะสม
**Realtime/empty/error:** รายการว่าง (ยังไม่มี lead/quote) ต้องมี empty state ชัดเจน

---

## 10. Security Requirements (checklist)

- [ ] Auth session ปลอดภัย (cookie httpOnly + Secure + SameSite)
- [ ] Password hashing ด้วย Argon2id
- [ ] `sessionVersion` — เปลี่ยนสิทธิ์/reset password = session เดิมทั้งหมดใช้ไม่ได้ทันที
- [ ] RBAC 2 ชั้น: middleware + ตรวจสิทธิ์ทำใน server action/route ทุกตัว
- [ ] Validate ทุก input ด้วย Zod (server side)
- [ ] Parameterized query ทุกที่ (ผ่าน Prisma, กัน SQL injection)
- [ ] Rate limiting + login lockout (ทั้ง staff-app และ client-app login)
- [ ] CSRF protection (SameSite cookie + CSRF token สำหรับ mutating request จาก browser)
- [ ] Security headers: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- [ ] Audit log immutable สำหรับ action สำคัญ (แก้ราคา, เปลี่ยนสถานะโครงการ, ตั้งค่าระบบ)
- [ ] Generic error (ไม่โชว์ stack trace / โครงสร้าง DB) ต่อ client
- [ ] ปกปิด/ไม่เผยข้อมูลส่วนต้นทุนหน้า public + กัน enumeration (เช่น เดา projectNo/quoteNo)
- [ ] DB user ฝั่ง app ไม่มีสิทธิ์ DDL / ไม่มี UPDATE-DELETE บน `AuditLog`
- [ ] ไม่มี secret fallback ในโค้ด — ไม่มี env → throw ตอน boot · `.env` ห้าม commit
- [ ] เวลาคำนวณ/ยอดสำคัญคำนวณที่ server เท่านั้น
- [ ] PDPA: ข้อมูลลูกค้า (ชื่อ, เบอร์, อีเมล, ที่อยู่, ไฟล์แนบ) เก็บเท่าที่จำเป็น, มี retention policy, สิทธิ์ลบบัญชี/ข้อมูลตามคำขอ

---

## 11. UI/UX

- โทนสี/theme: โทนน้ำเงิน-เทา (สื่อถึงธุรกิจก่อสร้าง, ปรับได้ภายหลังตาม branding จริง) · Dark mode: nice-to-have ไม่บังคับ
- Responsive: `client-app` ต้อง mobile-first (ลูกค้าเข้าชมผ่านมือถือเป็นหลัก) · `staff-app` desktop-first (ตาราง BOQ ซับซ้อน) แต่ต้องใช้งานได้บนแท็บเล็ต
- Confirmation + toast ทุก action สำคัญ (ลบ, เปลี่ยนสถานะ, ส่งใบเสนอราคา) · loading + empty state ทุกหน้า
- Accessibility: อ้างอิง WCAG AA พื้นฐาน (contrast, keyboard nav, alt text รูปแบบบ้าน/ผลงาน)

---

## 12. Deliverables (checklist)

- [ ] รันได้ด้วย `docker compose up -d --build` (postgres) + `npm run dev` แต่ละส่วน
- [ ] Prisma schema + migrations + seed
- [ ] Core pricing logic + state machine + unit test ครบ (BR-01 ถึง BR-11)
- [ ] หน้าจอครบทุก module ตาม §9
- [ ] Worker cron: ไม่มีตามขอบเขต
- [ ] Security ครบตาม §10
- [ ] `README.md` + `.env.example` (server, staff-app, client-app)

---

## 13. ลำดับการทำงาน

1. **P1:** Monorepo scaffold (`server`/`staff-app`/`client-app`/`packages/shared-types`) + Docker Compose (Postgres) + Prisma schema + seed → รันขึ้นได้
2. **P2:** Core pricing logic (`lib/pricing.ts`) + state machine (`lib/project-state-machine.ts`) + unit test ครบ **ก่อนต่อ UI**
3. **P3:** Auth (session-based) + RBAC (OWNER/ADMIN/CUSTOMER) + หน้า login ทั้ง staff-app และ client-app
4. **P4:** หมวดงาน/วัสดุ/ค่าแรง management (staff-app)
5. **P5:** โครงการ + BOQ editor + versioning + คำนวณราคาอัตโนมัติ
6. **P6:** ใบเสนอราคา/สัญญา PDF export + templates
7. **P7:** client-app (บ้าน/ผลงาน/leads/สมัครสมาชิก/ดูใบเสนอราคาของตน)
8. **P8:** Dashboard ภาพรวม + ค้นหาประวัติโครงการ
9. **P9:** Security hardening + e2e test + README

---

> อ้างอิงต้นฉบับ: `Proposal.pdf` (ระบบประเมินราคาต้นทุนงานก่อสร้างและเว็บแอปพลิเคชันสำหรับลูกค้า, ปัญหาพิเศษ 02739498)
> และ `PROMPT_System_Skeleton_TEMPLATE.md`
