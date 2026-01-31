UPDATE email_templates SET trigger_event = 'welcome' WHERE name = 'welcome' AND trigger_event IS NULL;
UPDATE email_templates SET trigger_event = 'password_reset' WHERE name = 'password_reset' AND trigger_event IS NULL;
UPDATE email_templates SET trigger_event = 'announcement' WHERE name = 'announcement' AND trigger_event IS NULL;
UPDATE email_templates SET trigger_event = 'email_verification' WHERE name = 'email_verification' AND trigger_event IS NULL;
