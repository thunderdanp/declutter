ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires TIMESTAMP;
INSERT INTO system_settings (setting_key, setting_value)
VALUES ('require_email_verification', 'false')
ON CONFLICT (setting_key) DO NOTHING;
