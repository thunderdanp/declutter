-- Feature 1: Personality modes
ALTER TABLE users ADD COLUMN IF NOT EXISTS personality_mode VARCHAR(50) DEFAULT 'balanced';

-- Feature 2: Context-aware recommendations
ALTER TABLE users ADD COLUMN IF NOT EXISTS user_goal VARCHAR(50) DEFAULT 'general';

ALTER TABLE items ADD COLUMN IF NOT EXISTS last_used_timeframe VARCHAR(50);
ALTER TABLE items ADD COLUMN IF NOT EXISTS item_condition VARCHAR(50);
ALTER TABLE items ADD COLUMN IF NOT EXISTS is_sentimental BOOLEAN DEFAULT FALSE;
ALTER TABLE items ADD COLUMN IF NOT EXISTS user_notes TEXT;

-- Feature 3: Learning from user overrides
CREATE TABLE IF NOT EXISTS recommendation_overrides (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  item_category VARCHAR(50),
  ai_suggestion VARCHAR(50) NOT NULL,
  user_choice VARCHAR(50) NOT NULL,
  override_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recommendation_overrides_user_id ON recommendation_overrides(user_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_overrides_item_id ON recommendation_overrides(item_id);
CREATE INDEX IF NOT EXISTS idx_items_last_used ON items(last_used_timeframe);
CREATE INDEX IF NOT EXISTS idx_items_is_sentimental ON items(is_sentimental);
