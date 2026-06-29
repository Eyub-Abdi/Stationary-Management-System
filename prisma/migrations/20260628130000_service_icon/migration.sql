-- Replace the fixed ServiceType enum with a free-form, optional display icon.
-- The name becomes the only categorical field; the icon is cosmetic.

-- Add the optional icon column.
ALTER TABLE "services" ADD COLUMN "icon" TEXT;

-- Backfill icons from the previous service type so existing services keep their look.
UPDATE "services" SET "icon" = CASE "type"
  WHEN 'PRINTING_BW' THEN 'print'
  WHEN 'PRINTING_COLOR' THEN 'print'
  WHEN 'PHOTOCOPY_BW' THEN 'content_copy'
  WHEN 'PHOTOCOPY_COLOR' THEN 'content_copy'
  WHEN 'SCANNING' THEN 'scanner'
  WHEN 'LAMINATION' THEN 'note_stack'
  WHEN 'TYPING' THEN 'keyboard'
  ELSE NULL
END;

-- Drop the old type column and its now-unused enum.
ALTER TABLE "services" DROP COLUMN "type";
DROP TYPE "ServiceType";
