CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "auto_policies_client_id_idx" ON "auto_policies" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "auto_policies_policy_number_trgm_idx" ON "auto_policies" USING gin ("policy_number" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "auto_policies_policy_address_trgm_idx" ON "auto_policies" USING gin ("policy_address" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "client_emails_client_id_idx" ON "client_emails" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_emails_email_trgm_idx" ON "client_emails" USING gin ("email" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "client_phones_client_id_idx" ON "client_phones" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_phones_phone_number_trgm_idx" ON "client_phones" USING gin ("phone_number" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "clients_mailing_address_trgm_idx" ON "clients" USING gin ("mailing_address" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "clients_physical_address_trgm_idx" ON "clients" USING gin ("physical_address" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "persons_first_name_trgm_idx" ON "persons" USING gin ("first_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "persons_last_name_trgm_idx" ON "persons" USING gin ("last_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "persons_full_name_trgm_idx" ON "persons" USING gin (("first_name" || ' ' || "last_name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "vehicles_policy_id_idx" ON "vehicles" USING btree ("policy_id");