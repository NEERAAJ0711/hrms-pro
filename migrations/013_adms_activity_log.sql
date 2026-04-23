-- Persistent ADMS activity log. Stores key device events (handshakes, ATTLOG
-- pushes, command deliveries, errors) in the DB so they survive server restarts.
-- Replaces the old pure-in-memory log that was wiped on every PM2 restart.
-- Capped at 1 000 rows per device (oldest pruned automatically) to bound storage.
CREATE TABLE IF NOT EXISTS adms_activity_log (
  id          SERIAL PRIMARY KEY,
  device_sn   TEXT        NOT NULL DEFAULT '',
  direction   TEXT        NOT NULL DEFAULT 'IN',  -- IN | OUT
  message     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup for the admin Device Log view (most-recent-first per device).
CREATE INDEX IF NOT EXISTS adms_activity_log_sn_ts
  ON adms_activity_log (device_sn, created_at DESC);
