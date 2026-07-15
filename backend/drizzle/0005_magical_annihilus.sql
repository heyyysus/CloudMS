ALTER TABLE "auto_policies" ADD COLUMN "policy_address1" text;--> statement-breakpoint
ALTER TABLE "auto_policies" ADD COLUMN "policy_address2" text;--> statement-breakpoint
ALTER TABLE "auto_policies" ADD COLUMN "policy_city" varchar(100);--> statement-breakpoint
ALTER TABLE "auto_policies" ADD COLUMN "policy_state" varchar(2);--> statement-breakpoint
ALTER TABLE "auto_policies" ADD COLUMN "policy_zip" varchar(10);--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "mailing_address1" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "mailing_address2" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "mailing_city" varchar(100);--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "mailing_state" varchar(2);--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "mailing_zip" varchar(10);--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "physical_address1" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "physical_address2" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "physical_city" varchar(100);--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "physical_state" varchar(2);--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "physical_zip" varchar(10);--> statement-breakpoint
CREATE INDEX "auto_policies_policy_addr_trgm_idx" ON "auto_policies" USING gin ((coalesce("policy_address1", '') || ' ' || coalesce("policy_address2", '') || ' ' || coalesce("policy_city", '') || ' ' || coalesce("policy_state", '') || ' ' || coalesce("policy_zip", '')) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "clients_mailing_addr_trgm_idx" ON "clients" USING gin ((coalesce("mailing_address1", '') || ' ' || coalesce("mailing_address2", '') || ' ' || coalesce("mailing_city", '') || ' ' || coalesce("mailing_state", '') || ' ' || coalesce("mailing_zip", '')) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "clients_physical_addr_trgm_idx" ON "clients" USING gin ((coalesce("physical_address1", '') || ' ' || coalesce("physical_address2", '') || ' ' || coalesce("physical_city", '') || ' ' || coalesce("physical_state", '') || ' ' || coalesce("physical_zip", '')) gin_trgm_ops);