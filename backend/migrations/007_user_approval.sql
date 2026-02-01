ALTER TABLE users ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT TRUE;

INSERT INTO email_templates (name, subject, body, description, is_system, trigger_event)
VALUES ('account_approved', 'Your Account Has Been Approved!', 'Hello {{firstName}},

Great news! Your Declutter Assistant account has been approved. You can now log in and start organizing your life.

Get started by:
1. Creating your personality profile
2. Adding items to evaluate
3. Following AI-powered recommendations

Best regards,
The Declutter Team', 'Sent when an admin approves a user account', true, 'account_approved')
ON CONFLICT (name) DO NOTHING;
