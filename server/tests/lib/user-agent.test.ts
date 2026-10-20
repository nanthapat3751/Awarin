import { describeUserAgent } from "../../src/lib/user-agent";

// สตริงจริงจากเบราว์เซอร์แต่ละตัว — ตัวที่พลาดง่ายคือ Edge/Samsung (มีคำว่า Chrome) และ Chrome (มีคำว่า Safari)
const UA = {
  chromeWin:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  edgeWin:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0",
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  chromeIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0.6613.98 Mobile/15E148 Safari/604.1",
  samsungAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
  chromeAndroidTablet:
    "Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  lineIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.10.0",
  firefoxLinux: "Mozilla/5.0 (X11; Linux x86_64; rv:129.0) Gecko/20100101 Firefox/129.0",
};

describe("describeUserAgent", () => {
  it.each([
    ["chromeWin", "Chrome", "Windows", "desktop"],
    ["edgeWin", "Edge", "Windows", "desktop"],
    ["safariMac", "Safari", "macOS", "desktop"],
    ["safariIphone", "Safari", "iPhone", "mobile"],
    ["chromeIphone", "Chrome", "iPhone", "mobile"],
    ["samsungAndroid", "Samsung Internet", "Android", "mobile"],
    ["chromeAndroidTablet", "Chrome", "Android", "tablet"],
    ["lineIphone", "LINE", "iPhone", "mobile"],
    ["firefoxLinux", "Firefox", "Linux", "desktop"],
  ] as const)("%s → %s · %s (%s)", (key, browser, os, kind) => {
    expect(describeUserAgent(UA[key])).toEqual({ browser, os, kind });
  });

  it("does not guess when there is no user agent", () => {
    expect(describeUserAgent(null)).toEqual({ browser: "ไม่ทราบเบราว์เซอร์", os: "ไม่ทราบระบบ", kind: "desktop" });
  });
});
