-- Opening stock: the shelf as it stood the day the shop started using the
-- system.
--
-- Until now there was no way to say that. Setting a shop up meant either a
-- purchase — which takes the money out of today's till, leaving the drawer
-- expecting a balance tens of millions in the negative — or a positive stock
-- adjustment, which the profit figures read as the opposite of wastage and so
-- booked as pure profit. Both are wrong for the same reason: opening stock
-- carries a real FIFO cost, but no money moved today and nothing was lost.
--
-- It lands as an ordinary adjustment row so the ledger, the audit trail and the
-- FIFO batches all stay in one place; the new reason is what every profit and
-- wastage figure filters on.

ALTER TYPE "StockAdjustmentReason" ADD VALUE IF NOT EXISTS 'OPENING_STOCK';
ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'OPENING';
