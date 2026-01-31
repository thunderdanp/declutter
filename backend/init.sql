-- ============================================================================
-- DECLUTTER ASSISTANT - DATABASE SCHEMA
-- ============================================================================
-- This file contains the complete database schema for the Declutter Assistant
-- application. It creates all necessary tables, indexes, triggers, and seed data.
--
-- Tables:
--   - users: User accounts and authentication
--   - system_settings: Application-wide configuration
--   - personality_profiles: User decluttering personality preferences
--   - items: Items being evaluated for decluttering
--   - email_templates: Customizable email templates
--   - announcements: Admin announcements to users
--   - notification_preferences: User notification settings
--   - household_members: Family/household member tracking
--   - item_members: Links items to household members (ownership)
--   - categories: Item categorization
--   - api_usage_logs: AI API usage tracking and cost monitoring
--
-- ============================================================================

-- ============================================================================
-- USERS TABLE
-- ============================================================================
-- Stores user account information including authentication credentials,
-- profile data, and admin status.
--
-- Columns:
--   id: Primary key
--   email: Unique email address for login
--   password_hash: bcrypt hashed password
--   first_name, last_name: User's name
--   is_admin: Whether user has admin privileges
--   is_approved: Whether user can access the app (for approval-based registration)
--   anthropic_api_key: User's own API key for AI features (optional)
--   image_analysis_enabled: Whether AI image analysis is enabled for this user
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    is_admin BOOLEAN DEFAULT FALSE,
    is_approved BOOLEAN DEFAULT TRUE,
    anthropic_api_key TEXT,
    image_analysis_enabled BOOLEAN DEFAULT TRUE,
    llm_provider VARCHAR(50) DEFAULT 'anthropic',
    llm_api_key TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- SYSTEM SETTINGS TABLE
-- ============================================================================
-- Key-value store for application-wide settings. Values are stored as JSON
-- strings to support complex configuration objects.
--
-- Current settings:
--   - registration_mode: 'automatic' or 'approval' (admin must approve new users)
--   - recommendation_weights: Scoring weights for the recommendation engine
--   - recommendation_thresholds: Decision thresholds and tie-break rules
--   - recommendation_strategies: A/B testing and strategy configurations
-- ============================================================================
CREATE TABLE IF NOT EXISTS system_settings (
    setting_key VARCHAR(100) PRIMARY KEY,
    setting_value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Default registration mode
INSERT INTO system_settings (setting_key, setting_value) VALUES ('registration_mode', 'automatic')
ON CONFLICT (setting_key) DO NOTHING;

-- ============================================================================
-- RECOMMENDATION ENGINE SETTINGS
-- ============================================================================
-- These settings control how the recommendation engine scores items.
--
-- Weights: Maps user answers to recommendation scores
--   - Each answer (yes/no/rarely, high/medium/low, etc.) adds points to
--     different recommendation types (keep, sell, donate, discard, etc.)
--
-- Thresholds: Controls decision-making
--   - minimumScoreDifference: How much higher the top score must be
--   - tieBreakOrder: Order of preference when scores are tied
--
-- Strategies: Different recommendation approaches
--   - balanced: Equal weight to all factors
--   - minimalist: Favors letting go of items
--   - sentimental: Prioritizes emotional attachment
--   - practical: Focuses on usage and condition
--   - financial: Maximizes monetary value recovery
-- ============================================================================
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

-- LLM provider settings
INSERT INTO system_settings (setting_key, setting_value) VALUES
  ('llm_provider', 'anthropic'),
  ('openai_api_key', ''),
  ('google_api_key', ''),
  ('ollama_base_url', 'http://localhost:11434')
ON CONFLICT (setting_key) DO NOTHING;

-- Email verification setting
INSERT INTO system_settings (setting_key, setting_value) VALUES ('require_email_verification', 'false')
ON CONFLICT (setting_key) DO NOTHING;

-- reCAPTCHA settings
INSERT INTO system_settings (setting_key, setting_value) VALUES
  ('recaptcha_site_key', ''),
  ('recaptcha_secret_key', ''),
  ('recaptcha_project_id', ''),
  ('recaptcha_score_threshold', '0.5')
ON CONFLICT (setting_key) DO NOTHING;

-- AI analysis prompt (empty = use default from code)
INSERT INTO system_settings (setting_key, setting_value) VALUES ('analysis_prompt', '')
ON CONFLICT (setting_key) DO NOTHING;

-- ============================================================================
-- PERSONALITY PROFILES TABLE
-- ============================================================================
-- Stores user personality profiles that influence recommendations.
-- The profile_data JSONB column contains answers to personality questions
-- about attachment style, decision-making preferences, and decluttering goals.
-- ============================================================================
CREATE TABLE IF NOT EXISTS personality_profiles (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    profile_data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- ============================================================================
-- ITEMS TABLE
-- ============================================================================
-- Core table storing items being evaluated for decluttering decisions.
--
-- Columns:
--   id: Primary key
--   user_id: Owner of the item (foreign key to users)
--   name: Item name/title
--   description: Optional detailed description
--   location: Where the item is stored (bedroom, garage, etc.)
--   category: Item category (clothing, electronics, etc.)
--   image_url: Path to uploaded item photo
--   recommendation: AI-generated recommendation (keep/sell/donate/discard/etc.)
--   original_recommendation: Original AI recommendation (before admin changes)
--   recommendation_reasoning: AI explanation for the recommendation
--   decision: User's final decision (what they actually did with the item)
--   answers: JSONB storing user's answers to evaluation questions
--   status: Item status (pending, completed, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS items (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    location VARCHAR(100),
    category VARCHAR(50),
    image_url VARCHAR(500),
    recommendation VARCHAR(50),
    original_recommendation VARCHAR(50),
    recommendation_reasoning TEXT,
    decision VARCHAR(50),
    answers JSONB,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- EMAIL TEMPLATES TABLE
-- ============================================================================
-- Customizable email templates for system communications.
-- Supports variable substitution using {{variableName}} syntax.
--
-- Columns:
--   name: Unique template identifier
--   subject: Email subject line (supports variables)
--   body: Email body content (supports variables)
--   description: Admin-facing description of template purpose
--   is_system: Whether template is system-managed (cannot be deleted)
--   trigger_event: Event that triggers this email (user_registration, etc.)
--   is_enabled: Whether emails using this template should be sent
-- ============================================================================
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

-- ============================================================================
-- ANNOUNCEMENTS TABLE
-- ============================================================================
-- Admin announcements that can be sent to all users via email.
--
-- Columns:
--   title: Announcement headline
--   content: Full announcement text
--   created_by: Admin who created the announcement
--   sent_at: When the announcement was emailed (null if not yet sent)
--   recipient_count: Number of users who received the email
-- ============================================================================
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

-- ============================================================================
-- NOTIFICATION PREFERENCES TABLE
-- ============================================================================
-- Per-user notification settings controlling what emails they receive.
-- ============================================================================
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

-- ============================================================================
-- DEFAULT EMAIL TEMPLATES
-- ============================================================================
-- System email templates with variable placeholders:
--   {{firstName}} - User's first name
--   {{lastName}} - User's last name
--   {{resetLink}} - Password reset URL
--   {{title}} - Announcement title
--   {{content}} - Announcement content
-- ============================================================================
INSERT INTO email_templates (name, subject, body, description, is_system, trigger_event) VALUES
('welcome', 'Welcome to Declutter Assistant!', 'Hello {{firstName}},

Welcome to Declutter Assistant! We''re excited to help you organize and simplify your life.

Get started by:
1. Creating your personality profile
2. Adding items to evaluate
3. Following AI-powered recommendations

If you have any questions, feel free to reach out.

Best regards,
The Declutter Team', 'Sent to new users upon registration', true, 'welcome'),
('password_reset', 'Reset Your Password', 'Hello {{firstName}},

You requested to reset your password. Click the link below to set a new password:

{{resetLink}}

This link will expire in 1 hour.

If you didn''t request this, please ignore this email.

Best regards,
The Declutter Team', 'Sent when user requests password reset', true, 'password_reset'),
('announcement', 'Announcement: {{title}}', 'Hello {{firstName}},

{{content}}

Best regards,
The Declutter Team', 'Template for admin announcements', true, 'announcement'),
('email_verification', 'Verify Your Email Address', 'Hello {{firstName}},

Thank you for registering with Declutter Assistant! Please verify your email address by clicking the link below:

{{verificationLink}}

This link will expire in 24 hours.

If you didn''t create an account, please ignore this email.

Best regards,
The Declutter Team', 'Sent when user registers to verify email address', true, 'email_verification'),
('account_approved', 'Your Account Has Been Approved!', 'Hello {{firstName}},

Great news! Your Declutter Assistant account has been approved. You can now log in and start organizing your life.

Get started by:
1. Creating your personality profile
2. Adding items to evaluate
3. Following AI-powered recommendations

Best regards,
The Declutter Team', 'Sent when an admin approves a user account', true, 'account_approved')
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- HOUSEHOLD MEMBERS TABLE
-- ============================================================================
-- Tracks household/family members for item ownership attribution.
-- Items can be associated with one or more household members.
-- ============================================================================
CREATE TABLE IF NOT EXISTS household_members (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    relationship VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- ITEM MEMBERS JUNCTION TABLE
-- ============================================================================
-- Many-to-many relationship between items and household members.
-- Allows tracking which household members own/use each item.
-- ============================================================================
CREATE TABLE IF NOT EXISTS item_members (
    id SERIAL PRIMARY KEY,
    item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
    member_id INTEGER REFERENCES household_members(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(item_id, member_id)
);

-- ============================================================================
-- CATEGORIES TABLE
-- ============================================================================
-- Item categories for organizing and filtering items.
-- Categories have display properties (icon, color) and can be customized.
--
-- Columns:
--   name: Internal category name
--   slug: URL-friendly identifier
--   display_name: User-facing name
--   icon: Emoji or icon identifier
--   color: Hex color code for UI
--   sort_order: Display order in lists
--   is_default: Whether this is the fallback category
-- ============================================================================
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

-- Default categories
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

-- ============================================================================
-- API USAGE LOGS TABLE
-- ============================================================================
-- Tracks usage of AI APIs (Anthropic Claude) for cost monitoring and analytics.
--
-- Columns:
--   user_id: User who made the API call
--   endpoint: API endpoint called (e.g., 'image_analysis')
--   model: AI model used (e.g., 'claude-3-sonnet')
--   input_tokens: Number of input tokens consumed
--   output_tokens: Number of output tokens generated
--   estimated_cost: Calculated cost in USD
--   success: Whether the API call succeeded
--   error_message: Error details if call failed
--   used_user_key: Whether user's own API key was used
-- ============================================================================
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
    provider VARCHAR(50) DEFAULT 'anthropic',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- ACTIVITY LOGS TABLE
-- ============================================================================
-- Comprehensive audit trail for tracking all system activities.
-- Used for security monitoring, debugging, and compliance.
--
-- Activity Types:
--   USER: login, logout, password_change, profile_update, register
--   ITEM: create, update, delete, decision_recorded
--   ADMIN: user_approved, user_deleted, settings_changed, announcement_sent,
--          category_created, category_updated, category_deleted,
--          template_updated, recommendation_settings_changed
--   SYSTEM: login_failed, api_error, permission_denied
--
-- Columns:
--   user_id: User who performed the action (null for system events)
--   action: The action performed (e.g., 'login', 'item_create')
--   action_type: Category of action (USER, ITEM, ADMIN, SYSTEM)
--   resource_type: Type of resource affected (user, item, setting, etc.)
--   resource_id: ID of the affected resource
--   details: JSON object with additional context
--   ip_address: Client IP address
--   user_agent: Client browser/app info
-- ============================================================================
CREATE TABLE IF NOT EXISTS activity_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    action_type VARCHAR(20) NOT NULL,
    resource_type VARCHAR(50),
    resource_id INTEGER,
    details JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- INDEXES
-- ============================================================================
-- Performance indexes for common query patterns
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_sort_order ON categories(sort_order);
CREATE INDEX idx_items_user_id ON items(user_id);
CREATE INDEX idx_items_status ON items(status);
CREATE INDEX idx_items_recommendation ON items(recommendation);
CREATE INDEX IF NOT EXISTS idx_items_decision ON items(decision);
CREATE INDEX IF NOT EXISTS idx_items_created_at ON items(created_at);
CREATE INDEX IF NOT EXISTS idx_household_members_user_id ON household_members(user_id);
CREATE INDEX IF NOT EXISTS idx_item_members_item_id ON item_members(item_id);
CREATE INDEX IF NOT EXISTS idx_item_members_member_id ON item_members(member_id);
CREATE INDEX idx_personality_profiles_user_id ON personality_profiles(user_id);
CREATE INDEX idx_announcements_created_at ON announcements(created_at);
CREATE INDEX idx_notification_preferences_user_id ON notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_user_id ON api_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_created_at ON api_usage_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action_type ON activity_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_logs_resource ON activity_logs(resource_type, resource_id);

-- ============================================================================
-- TRIGGER FUNCTION
-- ============================================================================
-- Automatically updates the updated_at timestamp when a row is modified
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- ============================================================================
-- TRIGGERS
-- ============================================================================
-- Apply updated_at trigger to all tables with timestamps
-- ============================================================================
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
