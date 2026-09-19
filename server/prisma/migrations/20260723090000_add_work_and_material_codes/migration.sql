-- Catalog code for priced items, e.g. "MAT-0042".
ALTER TABLE "Material" ADD COLUMN "code" TEXT;

-- Work codes ("B" / "B-02" / "B-02-01") must be unique so they can be printed on a
-- quote as the BOQ item number. NULL is still allowed -- rows created before the
-- backfill (and any the backfill cannot place) simply have no code.
CREATE UNIQUE INDEX "WorkCategory_code_key" ON "WorkCategory"("code");
CREATE UNIQUE INDEX "Material_code_key" ON "Material"("code");
