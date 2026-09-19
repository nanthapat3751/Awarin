/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
  setupFiles: ["<rootDir>/tests/setup-env.ts"],
  // ลบโฟลเดอร์ชั่วคราวของไฟล์ทดสอบ/ชุดสำรองทดสอบ (ดู tests/setup-env.ts)
  globalTeardown: "<rootDir>/tests/global-teardown.ts",
  // Integration tests share one real Postgres instance (no per-worker DB isolation).
  // Jest's default parallel workers each open their own Prisma connection pool, which
  // under load exhausts connections / serializes on the DocumentCounter row lock and
  // causes spurious timeouts. Running serially is slower (~39s vs a few seconds) but
  // reliable — correctness matters more than speed for this suite.
  maxWorkers: 1,
};
