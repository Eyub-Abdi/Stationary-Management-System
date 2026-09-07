-- Opening stock, hidden until it is wanted.
--
-- A shop enters its day-one shelf once, over a few days, and then never again
-- until something like it comes up. Leaving the screen in the sidebar for the
-- rest of the shop's life invites the wrong entry: stock that arrived from a
-- supplier, recorded as though it had always been there, which takes the cost
-- out of every trading figure that should have carried it.
--
-- So it becomes a switch an admin holds. Off here, including for shops already
-- running — they have entered their opening stock — and turned back on from
-- Settings for as long as it is being used.

ALTER TABLE "app_settings"
  ADD COLUMN IF NOT EXISTS "openingStockEnabled" BOOLEAN NOT NULL DEFAULT false;
