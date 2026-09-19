-- Runs once, automatically, only on first container creation (same mechanism as
-- 01-create-runtime-role.sql — never re-runs against an existing volume).
--
-- Creates a second, separate database for the Jest integration test suite. Tests must
-- never run against "systemboq" (the dev/demo database) — earlier they did, because
-- tests/setup-env.ts loaded the same .env as the dev server, and several test suites
-- create real WorkCategory/User rows without cleaning them up in afterAll, silently
-- polluting whatever a person was looking at in the staff-app UI. See README's
-- "ฐานข้อมูลสำหรับทดสอบ (test database)" section.
--
-- CREATE DATABASE cannot run inside a transaction block, hence the \gexec trick instead
-- of a DO $$ ... $$ block (which 01-create-runtime-role.sql uses for the role, since
-- CREATE ROLE has no such restriction).
SELECT 'CREATE DATABASE systemboq_test OWNER boq'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'systemboq_test')\gexec

\c systemboq_test

GRANT CONNECT ON DATABASE systemboq_test TO boq_app;
GRANT USAGE ON SCHEMA public TO boq_app;

-- Same as systemboq: applies to every table a future `prisma migrate deploy` (run as
-- the superuser `boq`, against this database) creates from this point on.
ALTER DEFAULT PRIVILEGES FOR ROLE boq IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO boq_app;
