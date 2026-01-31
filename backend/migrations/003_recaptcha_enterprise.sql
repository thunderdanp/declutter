INSERT INTO system_settings (setting_key, setting_value) VALUES
  ('recaptcha_project_id', ''),
  ('recaptcha_score_threshold', '0.5')
ON CONFLICT (setting_key) DO NOTHING;
