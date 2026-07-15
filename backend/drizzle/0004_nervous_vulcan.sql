ALTER TABLE "vehicles" DROP CONSTRAINT "vehicles_vin_unique";--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_policy_id_vin_unique" UNIQUE("policy_id","vin");