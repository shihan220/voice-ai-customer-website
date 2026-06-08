CREATE TABLE IF NOT EXISTS voice_cards (
  id INTEGER PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  script_text TEXT NOT NULL,
  audio_file VARCHAR(255),
  duration DOUBLE PRECISION NOT NULL DEFAULT 4.0,
  wave_seed INTEGER NOT NULL DEFAULT 42,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voice_cards_active_order
  ON voice_cards (is_active, display_order, id);
