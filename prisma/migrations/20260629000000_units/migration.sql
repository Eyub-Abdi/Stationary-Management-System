-- Reusable packaging/measure units (pcs, Box, Roll, …) managed like categories
-- and picked when receiving stock by the pack in Purchases.
CREATE TABLE "units" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "units_name_key" ON "units"("name");

-- Seed a few common units so the list isn't empty on first use.
INSERT INTO "units" ("id", "name", "updatedAt") VALUES
  (gen_random_uuid(), 'Box', now()),
  (gen_random_uuid(), 'Roll', now()),
  (gen_random_uuid(), 'Ream', now()),
  (gen_random_uuid(), 'Carton', now()),
  (gen_random_uuid(), 'Packet', now()),
  (gen_random_uuid(), 'Dozen', now())
ON CONFLICT ("name") DO NOTHING;
