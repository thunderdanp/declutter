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

-- Recommendation engine settings
INSERT INTO system_settings (setting_key, setting_value) VALUES
('recommendation_weights', '{
  "usage": {"yes": {"keep": 3, "accessible": 2}, "rarely": {"storage": 2, "accessible": 1}, "no": {"donate": 2, "sell": 1, "discard": 1}},
  "sentimental": {"high": {"keep": 3, "storage": 2}, "some": {"keep": 1, "storage": 2}, "none": {"sell": 1, "donate": 1}},
  "condition": {"excellent": {"keep": 1, "sell": 2, "donate": 1}, "good": {"keep": 1, "sell": 2, "donate": 1}, "fair": {"donate": 2, "discard": 1}, "poor": {"discard": 3}},
  "value": {"high": {"keep": 2, "sell": 3}, "medium": {"sell": 2, "donate": 1}, "low": {"donate": 2, "discard": 1}},
  "replaceability": {"difficult": {"keep": 2, "storage": 2}, "moderate": {"storage": 1}, "easy": {"donate": 1, "discard": 1}},
  "space": {"yes": {"keep": 2, "accessible": 3}, "limited": {"storage": 2}, "no": {"storage": 1, "sell": 1, "donate": 1}}
}')
ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO system_settings (setting_key, setting_value) VALUES
('recommendation_thresholds', '{
  "minimumScoreDifference": 2,
  "tieBreakOrder": ["keep", "accessible", "storage", "sell", "donate", "discard"]
}')
ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO system_settings (setting_key, setting_value) VALUES
('recommendation_strategies', '{
  "active": "balanced",
  "abTestEnabled": false,
  "abTestPercentage": 50,
  "strategies": {
    "balanced": {"name": "Balanced", "description": "Equal consideration of all factors", "multipliers": {"usage": 1, "sentimental": 1, "condition": 1, "value": 1, "replaceability": 1, "space": 1}},
    "minimalist": {"name": "Minimalist", "description": "Favors letting go of items", "multipliers": {"usage": 1.5, "sentimental": 0.5, "condition": 1, "value": 0.8, "replaceability": 0.7, "space": 1.5}},
    "sentimental": {"name": "Sentimental", "description": "Prioritizes emotional attachment", "multipliers": {"usage": 0.8, "sentimental": 2, "condition": 0.8, "value": 0.5, "replaceability": 1.5, "space": 0.7}},
    "practical": {"name": "Practical", "description": "Focuses on usage and condition", "multipliers": {"usage": 2, "sentimental": 0.5, "condition": 1.5, "value": 1, "replaceability": 1, "space": 1.2}},
    "financial": {"name": "Financial", "description": "Maximizes monetary value recovery", "multipliers": {"usage": 0.8, "sentimental": 0.5, "condition": 1.5, "value": 2, "replaceability": 0.8, "space": 0.8}}
  }
}')
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

-- API usage logs table
CREATE TABLE IF NOT EXISTS api_usage_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    endpoint VARCHAR(100),
    model VARCHAR(50),
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    estimated_cost DECIMAL(10, 6) DEFAULT 0,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    used_user_key BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_user_id ON api_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_created_at ON api_usage_logs(created_at);

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
