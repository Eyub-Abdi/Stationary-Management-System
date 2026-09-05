-- Let someone from outside the shop borrow, with a member sponsoring them.
-- Both columns are nullable: a null borrowerName keeps the old meaning, that
-- the member on "userId" took the money themselves, so existing loans are
-- unchanged and need no backfill.
ALTER TABLE "loans" ADD COLUMN "borrowerName" TEXT;
ALTER TABLE "loans" ADD COLUMN "borrowerPhone" TEXT;
