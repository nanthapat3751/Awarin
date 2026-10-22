import { checkDeployConfig } from "../../src/lib/deploy-check";

/** ค่าตั้งที่พร้อมขึ้นระบบจริงครบ — แต่ละเทสต์ทำให้พังทีละข้อ */
const READY: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  CLIENT_BASE_URL: "https://www.example-construction.co.th",
  STAFF_BASE_URL: "https://staff.example-construction.co.th",
  PUBLIC_UPLOAD_BASE_URL: "https://api.example-construction.co.th",
  COOKIE_SECURE: "true",
  MAIL_TRANSPORT: "smtp",
  MAIL_FROM: "Awarin Engineering <no-reply@example-construction.co.th>",
};

const keysOf = (env: NodeJS.ProcessEnv, level: "error" | "warn") =>
  checkDeployConfig(env)
    .filter((p) => p.level === level)
    .map((p) => p.key);

describe("ตรวจค่าตั้งก่อนเปิดระบบจริง", () => {
  it("เครื่อง dev (ไม่ใช่ production) ไม่ตรวจอะไรเลย", () => {
    expect(checkDeployConfig({ NODE_ENV: "development" })).toEqual([]);
    expect(checkDeployConfig({})).toEqual([]);
  });

  it("ค่าตั้งครบและถูกต้อง = ไม่มีปัญหา", () => {
    expect(checkDeployConfig(READY)).toEqual([]);
  });

  it("ไม่ได้ตั้งที่อยู่เว็บ = ห้ามเปิด (ลิงก์ในเมลจะชี้ localhost)", () => {
    expect(keysOf({ ...READY, CLIENT_BASE_URL: undefined }, "error")).toContain("CLIENT_BASE_URL");
    expect(keysOf({ ...READY, STAFF_BASE_URL: "" }, "error")).toContain("STAFF_BASE_URL");
  });

  it("ที่อยู่เว็บยังเป็น localhost หรือเป็น http = ห้ามเปิด", () => {
    expect(keysOf({ ...READY, CLIENT_BASE_URL: "http://localhost:5174" }, "error")).toContain("CLIENT_BASE_URL");
    expect(keysOf({ ...READY, CLIENT_BASE_URL: "http://www.example-construction.co.th" }, "error")).toContain("CLIENT_BASE_URL");
    expect(keysOf({ ...READY, CLIENT_BASE_URL: "ไม่ใช่ลิงก์" }, "error")).toContain("CLIENT_BASE_URL");
  });

  it("โดเมนรูปที่อัปโหลดไม่ได้ตั้ง / เป็น localhost / เป็น http = ห้ามเปิด (รูปทั้งเว็บพัง)", () => {
    expect(keysOf({ ...READY, PUBLIC_UPLOAD_BASE_URL: undefined }, "error")).toContain("PUBLIC_UPLOAD_BASE_URL");
    expect(keysOf({ ...READY, PUBLIC_UPLOAD_BASE_URL: "http://localhost:4000" }, "error")).toContain("PUBLIC_UPLOAD_BASE_URL");
    expect(keysOf({ ...READY, PUBLIC_UPLOAD_BASE_URL: "http://api.example-construction.co.th" }, "error")).toContain(
      "PUBLIC_UPLOAD_BASE_URL",
    );
    expect(keysOf({ ...READY, PUBLIC_UPLOAD_BASE_URL: "ไม่ใช่ลิงก์" }, "error")).toContain("PUBLIC_UPLOAD_BASE_URL");
  });

  it("ใช้ค่า CORS แทนได้ แต่เตือนให้ตั้งตรง ๆ", () => {
    const env = { ...READY, CLIENT_BASE_URL: undefined, CORS_ORIGIN_CLIENT: "https://www.example-construction.co.th" };
    expect(keysOf(env, "error")).not.toContain("CLIENT_BASE_URL");
    expect(keysOf(env, "warn")).toContain("CLIENT_BASE_URL");
  });

  it("คุกกี้ไม่ secure = ห้ามเปิด", () => {
    expect(keysOf({ ...READY, COOKIE_SECURE: "false" }, "error")).toContain("COOKIE_SECURE");
    expect(keysOf({ ...READY, COOKIE_SECURE: undefined }, "error")).toContain("COOKIE_SECURE");
  });

  it("ไม่ได้ส่งเมลจริง = ห้ามเปิด (ลูกค้าไม่ได้รหัสยืนยัน)", () => {
    expect(keysOf({ ...READY, MAIL_TRANSPORT: "console" }, "error")).toContain("MAIL_TRANSPORT");
    expect(keysOf({ ...READY, MAIL_TRANSPORT: undefined }, "error")).toContain("MAIL_TRANSPORT");
  });

  it("ส่งเมลจาก Gmail ส่วนตัว = เปิดได้แต่เตือน", () => {
    const env = { ...READY, MAIL_FROM: '"Awarin Engineering" <someone@gmail.com>' };
    expect(keysOf(env, "error")).toEqual([]);
    expect(keysOf(env, "warn")).toEqual(["MAIL_FROM"]);
  });

  it("ผู้ส่งคนละโดเมนกับเว็บ = เตือน · โดเมนย่อยเดียวกัน (co.th) ไม่เตือน", () => {
    expect(keysOf({ ...READY, MAIL_FROM: "no-reply@another-company.com" }, "warn")).toEqual(["MAIL_FROM"]);
    expect(keysOf({ ...READY, MAIL_FROM: "no-reply@mail.example-construction.co.th" }, "warn")).toEqual([]);
  });
});
