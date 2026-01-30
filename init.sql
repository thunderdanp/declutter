-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    is_admin BOOLEAN DEFAULT FALSE,
    is_approved BOOLEAN DEFAULT TRUE,
    llm_provider VARCHAR(50) DEFAULT 'anthropic',
    llm_api_key TEXT,
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

-- LLM provider settings
INSERT INTO system_settings (setting_key, setting_value) VALUES
  ('llm_provider', 'anthropic'),
  ('openai_api_key', ''),
  ('google_api_key', ''),
  ('ollama_base_url', 'http://localhost:11434')
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

-- Insert default email templates
INSERT INTO email_templates (name, subject, body, description, is_system) VALUES
('welcome', 'Welcome to Declutter Assistant!', 'Hello {{firstName}},

Welcome to Declutter Assistant! We''re excited to help you organize and simplify your life.

Get started by:
1. Creating your personality profile
2. Adding items to evaluate
3. Following AI-powered recommendations

If you have any questions, feel free to reach out.

Best regards,
The Declutter Team', 'Sent to new users upon registration', true),
('password_reset', 'Reset Your Password', 'Hello {{firstName}},

You requested to reset your password. Click the link below to set a new password:

{{resetLink}}

This link will expire in 1 hour.

If you didn''t request this, please ignore this email.

Best regards,
The Declutter Team', 'Sent when user requests password reset', true),
('announcement', 'Announcement: {{title}}', 'Hello {{firstName}},

{{content}}

Best regards,
The Declutter Team', 'Template for admin announcements', true)
ON CONFLICT (name) DO NOTHING;

-- Household members table
CREATE TABLE IF NOT EXISTS household_members (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    relationship VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Item household members junction table
CREATE TABLE IF NOT EXISTS item_members (
    id SERIAL PRIMARY KEY,
    item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
    member_id INTEGER REFERENCES household_members(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(item_id, member_id)
);

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    slug VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    icon VARCHAR(50),
    color VARCHAR(7),
    sort_order INTEGER DEFAULT 0,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed default categories
INSERT INTO categories (name, slug, display_name, icon, color, sort_order, is_default) VALUES
('Clothing', 'clothing', 'Clothing', '👕', '#9C27B0', 1, false),
('Books', 'books', 'Books', '📚', '#795548', 2, false),
('Electronics', 'electronics', 'Electronics', '💻', '#2196F3', 3, false),
('Kitchen', 'kitchen', 'Kitchen Items', '🍳', '#FF9800', 4, false),
('Decor', 'decor', 'Decor', '🖼️', '#E91E63', 5, false),
('Furniture', 'furniture', 'Furniture', '🛋️', '#607D8B', 6, false),
('Toys', 'toys', 'Toys', '🧸', '#FFEB3B', 7, false),
('Tools', 'tools', 'Tools', '🔧', '#9E9E9E', 8, false),
('Other', 'other', 'Other', '📦', '#78909C', 99, true)
ON CONFLICT (slug) DO NOTHING;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_sort_order ON categories(sort_order);
CREATE INDEX idx_items_user_id ON items(user_id);
CREATE INDEX idx_items_status ON items(status);
CREATE INDEX idx_items_recommendation ON items(recommendation);
CREATE INDEX IF NOT EXISTS idx_household_members_user_id ON household_members(user_id);
CREATE INDEX IF NOT EXISTS idx_item_members_item_id ON item_members(item_id);
CREATE INDEX IF NOT EXISTS idx_item_members_member_id ON item_members(member_id);
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

DROP TRIGGER IF EXISTS update_household_members_updated_at ON household_members;
CREATE TRIGGER update_household_members_updated_at BEFORE UPDATE ON household_members
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_categories_updated_at ON categories;
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
