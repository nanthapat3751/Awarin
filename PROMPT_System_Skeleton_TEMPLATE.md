# MASTER PROMPT TEMPLATE — [ชื่อระบบ]

> **วิธีใช้:** คัดลอกไฟล์นี้ไปวางเป็น Prompt แรกให้ AI Coding Agent ในโฟลเดอร์ว่างใหม่ แล้ว **แทนที่ทุก `[...]` และเติมช่องว่างในตาราง** ด้วยรายละเอียดของงานคุณ
> ลบส่วนที่ไม่ใช้ออกได้ · เครื่องหมาย `⬚` = ยังไม่ได้กรอก

---

## 0. กฎเหล็ก (อ่านก่อนเริ่ม)

1. สร้างโปรเจกต์ใหม่ทั้งหมดในโฟลเดอร์ว่าง ชื่อ `[project-name]/`
2. [ข้อห้าม/ข้อบังคับเฉพาะโปรเจกต์ เช่น ห้ามแตะ repo อ้างอิง / ห้าม commit .env]
3. ภาษา UI: `[ไทย / อังกฤษ / …]` · ภาษาโค้ด: อังกฤษ
4. [กฎอื่น ๆ …]

---

## 1. บริบทโปรเจกต์

**ระบบ:** [อธิบายสั้น ๆ ว่าระบบทำอะไร]
**เป้าหมาย:** [ผู้ใช้ได้อะไร / แก้ปัญหาอะไร]

### ผู้ใช้ & บทบาท (Roles)
| Role | คำอธิบาย | การเข้าถึง |
|---|---|---|
| `[ROLE_1]` | ⬚ | [ล็อกอิน / ไม่ต้อง] |
| `[ROLE_2]` | ⬚ | ⬚ |
| `[ADMIN]` | ผู้ดูแลระบบ | ล็อกอิน (สิทธิ์สูงสุด) |

> ผู้ใช้ 1 คนมีได้หลายบทบาทหรือไม่: [ใช่ → ตาราง M:N / ไม่]

---

## 2. Technology Stack

| ชั้น | เทคโนโลยีที่เลือก |
|---|---|
| Framework / Frontend | [เช่น Next.js / React / Vue …] |
| ภาษา | [TypeScript (strict) / …] |
| Backend / API | [Server Actions / REST / GraphQL …] |
| ORM | [Prisma / Drizzle / …] |
| Database | [PostgreSQL / MySQL / MongoDB …] |
| Cache / Queue | [Redis / …] (ใช้ทำอะไร: ⬚) |
| Auth | [Auth.js / Clerk / JWT …] + [session แบบ …] |
| Password hashing | [Argon2id / …] |
| Validation | [Zod / …] |
| Realtime | [SSE / WebSocket / Polling / — ] |
| ไฟล์ / Export | [exceljs / pdf / csv / — ] |
| การชำระเงิน (ถ้ามี) | [Provider …] (interface + mock) |
| งานตามเวลา (cron) | [node-cron / pg_cron / — ] |
| Styling / UI | [Tailwind / shadcn / …] |
| Test | [vitest / playwright / …] |
| Mobile (ถ้ามี) | [Expo / React Native / — ] |
| Deploy | [Docker Compose / Vercel / …] |

---

## 3. โครงสร้างโฟลเดอร์ (แก้ตาม stack ที่เลือก)

```
[project-name]/
├── docker-compose.yml            # (ถ้าใช้) services: web, worker, db, cache
├── Dockerfile
├── .env.example
├── README.md
├── prisma/ (หรือ db/)
│   ├── schema.prisma
│   └── seed.ts                   # ข้อมูลตั้งต้น (โครงสร้าง + บัญชี admin)
├── src/
│   ├── app/ (หรือ pages/ routes/)
│   │   ├── [หน้า public …]
│   │   ├── (auth)/login
│   │   ├── [หน้าตามบทบาท …]
│   │   └── api/
│   │       ├── auth/…
│   │       ├── health/            # liveness + readiness
│   │       └── [endpoints …]
│   ├── lib/
│   │   ├── [core-logic].ts        # ตรรกะธุรกิจหลัก (pure, testable)
│   │   ├── [state-machine].ts     # state + guard (ถ้ามี entity มีสถานะ)
│   │   ├── auth.ts / rbac.ts / db.ts / cache.ts / settings.ts
│   │   └── [integrations]/        # payment / external API (interface + mock)
│   ├── components/
│   └── types/
├── worker/ (ถ้ามี cron)
│   └── jobs.ts
└── tests/
    ├── [core-logic].test.ts
    ├── integration/
    └── e2e/
```

---

## 4. Database Schema

### Enums
```
enum [Role]        { ⬚ }
enum [Status]      { ⬚ }
enum [ … ]         { ⬚ }
```

### ตารางหลัก
| ตาราง | ฟิลด์สำคัญ |
|---|---|
| `User` | id, username(uniq), passwordHash, fullName, email, active, sessionVersion, failedAttempts, lockedUntil |
| `UserRole` | userId, role (ถ้ามีหลายบทบาท) |
| `[Entity_1]` | ⬚ |
| `[Entity_2]` | ⬚ |
| `AuditLog` | id, userId?, action, entityType, entityId, details(Json), ip, userAgent, createdAt — **immutable** |
| `Setting` | key(uniq), value, updatedById, updatedAt |

### ข้อบังคับ Schema
- Index ที่จำเป็น: `[ระบุ]`
- Unique / partial-unique constraint: `[ระบุกติกาที่ต้องกัน เช่น สถานะ active ซ้ำ]`
- `AuditLog` append-only (REVOKE UPDATE/DELETE จาก app user)
- เวลาเป็น `TIMESTAMPTZ` · timezone `[Asia/Bangkok / …]`
- **เวลาสำคัญ (เข้า/ออก/ชำระ) มาจากเซิร์ฟเวอร์เท่านั้น** ห้ามเชื่อเวลาจาก client

### Seed
- ข้อมูลโครงสร้างจริง (ไม่ใส่ข้อมูลปลอมสำหรับ demo ถ้าไม่ต้องการ)
- บัญชีตั้งต้น: `[admin / …]` (รหัสผ่านชั่วคราว — เปลี่ยนก่อนใช้จริง)
- ค่า Setting เริ่มต้น: `[ระบุ]`

---

## 5. Business Rules / Core Logic

> ตรรกะธุรกิจหลักเขียนเป็น **pure function** (ห้ามเรียก DB ข้างใน) + มี unit test ทุกข้อ

### ค่าตั้งต้น (แก้ได้จากหน้า Admin)
```
[setting_key_1] = [ค่า]
[setting_key_2] = [ค่า]
```

### กติกา (เติมให้ครบ + มี test ทุกข้อ)
| # | กติกา |
|---|---|
| **BR-01** | ⬚ |
| **BR-02** | ⬚ |
| **BR-…** | ⬚ |

### Test cases บังคับ
| อินพุต | ผลลัพธ์ที่ถูกต้อง |
|---|---|
| ⬚ | ⬚ |
| ⬚ | ⬚ |

---

## 6. State Machine (ถ้ามี entity ที่มีสถานะ)

```
[INITIAL] ──([action])──► [STATE_A] ──([action])──► [TERMINAL]
                              └──([action])──► [STATE_B]
```
**Guard:**
- สถานะ terminal เปลี่ยนต่อไม่ได้: `[ระบุ]`
- ทุก transition บันทึก AuditLog (`fromStatus → toStatus`)
- transition ผิดกติกา → `throw InvalidTransitionError`
- [กติกาพิเศษ เช่น side-effect ทำได้ครั้งเดียว …]

---

## 7. External Integrations (Payment / API ภายนอก — ถ้ามี)

```ts
export interface [ProviderName] {
  [method](input: …): Promise<…>;
  verifyWebhook(rawBody: string, signature: string): boolean;   // HMAC
  parseWebhook(body: unknown): { … };
}
```
- Implement: `Mock[Provider]` (สำหรับ dev/demo) + `[Real Provider]`
- Webhook: ตรวจ HMAC ก่อน → **idempotent** (unique txn id) → **คำนวณ/ตรวจค่าฝั่งเซิร์ฟเวอร์**

---

## 8. Scheduled Jobs (ถ้ามี worker)

| Job | ความถี่ | หน้าที่ |
|---|---|---|
| ⬚ | ⬚ | ⬚ |
| ⬚ | ⬚ | ⬚ |

---

## 9. รายละเอียดหน้าจอ (ทำซ้ำบล็อกนี้ต่อ 1 หน้า)

### 📍 [ชื่อหน้า] (`/[route]`) — [ต้องล็อกอิน? บทบาทไหน?]
- **หน้าที่:** ⬚
- **องค์ประกอบ:** ⬚
- **การกระทำหลัก:** ⬚ (→ ผลลัพธ์: ⬚)
- **Validation / สิทธิ์:** ⬚
- **Realtime / empty state / error state:** ⬚

*(คัดลอกบล็อกด้านบนสำหรับหน้าถัดไป …)*

---

## 10. Security Requirements (checklist)

- [ ] Auth session ปลอดภัย (cookie httpOnly + Secure + SameSite)
- [ ] Password hashing แข็งแรง (Argon2id / bcrypt-cost สูง)
- [ ] `sessionVersion` — เปลี่ยนสิทธิ์/reset password = session เดิมใช้ไม่ได้ทันที
- [ ] RBAC 2 ชั้น: middleware/proxy + ตรวจสิทธิ์ซ้ำใน server action/route
- [ ] Validate ทุก input (server side)
- [ ] Parameterized query เท่านั้น (กัน SQL injection)
- [ ] Rate limiting + login lockout
- [ ] CSRF protection
- [ ] Security headers: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- [ ] Audit log immutable สำหรับ action สำคัญ
- [ ] Generic error (ไม่เผย stack trace / โครงสร้าง DB)
- [ ] ปกปิด/ไม่เผยข้อมูลส่วนบุคคลในหน้า public + กัน enumeration
- [ ] DB user แยกสิทธิ์ (ไม่มี DDL / ไม่ UPDATE-DELETE บน AuditLog)
- [ ] ไม่มี secret fallback ในโค้ด — ไม่มี env → throw ตอน boot · .env ห้าม commit
- [ ] เวลาคำนวณค่าสำคัญอ้างอิงเซิร์ฟเวอร์
- [ ] PDPA/ความเป็นส่วนตัว: [anonymize / retention / สิทธิ์ขอลบ]

---

## 11. UI/UX

- โทนสี / theme: `[ระบุ]` · Dark mode: [มี/ไม่]
- Responsive: `[อุปกรณ์เป้าหมาย …]`
- Confirmation + toast ทุก action สำคัญ · loading + empty state ทุกหน้า
- Accessibility: `[ระดับที่ต้องการ เช่น WCAG AA]`

---

## 12. Deliverables (checklist)

- [ ] รันได้ด้วย `[คำสั่งรัน เช่น docker compose up -d --build]`
- [ ] Schema + migrations + seed
- [ ] Core logic + test ผ่านครบ
- [ ] State machine + guard test (ถ้ามี)
- [ ] หน้าจอครบทุก module ตาม §9
- [ ] Integration/external provider + mock (ถ้ามี)
- [ ] Worker cron (ถ้ามี)
- [ ] Security ครบตาม §10
- [ ] `README.md` + `.env.example`

---

## 13. ลำดับการทำงาน (ทำทีละเฟส — รายงานจบเฟส แล้วรอคำสั่งก่อนไปต่อ)

1. **P1:** โปรเจกต์ใหม่ + infra (Docker/DB/cache) + schema + seed → รันขึ้นได้
2. **P2:** Core logic + unit test **ผ่านครบก่อนแตะ UI**
3. **P3:** Auth + RBAC + หน้า login
4. **P4:** [หน้า/ฟีเจอร์หลัก 1]
5. **P5:** [หน้า/ฟีเจอร์หลัก 2]
6. **P6:** [Integration / payment / realtime …]
7. **P7:** [Admin / รายงาน / ตั้งค่า]
8. **P8:** Worker cron + observability (ถ้ามี)
9. **P9:** Security hardening + e2e test + README

---

> **หมายเหตุ:** ลบส่วนที่ไม่เกี่ยวกับโปรเจกต์ออก · เก็บเฉพาะโครงที่ใช้จริง · เติมทุก `[...]` และ `⬚` ให้ครบก่อนส่งให้ AI Agent
