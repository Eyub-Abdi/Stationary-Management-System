-- Service variants: each service gains priced options (paper sizes like A4/A3).
-- Existing services migrate into a single "Standard" variant carrying the old
-- price, so nothing changes operationally.

-- CreateTable
CREATE TABLE "service_variants" (
    "id" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" "ServiceStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_variants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_variants_serviceId_idx" ON "service_variants"("serviceId");
CREATE INDEX "service_variants_status_idx" ON "service_variants"("status");

-- AddForeignKey
ALTER TABLE "service_variants" ADD CONSTRAINT "service_variants_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: one default variant per existing service, carrying its price/status.
INSERT INTO "service_variants" ("id", "serviceId", "label", "unitPrice", "isDefault", "status", "createdAt", "updatedAt")
SELECT gen_random_uuid(), s."id", 'Standard', s."unitPrice", true, s."status", now(), now()
FROM "services" s;

-- sale_items.serviceVariantId: add nullable, backfill SERVICE lines from each
-- service's default variant. (sale_items is not append-only.)
ALTER TABLE "sale_items" ADD COLUMN "serviceVariantId" UUID;
UPDATE "sale_items" t SET "serviceVariantId" = v."id"
  FROM "service_variants" v
  WHERE v."serviceId" = t."serviceId" AND v."isDefault" = true AND t."serviceId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "sale_items_serviceVariantId_idx" ON "sale_items"("serviceVariantId");

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_serviceVariantId_fkey" FOREIGN KEY ("serviceVariantId") REFERENCES "service_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Drop the column moved to service_variants (after backfill read it).
ALTER TABLE "services" DROP COLUMN "unitPrice";
