-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    is_admin BOOLEAN DEFAULT FALSE,
    is_approved BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- System settings table
CREATE TABLE IF NOT EXISTS system_settings (
    setting_key VARCHAR(100) PRIMARY KEY,
    setting_value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default settings
INSERT INTO system_settings (setting_key, setting_value) VALUES ('registration_mode', 'automatic')
ON CONFLICT (setting_key) DO NOTHING;

-- Personality profiles table
CREATE TABLE IF NOT EXISTS personality_profiles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    profile_data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Items table
CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    location VARCHAR(100),
    category VARCHAR(50),
    image_url VARCHAR(500),
    recommendation VARCHAR(50),
    recommendation_reasoning TEXT,
    answers JSONB,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Email templates table
CREATE TABLE IF NOT EXISTS email_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    subject VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    description VARCHAR(500),
    is_system BOOLEAN DEFAULT FALSE,
    trigger_event VARCHAR(50),
    is_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Announcements table
CREATE TABLE IF NOT EXISTS announcements (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    sent_at TIMESTAMP,
    recipient_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notification preferences table
CREATE TABLE IF NOT EXISTS notification_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    announcements BOOLEAN DEFAULT TRUE,
    account_updates BOOLEAN DEFAULT TRUE,
    item_recommendations BOOLEAN DEFAULT TRUE,
    weekly_digest BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- API usage logs table
CREATE TABLE IF NOT EXISTS api_usage_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    endpoint VARCHAR(100) NOT NULL,
    model VARCHAR(100),
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    estimated_cost DECIMAL(10, 6) DEFAULT 0,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    used_user_key BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for efficient querying of API usage
CREATE INDEX idx_api_usage_logs_user_id ON api_usage_logs(user_id);
CREATE INDEX idx_api_usage_logs_created_at ON api_usage_logs(created_at);
CREATE INDEX idx_api_usage_logs_success ON api_usage_logs(success);

-- Insert default API usage settings
INSERT INTO system_settings (setting_key, setting_value) VALUES
    ('api_monthly_cost_limit', '50.00'),
    ('api_per_user_monthly_limit', '10.00'),
    ('api_alert_threshold_percent', '80'),
    ('api_usage_alerts_enabled', 'true')
ON CONFLICT (setting_key) DO NOTHING;

-- Insert default email templates
INSERT INTO email_templates (name, subject, body, description, is_system, trigger_event, is_enabled) VALUES
('welcome', 'Welcome to Declutter Assistant!', 'Hello {{firstName}},

Welcome to Declutter Assistant! We''re excited to help you organize and simplify your life.

Get started by:
1. Creating your personality profile
2. Adding items to evaluate
3. Following AI-powered recommendations

If you have any questions, feel free to reach out.

Best regards,
The Declutter Team', 'Sent to new users upon registration', true, 'user_registration', true),
('password_reset', 'Reset Your Password', 'Hello {{firstName}},

You requested to reset your password. Click the link below to set a new password:

{{resetLink}}

This link will expire in 1 hour.

If you didn''t request this, please ignore this email.

Best regards,
The Declutter Team', 'Sent when user requests password reset', true, 'password_reset', true),
('announcement', 'Announcement: {{title}}', 'Hello {{firstName}},

{{content}}

Best regards,
The Declutter Team', 'Template for admin announcements', true, 'announcement', true)
ON CONFLICT (name) DO NOTHING;

-- Create indexes for better query performance
CREATE INDEX idx_items_user_id ON items(user_id);
CREATE INDEX idx_items_status ON items(status);
CREATE INDEX idx_items_recommendation ON items(recommendation);
CREATE INDEX idx_personality_profiles_user_id ON personality_profiles(user_id);
CREATE INDEX idx_announcements_created_at ON announcements(created_at);
CREATE INDEX idx_notification_preferences_user_id ON notification_preferences(user_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_system_settings_updated_at BEFORE UPDATE ON system_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_personality_profiles_updated_at BEFORE UPDATE ON personality_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_items_updated_at BEFORE UPDATE ON items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON email_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_announcements_updated_at BEFORE UPDATE ON announcements
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_preferences_updated_at BEFORE UPDATE ON notification_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
