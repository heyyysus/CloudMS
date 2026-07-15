DROP INDEX "auto_policies_policy_address_trgm_idx";--> statement-breakpoint
DROP INDEX "clients_mailing_address_trgm_idx";--> statement-breakpoint
DROP INDEX "clients_physical_address_trgm_idx";--> statement-breakpoint
ALTER TABLE "auto_policies" DROP COLUMN "policy_address";--> statement-breakpoint
ALTER TABLE "clients" DROP COLUMN "mailing_address";--> statement-breakpoint
ALTER TABLE "clients" DROP COLUMN "physical_address";