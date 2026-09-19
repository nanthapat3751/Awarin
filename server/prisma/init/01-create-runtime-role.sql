-- Runs once, automatically, only on first container creation (Postgres's
-- docker-entrypoint-initdb.d mechanism — never re-runs against an existing volume).
--
-- Creates the restricted role the running Express app connects as. It deliberately runs
-- BEFORE any Prisma migration has applied, so it can only set up privileges that don't
-- reference specific tables yet (nothing exists in the schema at this point). The
-- table-specific part — granting on tables that already exist, and revoking
-- UPDATE/DELETE on "AuditLog" specifically for append-only enforcement — happens later,
-- in prisma/seed.ts (which always runs after migrations, so "AuditLog" is guaranteed to
-- exist by then, and re-running it is idempotent/safe for an existing dev DB too).

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'boq_app') THEN
    CREATE ROLE boq_app WITH LOGIN PASSWORD 'boq_app_dev_password';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE systemboq TO boq_app;
GRANT USAGE ON SCHEMA public TO boq_app;

-- Applies to every table a future `prisma migrate` (run as the superuser `boq`) creates
-- from this point on — so newly added tables are usable by the app with no extra step.
ALTER DEFAULT PRIVILEGES FOR ROLE boq IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO boq_app;
