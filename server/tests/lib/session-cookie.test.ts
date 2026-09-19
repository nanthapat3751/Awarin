import {
  CUSTOMER_COOKIE_NAME,
  STAFF_COOKIE_NAME,
  resolveCookieName,
} from "../../src/lib/session-cookie";

const STAFF_ORIGIN = "http://localhost:5173";
const CLIENT_ORIGIN = "http://localhost:5174";
const bothCookies = { [STAFF_COOKIE_NAME]: "staff-token", [CUSTOMER_COOKIE_NAME]: "customer-token" };

describe("session cookie resolution", () => {
  it("picks the customer cookie for /api/my routes even with no Origin and a staff cookie present", () => {
    // เคสที่ทำให้เกิด 403 พอดี: เปิด URL ของ PDF ฝั่งลูกค้าในแถบที่อยู่ ขณะที่ล็อกอิน staff-app
    // อยู่ในเบราว์เซอร์เดียวกันด้วย
    expect(resolveCookieName(undefined, bothCookies, "/api/my/quotes/abc/pdf")).toBe(
      CUSTOMER_COOKIE_NAME,
    );
    expect(resolveCookieName(undefined, bothCookies, "/api/my/quotes")).toBe(CUSTOMER_COOKIE_NAME);
    expect(resolveCookieName(undefined, bothCookies, "/api/my/leads")).toBe(CUSTOMER_COOKIE_NAME);
  });

  it("leaves a staff-only caller on the staff session so the refusal stays a 403", () => {
    const staffOnly = { [STAFF_COOKIE_NAME]: "staff-token" };
    expect(resolveCookieName(undefined, staffOnly, "/api/my/quotes")).toBe(STAFF_COOKIE_NAME);
    expect(resolveCookieName(STAFF_ORIGIN, staffOnly, "/api/my/quotes")).toBe(STAFF_COOKIE_NAME);
  });

  it("does not mistake a lookalike path for the customer area", () => {
    expect(resolveCookieName(undefined, bothCookies, "/api/myprojects")).toBe(STAFF_COOKIE_NAME);
    expect(resolveCookieName(undefined, bothCookies, "/api/projects/my/quotes")).toBe(
      STAFF_COOKIE_NAME,
    );
  });

  it("still honours the calling origin for routes that are not audience-specific", () => {
    expect(resolveCookieName(CLIENT_ORIGIN, bothCookies, "/api/auth/me")).toBe(CUSTOMER_COOKIE_NAME);
    expect(resolveCookieName(STAFF_ORIGIN, bothCookies, "/api/auth/me")).toBe(STAFF_COOKIE_NAME);
    expect(resolveCookieName(STAFF_ORIGIN, bothCookies, "/api/projects")).toBe(STAFF_COOKIE_NAME);
  });

  it("falls back to whichever cookie exists when there is no origin and no path hint", () => {
    expect(resolveCookieName(undefined, bothCookies)).toBe(STAFF_COOKIE_NAME);
    expect(resolveCookieName(undefined, { [CUSTOMER_COOKIE_NAME]: "t" })).toBe(CUSTOMER_COOKIE_NAME);
    expect(resolveCookieName(undefined, {})).toBe(CUSTOMER_COOKIE_NAME);
  });

  it("keeps the path rule ahead of a mismatched origin when both cookies exist", () => {
    // แท็บ staff-app ที่ร้องขอพื้นที่ลูกค้าแทนลูกค้าที่ล็อกอินอยู่ ยังคงเลือก session ของลูกค้ารายนั้น
    expect(resolveCookieName(STAFF_ORIGIN, bothCookies, "/api/my/quotes")).toBe(
      CUSTOMER_COOKIE_NAME,
    );
  });
});
