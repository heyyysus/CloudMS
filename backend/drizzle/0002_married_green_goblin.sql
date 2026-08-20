CREATE TYPE "public"."reminder_trigger" AS ENUM('policy_expiration');--> statement-breakpoint
CREATE TYPE "public"."scheduled_email_status" AS ENUM('pending', 'sending', 'sent', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "reminder_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"trigger" "reminder_trigger" NOT NULL,
	"offset_days" integer NOT NULL,
	"template_id" integer NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "reminder_rules_trigger_offset_unique" UNIQUE("trigger","offset_days")
);
--> statement-breakpoint
CREATE TABLE "scheduled_emails" (
	"id" serial PRIMARY KEY NOT NULL,
	"rule_id" integer NOT NULL,
	"policy_id" integer NOT NULL,
	"occurrence_date" date NOT NULL,
	"scheduled_for" timestamp NOT NULL,
	"status" "scheduled_email_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"claimed_at" timestamp,
	"last_error" text,
	"subject" text,
	"resend_id" varchar(64),
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "scheduled_emails_occurrence_unique" UNIQUE("rule_id","policy_id","occurrence_date")
);
--> statement-breakpoint
ALTER TABLE "reminder_rules" ADD CONSTRAINT "reminder_rules_template_id_email_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."email_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_rules" ADD CONSTRAINT "reminder_rules_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_emails" ADD CONSTRAINT "scheduled_emails_rule_id_reminder_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."reminder_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_emails" ADD CONSTRAINT "scheduled_emails_policy_id_auto_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."auto_policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scheduled_emails_due_idx" ON "scheduled_emails" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX "scheduled_emails_policy_id_idx" ON "scheduled_emails" USING btree ("policy_id");