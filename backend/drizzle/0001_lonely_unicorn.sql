CREATE TYPE "public"."email_template_kind" AS ENUM('welcome', 'correspondence');--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN "name" varchar(120);--> statement-breakpoint
ALTER TABLE "email_templates" ADD COLUMN "kind" "email_template_kind" DEFAULT 'correspondence' NOT NULL;