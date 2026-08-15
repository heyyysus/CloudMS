-- Seeds the default "welcome" email template. ON CONFLICT DO NOTHING so a
-- re-run (or a deploy where an admin already edited the template) never
-- overwrites their changes - this migration only guarantees the row exists.
INSERT INTO "email_templates" ("key", "subject", "body")
VALUES (
	'welcome',
	'Welcome to CloudMS, {{name}}',
	'Hi {{name}},

{{inviterName}} has invited you to CloudMS as {{role}}.

Sign in with your Google account ({{email}}) at {{appUrl}} - no password needed, access is already set up for this address.'
)
ON CONFLICT ("key") DO NOTHING;
