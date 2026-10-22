/**
 * ชุดเดียวกับ jest.config.js แต่ใช้ตอนเก็บ coverage ส่งให้ SonarQube
 *
 * ต่างจากชุดปกติสองข้อ:
 * 1. ปกติ server ใช้ shared-types ที่ build แล้ว (packages/shared-types/dist) — coverage จึงไปตกที่ dist
 *    ซึ่ง SonarQube ไม่ได้สแกน ตรงนี้ชี้ให้เทสต์โหลดจาก src ตรง ๆ แทน coverage ของ shared-types จึงเป็น
 *    ของจริง (โค้ดเดียวกันทุกบรรทัด ต่างกันแค่ไม่ผ่านขั้น build)
 * 2. rootDir เป็นโฟลเดอร์รากของโปรเจกต์ — jest เก็บ coverage เฉพาะไฟล์ใต้ rootDir เท่านั้น
 *    (และ path ในไฟล์ lcov ก็ออกมาเทียบกับรากเหมือนที่ SonarScanner มอง)
 *
 * ใช้งาน (จากโฟลเดอร์ server): npx jest -c jest.coverage.config.js --coverage
 */
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");

/** @type {import('jest').Config} */
module.exports = {
  rootDir: ROOT,
  roots: ["<rootDir>/server/tests"],
  testEnvironment: "node",
  testMatch: ["<rootDir>/server/tests/**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "<rootDir>/server/tsconfig.json" }],
  },
  setupFiles: ["<rootDir>/server/tests/setup-env.ts"],
  globalSetup: "<rootDir>/server/tests/global-setup.ts",
  globalTeardown: "<rootDir>/server/tests/global-teardown.ts",
  maxWorkers: 1,
  moduleNameMapper: {
    "^@systemboq/shared-types$": "<rootDir>/packages/shared-types/src/index.ts",
  },
  collectCoverageFrom: ["server/src/**/*.ts", "packages/shared-types/src/**/*.ts"],
  coverageDirectory: "<rootDir>/server/coverage",
  coverageReporters: ["lcov", "json-summary", "text-summary"],
};
