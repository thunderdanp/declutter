-- Migration: Multi-LLM Provider Support
-- Adds provider selection and per-provider API keys

-- Add LLM provider columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS llm_provider VARCHAR(50) DEFAULT 'anthropic';
ALTER TABLE users ADD COLUMN IF NOT EXISTS llm_api_key TEXT;

-- Migrate existing anthropic keys to the new llm_api_key column
UPDATE users SET llm_api_key = anthropic_api_key, llm_provider = 'anthropic'
  WHERE anthropic_api_key IS NOT NULL AND llm_api_key IS NULL;

-- Add provider column to api_usage_logs
ALTER TABLE api_usage_logs ADD COLUMN IF NOT EXISTS provider VARCHAR(50) DEFAULT 'anthropic';

-- Add default system settings for LLM providers
INSERT INTO system_settings (setting_key, setting_value) VALUES
  ('llm_provider', 'anthropic'),
  ('openai_api_key', ''),
  ('google_api_key', ''),
  ('ollama_base_url', 'http://localhost:11434')
ON CONFLICT (setting_key) DO NOTHING;
