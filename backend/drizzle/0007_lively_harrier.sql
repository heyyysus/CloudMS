CREATE TYPE "public"."attachment_source_type" AS ENUM('upload', 'policy_change', 'invoice', 'receipt');--> statement-breakpoint
ALTER TABLE "policy_attachments" ADD COLUMN "is_voided" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "policy_attachments" ADD COLUMN "source_type" "attachment_source_type" DEFAULT 'upload' NOT NULL;--> statement-breakpoint
ALTER TABLE "policy_attachments" ADD COLUMN "source_id" integer;--> statement-breakpoint
CREATE INDEX "policy_attachments_source_idx" ON "policy_attachments" USING btree ("source_type","source_id");