INSERT INTO system_settings (setting_key, setting_value)
VALUES ('analysis_prompt', '')
ON CONFLICT (setting_key) DO NOTHING;
