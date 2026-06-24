-- Append-only ledger enforcement (defense in depth).
-- audit_logs and inventory_movements are written once and never changed.
-- These triggers block UPDATE/DELETE at the database level, so even a bug or a
-- compromised application credential cannot tamper with the financial trail.
--
-- NOTE: cogs_allocations and sale_items are intentionally NOT locked here —
-- partial returns legitimately UPDATE returnedQuantity on those rows.

CREATE OR REPLACE FUNCTION prevent_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only; % is not permitted',
    TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

-- audit_logs: no UPDATE, no DELETE
DROP TRIGGER IF EXISTS audit_logs_no_update ON audit_logs;
CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

DROP TRIGGER IF EXISTS audit_logs_no_delete ON audit_logs;
CREATE TRIGGER audit_logs_no_delete
  BEFORE DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

-- inventory_movements: no UPDATE, no DELETE
DROP TRIGGER IF EXISTS inventory_movements_no_update ON inventory_movements;
CREATE TRIGGER inventory_movements_no_update
  BEFORE UPDATE ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

DROP TRIGGER IF EXISTS inventory_movements_no_delete ON inventory_movements;
CREATE TRIGGER inventory_movements_no_delete
  BEFORE DELETE ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
