# systemboq

ระบบประเมินราคาต้นทุนงานก่อสร้างและเว็บแอปพลิเคชันสำหรับลูกค้า (โปรเจกต์ปัญหาพิเศษ 02739498)

สเปกฉบับเต็ม (business rules, data model, roadmap) อยู่ที่ [`MASTER_PROMPT.md`](./MASTER_PROMPT.md) — README นี้เน้นวิธีติดตั้ง/รัน/ทดสอบ และสรุปมาตรการความปลอดภัยที่ทำจริง

## ภาพรวมสถาปัตยกรรม

Monorepo (npm workspaces) แบ่งเป็น 4 ส่วน:

```
systemboq/
├── server/                 Express + TypeScript REST API, Prisma ORM, PostgreSQL 17
├── staff-app/               React 19 + Vite — เว็บฝั่งบริษัท (OWNER/ADMIN จัดการ BOQ/ใบเสนอราคา/สัญญา)
├── client-app/               React 19 + Vite — เว็บสาธารณะ + พอร์ทัลลูกค้า (CUSTOMER)
├── packages/shared-types/   TypeScript DTOs ที่ใช้ร่วมกันทั้ง 3 แอป
└── docker-compose.yml       PostgreSQL สำหรับ dev
```

- **Auth**: session-based (ไม่ใช่ JWT) — session เก็บใน DB, cookie เป็น httpOnly/SameSite=Lax
- **RBAC**: 2 ชั้น — `requireAuth` + `requireRole(...)` middleware ต่อ router
- **Password hashing**: Argon2id
- **การคำนวณราคา (unit cost method)**: แต่ละ BOQ line item มีทั้ง `materialUnitPrice` และ `laborUnitPrice` คำนวณที่ server เท่านั้น
- **การถอดปริมาณอัตโนมัติ (quantity take-off)**: บรรทัด BOQ ผูกกับ "ตัวขับ" ระดับโครงการได้ 7 แบบ (พื้นที่พื้น/ผนัง/รอบรูป/ปริมาตร/พื้นที่ตั้งอาคาร/ห้องน้ำ/ชั้น) → `quantity = driver × qtyCoefficient × (1 + wasteFactorPct/100)`; เปลี่ยนค่าวัดของโครงการ → ปริมาณ + ราคารวมทุกบรรทัดที่เกี่ยวข้องคิดใหม่เอง แม่แบบ (template) พก "สูตร" นี้ไปคิดปริมาณจากค่าวัดของโครงการปลายทาง — logic รวมที่ `server/src/modules/boq/boq.service.ts` (`effectiveQuantity`)
- **การถอดปริมาณวัสดุย่อย / bill of materials (BOM)**: บรรทัด BOQ แตกเป็นวัสดุดิบย่อยได้ (เช่น คอนกรีต 1 ม³ = ปูน + ทราย + หิน) → `materialUnitPrice` ของบรรทัดถูก "คำนวณจากผลรวมของสูตร" แทนการพิมพ์ก้อนเดียว (`deriveMaterialUnitPrice` ใน `pricing.ts`); สูตรตั้งซ้ำได้ในแคตตาล็อกวัสดุ, freeze เป็น snapshot คู่กับเวอร์ชัน BOQ, และมี **รายงานสรุปปริมาณวัสดุรวมทั้งโครงการ** (ลิสต์สั่งซื้อ) ที่ `GET /api/projects/:id/boq/material-summary` (ฝั่ง staff เท่านั้น — ต้นทุนไม่หลุดถึงลูกค้า)
- **State machines**: `Project` (DRAFT → QUOTED → APPROVED → COMPLETED, CANCELLED เป็น terminal — ระบบไม่ติดตามช่วงก่อสร้าง จึงไม่มีสถานะ IN_PROGRESS) และ `Quote` (DRAFT → SENT → ACCEPTED/REJECTED/REVISED) — ดู `server/src/lib/*-state-machine.ts`
- **เลขที่เอกสาร** (projectNo/quoteNo/contractNo): สร้างแบบ atomic ผ่าน `DocumentCounter` table + `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` (row-level lock ของ Postgres เอง ไม่มี race condition — มี concurrency test คุมไว้ที่ `server/tests/integration/document-sequence-concurrency.test.ts`)
- **PDF**: render ผ่าน Puppeteer (HTML → PDF, Chromium headless) เพื่อให้ฟอนต์ไทยแสดงผลถูกต้อง

## เริ่มต้นใช้งาน (dev)

### 1. ติดตั้ง dependency ทั้ง monorepo

```bash
npm install
```

### 2. ตั้งค่า environment variables

```bash
cp .env.example server/.env
```

ค่าเริ่มต้นใน `.env.example` ใช้ได้ทันทีกับ `docker-compose.yml` — ดูตารางตัวแปรทั้งหมดด้านล่าง

### 3. เปิดฐานข้อมูล

```bash
docker compose up -d
```

จะสร้าง Postgres container พร้อม role สองแบบ (ดูหัวข้อ "การแยกสิทธิ์ผู้ใช้ฐานข้อมูล" ด้านล่าง):
- `boq` — superuser สำหรับ migration เท่านั้น
- `boq_app` — role จำกัดสิทธิ์ที่แอปใช้จริงตอนรัน (สร้างโดย `server/prisma/init/01-create-runtime-role.sql` ตอน container เริ่มครั้งแรก)

### 4. รัน migration + seed ข้อมูลตั้งต้น

```bash
cd server
npx prisma migrate dev
npx tsx prisma/seed.ts
```

`seed.ts` จะ:
- สร้าง/re-grant สิทธิ์ของ role `boq_app` แบบ idempotent (รวมถึง revoke UPDATE/DELETE บน `AuditLog`)
- สร้างบัญชี OWNER เริ่มต้น (ถ้ายังไม่มี OWNER อยู่ในระบบ) แล้วพิมพ์อีเมล/รหัสผ่านออกทาง log — บังคับเปลี่ยนรหัสผ่านตอนล็อกอินครั้งแรก
- สร้างหมวดหมู่งาน/ราคาอ้างอิงตัวอย่างจากเอกสาร BOQ จริง

### 5. ตั้งค่าฐานข้อมูลสำหรับทดสอบ (ครั้งเดียว)

```bash
npm run db:test:migrate   # ยิง migration ชุดเดียวกัน แต่ไปที่ systemboq_test
npm run db:test:grant     # grant สิทธิ์ boq_app บน systemboq_test (เหมือน seed.ts ทำกับ systemboq)
```

จำเป็น — `npm test` **ต้อง** ยิงเข้า `systemboq_test` ไม่ใช่ `systemboq` (ดูเหตุผลในหัวข้อ "ทดสอบ" ด้านล่าง) ฐานข้อมูลนี้ถูกสร้างอัตโนมัติแล้วตอน `docker compose up -d` (จาก `server/prisma/init/02-create-test-db.sql`) ขั้นนี้แค่รัน schema + สิทธิ์เข้าไปข้างใน

### 6. รันแต่ละส่วน (คนละ terminal)

```bash
npm run dev:server   # http://localhost:4000
npm run dev:staff    # http://localhost:5173
npm run dev:client   # http://localhost:5174
```

## ตัวแปรแวดล้อม (environment variables)

### `server/.env`

| ตัวแปร | คำอธิบาย | ค่าเริ่มต้น (dev) |
|---|---|---|
| `DATABASE_URL` | connection string ของ superuser (`boq`) — ใช้เฉพาะ `prisma migrate`/`prisma generate`/`prisma db seed` | `postgresql://boq:boq_dev_password@localhost:5432/systemboq` |
| `DATABASE_URL_RUNTIME` | connection string ของ role จำกัดสิทธิ์ (`boq_app`) — แอปที่รันจริง (`npm run dev:server`) เชื่อมต่อผ่านตัวนี้เท่านั้น **ต้องตั้งค่า ไม่มี fallback** (แอปจะ throw ตอน boot ถ้าไม่มี) | `postgresql://boq_app:boq_app_dev_password@localhost:5432/systemboq` |
| `DATABASE_URL_TEST` | superuser connection string ของฐานข้อมูลทดสอบ (`systemboq_test`) — ใช้โดย `npm run db:test:migrate` เท่านั้น | `postgresql://boq:boq_dev_password@localhost:5432/systemboq_test` |
| `DATABASE_URL_TEST_RUNTIME` | connection string ของ `boq_app` บน `systemboq_test` — `tests/setup-env.ts` สลับค่านี้เข้าไปแทน `DATABASE_URL_RUNTIME` โดยอัตโนมัติตอนรัน `npm test` **ต้องตั้งค่า ไม่มี fallback** เช่นกัน | `postgresql://boq_app:boq_app_dev_password@localhost:5432/systemboq_test` |
| `PORT` | พอร์ตที่ Express ฟัง | `4000` |
| `NODE_ENV` | `development` / `production` | `development` |
| `SESSION_COOKIE_NAME` | ชื่อ cookie เก็บ session token | `systemboq_session` |
| `SESSION_TTL_HOURS` | อายุ session (ชั่วโมง) | `12` |
| `COOKIE_SECURE` | ตั้ง `Secure` flag บน cookie (ต้องเป็น `true` เมื่อรันผ่าน HTTPS จริง) | `false` |
| `CORS_ORIGIN_STAFF` | origin ที่อนุญาตให้เรียก API จาก staff-app | `http://localhost:5173` |
| `CORS_ORIGIN_CLIENT` | origin ที่อนุญาตให้เรียก API จาก client-app | `http://localhost:5174` |
| `PUBLIC_UPLOAD_BASE_URL` | โดเมนของ API ที่เสิร์ฟรูป `/uploads/...` — ฐานข้อมูลเก็บรูปเป็น path สัมพัทธ์ แล้ว API ต่อโดเมนนี้ให้ตอนส่งออก **ย้ายโดเมนแก้ค่านี้ค่าเดียว** (ดู `src/lib/upload-urls.ts`) | `http://localhost:4000` |
| `BACKUP_DATABASE_URL` | role อ่านอย่างเดียว `boq_backup` สำหรับ pg_dump — ไม่ตั้ง = ไม่มีการสำรองเลย (หน้าตั้งค่าขึ้นเตือนสีแดง) | `postgresql://boq_backup:boq_backup_dev_password@localhost:5432/systemboq` |
| `BACKUP_PG_DOCKER_CONTAINER` | ใช้ pg_dump ในคอนเทนเนอร์ฐานข้อมูลแทนการติดตั้งบนเครื่อง — เว้นว่างถ้าเครื่องมี PostgreSQL client (หรือตั้ง `BACKUP_PG_BIN_DIR`) | `systemboq-db-1` |
| `BACKUP_DIR` | โฟลเดอร์เก็บชุดสำรอง (สัมพัทธ์กับ `server/`) | `backups` |
| `BACKUP_MIRROR_DIR` | สำเนานอกเครื่อง ใส่ได้หลายที่คั่นด้วย `;` เช่น `G:\My Drive\systemboq-backups;E:\systemboq-backups` (Google Drive + USB) — **ต้องสร้างโฟลเดอร์ไว้เองก่อน** ระบบไม่สร้างให้ (กันไดรฟ์ไม่ได้เสียบแล้วไปเขียนลงดิสก์เครื่องเดิมแทน) · ที่ไม่ได้ต่ออยู่จะถูกข้าม แล้วคัดลอกชุดที่ขาดให้ครบเมื่อต่อกลับมา · **ควรตั้งก่อนใช้งานจริง** | ว่าง |
| `BACKUP_HOUR` / `BACKUP_KEEP_DAYS` | สำรองอัตโนมัติทุกวันกี่โมง (เวลาไทย) / เก็บย้อนหลังกี่วัน (เหลืออย่างน้อย 3 ชุดล่าสุดเสมอ) | `2` / `14` |
| `BACKUP_ENABLED` | `false` = ปิดการสำรองอัตโนมัติ (ยังกดสำรองเองได้) | เปิด |

### `staff-app/.env` และ `client-app/.env` (ทั้งคู่ optional)

| ตัวแปร | คำอธิบาย | ค่าเริ่มต้นถ้าไม่ตั้ง |
|---|---|---|
| `VITE_API_BASE_URL` | URL ของ `server` API | `http://localhost:4000` |

## ทดสอบ

```bash
cd server
npm test
```

รัน integration tests (ผ่าน Supertest ยิงเข้า Express app จริง + Postgres จริง) และ unit tests (pricing, state machines, take-off, rebar) ครบทุก module — ปัจจุบัน 232 tests ผ่านทั้งหมด

หมายเหตุ: `jest.config.js` ตั้ง `maxWorkers: 1` โดยตั้งใจ เพราะทุก integration test ใช้ Postgres ตัวเดียวกันจริง (ไม่ mock) — รันพร้อมกันหลาย worker ทำให้ connection pool ชนกันและ test สุ่ม fail (พบและแก้ระหว่างพัฒนา)

### ฐานข้อมูลสำหรับทดสอบ (test database)

`tests/setup-env.ts` **บังคับ** ให้ test process เชื่อมต่อ `systemboq_test` เท่านั้น (สลับ `DATABASE_URL`/`DATABASE_URL_RUNTIME` เป็นค่าจาก `DATABASE_URL_TEST`/`DATABASE_URL_TEST_RUNTIME` ก่อน test ใดๆ จะรัน — ถ้าไม่ได้ตั้งค่าสองตัวนี้ test จะ throw ทันที ไม่มี fallback ไปที่ฐานข้อมูล dev)

เหตุผล: หลาย integration test (เช่น `dashboard.test.ts`, `boq.test.ts`, `contracts.test.ts`, `quotes.test.ts`, `materials.test.ts`) สร้าง `WorkCategory`/`User` จริงเพื่อทดสอบ โดยบาง suite ไม่ได้ลบทิ้งใน `afterAll` ครบทุกกรณี (โดยเฉพาะเมื่อ process ถูก interrupt กลางคัน) — ถ้ายิงเข้าฐานข้อมูล dev ตัวเดียวกับที่ staff-app ใช้ ข้อมูลทดสอบ (เช่น "หมวดทดสอบแดชบอร์ด", "หมวดทดสอบ BOQ") จะไปปนกับข้อมูลจริงที่เห็นในหน้า UI ทันที (เคยเกิดขึ้นจริงระหว่างพัฒนา ก่อนจะแยกฐานข้อมูลนี้ออกมา) การแยกฐานข้อมูลทำให้ต่อให้ test สร้างขยะทิ้งไว้ก็จะอยู่ใน `systemboq_test` เท่านั้น ไม่กระทบ dev

ตั้งค่าครั้งแรก: ดูขั้นตอนที่ 5 ในหัวข้อ "เริ่มต้นใช้งาน (dev)" ด้านบน — ถ้า `systemboq_test` มีขยะสะสมมากจนรำคาญ ลบทั้งฐานข้อมูลทิ้งแล้วสร้างใหม่ได้เลย (ไม่มีข้อมูลจริงอยู่ในนั้น):
```bash
docker exec systemboq-db-1 psql -U boq -d systemboq -c "DROP DATABASE systemboq_test;"
docker exec systemboq-db-1 psql -U boq -d systemboq -c "CREATE DATABASE systemboq_test OWNER boq;"
cd server && npm run db:test:migrate && npm run db:test:grant
```

## การแยกสิทธิ์ผู้ใช้ฐานข้อมูล (DB privilege separation)

แอปที่รันจริง (`server` process) เชื่อมต่อ Postgres ด้วย role `boq_app` ที่ถูกจำกัดสิทธิ์ ไม่ใช่ superuser ที่ใช้รัน migration:

- ไม่มีสิทธิ์ DDL (CREATE/ALTER/DROP TABLE) — ป้องกันไม่ให้โค้ดแอป (หรือช่องโหว่ SQL injection ที่หลุดรอดมา) แก้โครงสร้าง DB ได้
- มีสิทธิ์ SELECT/INSERT/UPDATE/DELETE บนตารางทั่วไป แต่ **ไม่มีสิทธิ์ UPDATE/DELETE บน `AuditLog`** — บังคับ append-only จริงที่ระดับฐานข้อมูล ไม่ใช่แค่ที่ระดับ application code
- role นี้ถูกสร้างสองที่ (ตั้งใจ ไม่ใช่ซ้ำซ้อนโดยไม่จำเป็น): `server/prisma/init/01-create-runtime-role.sql` (mount เป็น `docker-entrypoint-initdb.d`, รันครั้งเดียวตอนสร้าง container ใหม่ ก่อนที่ตาราง migration จะถูกสร้าง) และ `server/prisma/seed.ts` (idempotent, รันได้ทุกครั้ง — จุดเดียวที่ revoke สิทธิ์บน `AuditLog` ได้ เพราะต้องรอให้ migration สร้างตารางนั้นก่อน) — logic ที่ใช้ grant สิทธิ์อยู่ใน `server/prisma/grant-runtime-privileges.ts` กลางไฟล์เดียว ใช้ร่วมกันทั้ง `seed.ts` (dev DB) และ `prisma/setup-test-db.ts` (test DB) เพื่อให้สิทธิ์ทั้งสองฐานข้อมูลตรงกันเสมอ
- ฐานข้อมูลทดสอบ (`systemboq_test`) ได้สิทธิ์ชุดเดียวกันทุกประการ ผ่าน `server/prisma/init/02-create-test-db.sql` (สร้าง database ตอน container init) + `npm run db:test:grant` (grant/revoke หลัง migrate) — ดูหัวข้อ "ฐานข้อมูลสำหรับทดสอบ" ด้านล่าง
- มี regression test คุมไว้ถาวรที่ `server/tests/integration/db-privileges.test.ts` — ยิง `UPDATE`/`DELETE`/`CREATE TABLE` ผ่าน connection ของแอปจริงแล้วยืนยันว่าถูก Postgres ปฏิเสธ
- role ที่สาม `boq_backup` — **SELECT อย่างเดียว** ใช้กับ pg_dump ตอนสำรองข้อมูล (`boq_app` อ่าน `_prisma_migrations` ไม่ได้โดยตั้งใจ และไม่ควรขยายสิทธิ์แอปเพื่อการนี้ ส่วน superuser ไม่ควรอยู่ในมือโปรเซสแอปที่ตั้งเวลาสำรอง) สร้าง/ให้สิทธิ์บนฐานข้อมูลที่มีอยู่แล้วด้วย `npm run db:grant:backup -w server` (ทำซ้ำได้ ไม่เติมข้อมูลอะไร) · เทสต์คุมที่ `tests/integration/backups.test.ts`

## สำรองข้อมูลและกู้คืน

หนึ่งชุดสำรอง = โฟลเดอร์ `server/backups/systemboq-YYYY-MM-DD_HHMMSS/` มี `database.dump` (pg_dump แบบ custom) + `files/uploads/` (รูป) + `files/private-uploads/` (ไฟล์แนบใบเสนอราคา) + `manifest.json` (จำนวนแถวรายตาราง, checksum) — ต้องได้ทั้งฐานข้อมูลและไฟล์ เพราะฐานข้อมูลอ้างชื่อไฟล์

- **อัตโนมัติ**: เซิร์ฟเวอร์สำรองเองทุกวันเวลา `BACKUP_HOUR` · เครื่องปิดข้ามเวลานั้น = สำรองชดเชยหลังบูต 1 นาที · ล้มเหลว = แจ้งเตือน OWNER ทุกคน
- **ดูสถานะ / สั่งทันที**: หน้าตั้งค่า → ความปลอดภัย → การ์ด "สำรองข้อมูล" (เฉพาะ OWNER · ไม่มีปุ่มดาวน์โหลดทางเว็บโดยตั้งใจ — ไฟล์นั้นคือข้อมูลทั้งบริษัท)
- **จากเครื่องเซิร์ฟเวอร์**: `npm run backup -w server`

ทดลองกู้ (ควรทำเป็นระยะ — ชุดสำรองที่ไม่เคยลองกู้ = ไม่รู้ว่าใช้ได้จริง):
```bash
npm run backup:restore -w server              # กู้ชุดล่าสุดลงฐานข้อมูลชั่วคราว เทียบจำนวนแถวกับ manifest แล้วลบทิ้ง — ไม่แตะของจริง
npm run backup:restore -w server -- systemboq-2026-09-18_020000
```

กู้ทับของจริง (หยุดเซิร์ฟเวอร์ก่อน · ระบบสำรองสภาพปัจจุบันไว้อีกชุดให้อัตโนมัติก่อนทับ):
```bash
npm run backup:restore -w server -- systemboq-2026-09-18_020000 --into systemboq --force --with-files
```
ทดลองกู้จากสำเนานอกเครื่อง: ส่ง path เต็มของโฟลเดอร์ชุดนั้นแทนชื่อ เช่น `npm run backup:restore -w server -- "G:\My Drive\systemboq-backups\systemboq-2026-09-18_020000"`

`--with-files` ย้ายโฟลเดอร์รูป/ไฟล์แนบเดิมไปพักไว้เป็น `*.before-restore-<เวลา>` (ไม่ลบ) แล้วคัดลอกของจากชุดสำรองเข้าไปแทน

หมายเหตุ Windows: ห้ามใช้ `fs.cpSync` กับโฟลเดอร์โปรเจกต์นี้ — Node 22 ล้มทั้งโปรเซสเงียบ ๆ เมื่อ path มีอักษรไทย (ระบบสำรองจึงคัดลอกทีละไฟล์ ดู `copyDir` ใน `src/lib/backup/backup.ts`)

## สรุปมาตรการความปลอดภัย (ตาม checklist §10 ของ MASTER_PROMPT.md)

| หัวข้อ | สถานะ | รายละเอียด |
|---|---|---|
| Session cookie ปลอดภัย | ✅ | httpOnly + SameSite=Lax + Secure (เมื่อ `COOKIE_SECURE=true`) |
| Password hashing | ✅ | Argon2id |
| `sessionVersion` invalidation | ✅ | เปลี่ยนรหัสผ่าน (`POST /api/auth/change-password`) หรือลบบัญชี จะ increment `sessionVersion` — session อื่นทั้งหมดใช้ไม่ได้ทันที (lazy-checked ทุก request ที่ `resolveSession()`) |
| RBAC 2 ชั้น | ✅ | ทุก router ที่ต้อง auth ใช้ `.use(requireAuth, requireRole(...))` |
| Input validation | ✅ | Zod schema ทุก endpoint ที่รับ input |
| Parameterized query | ✅ | ทุก query ที่รับ input จาก client ผ่าน Prisma Client API (parameterized โดยธรรมชาติ) — จุดที่ใช้ `$executeRawUnsafe` มีเฉพาะ admin script คงที่ (`prisma/seed.ts` ตั้งค่าสิทธิ์ role, และ test สำหรับตรวจสิทธิ์) ไม่มี user input ถูก interpolate เข้าไปในนั้นเลย |
| Rate limiting + lockout | ✅ | login: lock หลัง 5 ครั้งผิดติดต่อกัน (คืน 423); registration: 10 ครั้ง/ชั่วโมง/IP (คืน 429) — ดู `server/src/lib/rate-limit.ts` |
| CSRF protection | ✅ (ไม่มี token เพิ่ม — เหตุผลด้านล่าง) | |
| Security headers | ✅ | `helmet()` default (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy ฯลฯ) — ยืนยันแล้วผ่าน `curl -I` กับ server ที่รันจริง |
| Audit log immutable | ✅ | บังคับที่ระดับ DB (ดูหัวข้อด้านบน) ไม่ใช่แค่ application code |
| Generic errors | ✅ | error handler กลางใน `app.ts` ไม่ส่ง stack trace/โครงสร้าง DB ออกไป |
| ปกปิดข้อมูลต้นทุนจาก public | ✅ | `myQuotes.service.ts` ตัด field ต้นทุน/กำไรออกก่อนส่งให้ลูกค้า — มี test คุม |
| DB user จำกัดสิทธิ์ | ✅ | ดูหัวข้อ "การแยกสิทธิ์ผู้ใช้ฐานข้อมูล" ด้านบน |
| ไม่มี secret fallback | ✅ | `DATABASE_URL_RUNTIME` ไม่มี fallback (throw ตอน boot ถ้าไม่ตั้งค่า) · `.env` อยู่ใน `.gitignore` |
| คำนวณราคาที่ server เท่านั้น | ✅ | ทุกจุดคำนวณ (unit cost, overhead/profit %, VAT) อยู่ใน `server/src/lib/pricing.ts` ไม่มี client ส่งราคาที่คำนวณแล้วมาให้เชื่อ |
| PDPA: retention + สิทธิ์ลบบัญชี | ✅ | `POST /api/auth/delete-account` (CUSTOMER เท่านั้น) — anonymize ในที่ ไม่ hard-delete (ดูเหตุผลด้านล่าง) |

### เหตุผลที่ไม่เพิ่ม CSRF token แยก

Cookie ตั้ง `SameSite=Lax` (browser ไม่แนบ cookie นี้กับ cross-site request ที่เป็น POST/PUT/DELETE) ร่วมกับ CORS origin whitelist ที่จำกัดเฉพาะ `CORS_ORIGIN_STAFF`/`CORS_ORIGIN_CLIENT` และทุก mutating endpoint บังคับ `Content-Type: application/json` (browser จะ trigger CORS preflight เสมอสำหรับ content-type นี้ ต่างจาก HTML form ปกติที่ cross-site form POST ทำได้โดยไม่มี preflight) รวมกับการที่ไม่มี state-changing route แบบ GET เลยในระบบ — สามรวมกันนี้ปิดช่องทางโจมตี CSRF แบบมาตรฐานได้ครบโดยไม่ต้องเพิ่ม token layer ซ้ำซ้อน (ทีมประเมินแล้วว่า pattern นี้เป็นมาตรฐานที่ยอมรับได้สำหรับ SPA + API แยกกันแบบนี้)

### เหตุผลที่ PDPA delete-account เป็น anonymize ไม่ใช่ hard delete

ตาราง `Project`/`Quote`/`Contract`/`Lead`/`AuditLog` มี foreign key อ้างถึง `User` และธุรกิจจริงจำเป็นต้องเก็บประวัติเหล่านี้ไว้ตามกฎหมาย (บัญชี/ภาษี/สัญญา) — การลบบัญชีจริงจะทำลาย referential integrity ของข้อมูลธุรกิจที่ต้องเก็บ จึงใช้วิธี anonymize แทน: เขียนทับ `email`/`fullName`/`phone`/`address` เป็นค่า anonymized, ตั้ง `active=false`, revoke session ทั้งหมด — ประวัติธุรกิจยังอ้างอิงถึง user record ได้ปกติแต่ไม่มีข้อมูลระบุตัวตนหลงเหลือ

## สิ่งที่ตั้งใจไม่ทำในเฟสนี้ (documented follow-up)

- **CSP header เฉพาะของ frontend SPA**: เป็นหน้าที่ของ hosting layer ตอน deploy จริง (เช่น nginx/Vercel headers) ไม่ใช่ของ Express API นี้ — ยังไม่เลือก deploy target ที่แน่นอน
- **File upload pipeline**: ตัดสินใจตั้งแต่ช่วงกลางโปรเจกต์ให้ field รูปภาพ (บ้านตัวอย่าง/ผลงาน) เป็น URL แทนการอัปโหลดไฟล์จริง — นอกขอบเขต
- **สะกดจำนวนเงินเป็นตัวอักษรไทยบน PDF** ("หนึ่งแสนสองหมื่นบาทถ้วน"): เป็น nice-to-have ที่ระบุไว้ตั้งแต่ช่วง PDF rendering ไม่ใช่ core requirement
