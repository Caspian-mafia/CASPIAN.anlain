CREATE TABLE IF NOT EXISTS caspian_rooms (
  code VARCHAR(12) PRIMARY KEY,
  state JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS caspian_rooms_updated_at_idx
  ON caspian_rooms (updated_at DESC);
