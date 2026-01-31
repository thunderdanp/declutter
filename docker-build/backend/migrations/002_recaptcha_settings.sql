INSERT INTO system_settings (setting_key, setting_value) VALUES
  ('recaptcha_site_key', ''),
  ('recaptcha_secret_key', '')
ON CONFLICT (setting_key) DO NOTHING;
