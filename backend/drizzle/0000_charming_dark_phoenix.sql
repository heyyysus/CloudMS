CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TYPE "public"."attachment_source_type" AS ENUM('upload', 'policy_change', 'invoice', 'receipt');--> statement-breakpoint
CREATE TYPE "public"."driver_rating" AS ENUM('rated', 'excluded');--> statement-breakpoint
CREATE TYPE "public"."email_log_status" AS ENUM('sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('m', 'f', 'other');--> statement-breakpoint
CREATE TYPE "public"."invoice_item_category" AS ENUM('sweep', 'agency');--> statement-breakpoint
CREATE TYPE "public"."invoice_item_type" AS ENUM('new_business_sweep', 'installment_payment_sweep', 'endorsement_sweep', 'new_business_fee', 'installment_payment_fee', 'endorsement_fee');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('open', 'closed', 'void');--> statement-breakpoint
CREATE TYPE "public"."marital_status" AS ENUM('single', 'married', 'divorced', 'widowed', 'separated');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'check', 'credit_card', 'debit_card');--> statement-breakpoint
CREATE TYPE "public"."policy_status" AS ENUM('pending', 'active', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."relation_to_insured" AS ENUM('self', 'spouse', 'child', 'sibling', 'significant-other', 'other-related', 'other');--> statement-breakpoint
CREATE TYPE "public"."trust_ledger_direction" AS ENUM('in', 'out');--> statement-breakpoint
CREATE TYPE "public"."trust_ledger_entry_type" AS ENUM('payment_received', 'carrier_sweep', 'agency_fee');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'staff');--> statement-breakpoint
CREATE TABLE "auto_policies" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"carrier_id" integer NOT NULL,
	"policy_number" varchar(50) NOT NULL,
	"policy_address1" text,
	"policy_address2" text,
	"policy_city" varchar(100),
	"policy_state" varchar(2),
	"policy_zip" varchar(10),
	"effective_date" date NOT NULL,
	"expiration_date" date NOT NULL,
	"status" "policy_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "auto_policies_policy_number_unique" UNIQUE("policy_number")
);
--> statement-breakpoint
CREATE TABLE "carriers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(150) NOT NULL,
	"naic" varchar(10) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"phone" varchar(30),
	"email" varchar(255),
	"website" varchar(255),
	"producer_code" varchar(50),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "carriers_naic_unique" UNIQUE("naic")
);
--> statement-breakpoint
CREATE TABLE "client_emails" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"email" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_phones" (
	"id" serial PRIMARY KEY NOT NULL,
	"client_id" integer NOT NULL,
	"phone_number" varchar(20) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"named_insured_id" integer NOT NULL,
	"second_named_insured_id" integer,
	"mailing_address1" text,
	"mailing_address2" text,
	"mailing_city" varchar(100),
	"mailing_state" varchar(2),
	"mailing_zip" varchar(10),
	"physical_address1" text,
	"physical_address2" text,
	"physical_city" varchar(100),
	"physical_state" varchar(2),
	"physical_zip" varchar(10),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" serial PRIMARY KEY NOT NULL,
	"person_id" integer NOT NULL,
	"dl_number" varchar(50),
	"rating" "driver_rating" DEFAULT 'rated' NOT NULL,
	"sr22" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "drivers_person_id_unique" UNIQUE("person_id")
);
--> statement-breakpoint
CREATE TABLE "email_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipient" varchar(255) NOT NULL,
	"template_key" varchar(64) NOT NULL,
	"subject" text NOT NULL,
	"resend_id" varchar(64),
	"status" "email_log_status" NOT NULL,
	"error" text,
	"triggered_by" integer,
	"sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(64) NOT NULL,
	"subject" varchar(200) NOT NULL,
	"body" text NOT NULL,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_templates_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"category" "invoice_item_category" NOT NULL,
	"type" "invoice_item_type" NOT NULL,
	"carrier_id" integer,
	"description" text,
	"amount" numeric(12, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"policy_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"created_by" integer NOT NULL,
	"status" "invoice_status" DEFAULT 'open' NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"amount_paid" numeric(12, 2) DEFAULT '0' NOT NULL,
	"note" text,
	"voided_at" timestamp,
	"voided_by" integer,
	"void_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"policy_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"method" "payment_method" NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"amount_applied" numeric(12, 2) NOT NULL,
	"change_given" numeric(12, 2) DEFAULT '0' NOT NULL,
	"note" text,
	"created_by" integer NOT NULL,
	"voided_at" timestamp,
	"voided_by" integer,
	"void_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "persons" (
	"id" serial PRIMARY KEY NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"date_of_birth" date NOT NULL,
	"marital_status" "marital_status",
	"gender" "gender" NOT NULL,
	"relation_to_insured" "relation_to_insured" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"policy_id" integer NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"description" text,
	"storage_key" text NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"size_bytes" integer NOT NULL,
	"is_voided" boolean DEFAULT false NOT NULL,
	"source_type" "attachment_source_type" DEFAULT 'upload' NOT NULL,
	"source_id" integer,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "policy_attachments_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "policy_drivers" (
	"id" serial PRIMARY KEY NOT NULL,
	"policy_id" integer NOT NULL,
	"driver_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "policy_drivers_policy_id_driver_id_unique" UNIQUE("policy_id","driver_id")
);
--> statement-breakpoint
CREATE TABLE "policy_log_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"log_id" integer NOT NULL,
	"attachment_id" integer NOT NULL,
	"linked_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "policy_log_attachments_log_id_attachment_id_unique" UNIQUE("log_id","attachment_id")
);
--> statement-breakpoint
CREATE TABLE "policy_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"policy_id" integer NOT NULL,
	"log_number" integer NOT NULL,
	"author_id" integer NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "policy_logs_policy_id_log_number_unique" UNIQUE("policy_id","log_number")
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" serial PRIMARY KEY NOT NULL,
	"payment_id" integer NOT NULL,
	"invoice_id" integer NOT NULL,
	"policy_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"created_by" integer NOT NULL,
	"amount_applied" numeric(12, 2) NOT NULL,
	"change_given" numeric(12, 2) DEFAULT '0' NOT NULL,
	"amount_due_after" numeric(12, 2) NOT NULL,
	"invoice_closed" boolean NOT NULL,
	"note" text,
	"voided_at" timestamp,
	"voided_by" integer,
	"void_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "receipts_payment_id_unique" UNIQUE("payment_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "trust_ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"policy_id" integer NOT NULL,
	"client_id" integer NOT NULL,
	"invoice_id" integer,
	"payment_id" integer,
	"invoice_item_id" integer,
	"carrier_id" integer,
	"entry_type" "trust_ledger_entry_type" NOT NULL,
	"direction" "trust_ledger_direction" NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"reversal_of_id" integer,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(150),
	"google_sub" varchar(64),
	"role" "user_role" DEFAULT 'staff' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_google_sub_unique" UNIQUE("google_sub")
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" serial PRIMARY KEY NOT NULL,
	"policy_id" integer NOT NULL,
	"vin" varchar(17) NOT NULL,
	"make" varchar(100) NOT NULL,
	"model" varchar(100) NOT NULL,
	"year" integer NOT NULL,
	"garaging_zip" varchar(10) NOT NULL,
	"coverage_bi" varchar(50),
	"coverage_pd" varchar(50),
	"coverage_umbi" varchar(50),
	"coverage_umpd" varchar(50),
	"coverage_cdw" varchar(50),
	"coverage_medpay" varchar(50),
	"coverage_coll" varchar(50),
	"coverage_comp" varchar(50),
	"coverage_rental_reimbursement" varchar(50),
	"coverage_towing" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vehicles_policy_id_vin_unique" UNIQUE("policy_id","vin")
);
--> statement-breakpoint
ALTER TABLE "auto_policies" ADD CONSTRAINT "auto_policies_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_policies" ADD CONSTRAINT "auto_policies_carrier_id_carriers_id_fk" FOREIGN KEY ("carrier_id") REFERENCES "public"."carriers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_emails" ADD CONSTRAINT "client_emails_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_phones" ADD CONSTRAINT "client_phones_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_named_insured_id_persons_id_fk" FOREIGN KEY ("named_insured_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_second_named_insured_id_persons_id_fk" FOREIGN KEY ("second_named_insured_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_person_id_persons_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_carrier_id_carriers_id_fk" FOREIGN KEY ("carrier_id") REFERENCES "public"."carriers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_policy_id_auto_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."auto_policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_policy_id_auto_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."auto_policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_attachments" ADD CONSTRAINT "policy_attachments_policy_id_auto_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."auto_policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_attachments" ADD CONSTRAINT "policy_attachments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_drivers" ADD CONSTRAINT "policy_drivers_policy_id_auto_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."auto_policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_drivers" ADD CONSTRAINT "policy_drivers_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_log_attachments" ADD CONSTRAINT "policy_log_attachments_log_id_policy_logs_id_fk" FOREIGN KEY ("log_id") REFERENCES "public"."policy_logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_log_attachments" ADD CONSTRAINT "policy_log_attachments_attachment_id_policy_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."policy_attachments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_log_attachments" ADD CONSTRAINT "policy_log_attachments_linked_by_users_id_fk" FOREIGN KEY ("linked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_logs" ADD CONSTRAINT "policy_logs_policy_id_auto_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."auto_policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_logs" ADD CONSTRAINT "policy_logs_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_policy_id_auto_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."auto_policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_ledger" ADD CONSTRAINT "trust_ledger_policy_id_auto_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."auto_policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_ledger" ADD CONSTRAINT "trust_ledger_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_ledger" ADD CONSTRAINT "trust_ledger_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_ledger" ADD CONSTRAINT "trust_ledger_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_ledger" ADD CONSTRAINT "trust_ledger_invoice_item_id_invoice_items_id_fk" FOREIGN KEY ("invoice_item_id") REFERENCES "public"."invoice_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_ledger" ADD CONSTRAINT "trust_ledger_carrier_id_carriers_id_fk" FOREIGN KEY ("carrier_id") REFERENCES "public"."carriers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_policy_id_auto_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."auto_policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auto_policies_client_id_idx" ON "auto_policies" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "auto_policies_policy_number_trgm_idx" ON "auto_policies" USING gin ("policy_number" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "auto_policies_policy_addr_trgm_idx" ON "auto_policies" USING gin ((coalesce("policy_address1", '') || ' ' || coalesce("policy_address2", '') || ' ' || coalesce("policy_city", '') || ' ' || coalesce("policy_state", '') || ' ' || coalesce("policy_zip", '')) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "client_emails_client_id_idx" ON "client_emails" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_emails_email_trgm_idx" ON "client_emails" USING gin ("email" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "client_phones_client_id_idx" ON "client_phones" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_phones_phone_number_trgm_idx" ON "client_phones" USING gin ("phone_number" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "clients_mailing_addr_trgm_idx" ON "clients" USING gin ((coalesce("mailing_address1", '') || ' ' || coalesce("mailing_address2", '') || ' ' || coalesce("mailing_city", '') || ' ' || coalesce("mailing_state", '') || ' ' || coalesce("mailing_zip", '')) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "clients_physical_addr_trgm_idx" ON "clients" USING gin ((coalesce("physical_address1", '') || ' ' || coalesce("physical_address2", '') || ' ' || coalesce("physical_city", '') || ' ' || coalesce("physical_state", '') || ' ' || coalesce("physical_zip", '')) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "email_log_recipient_idx" ON "email_log" USING btree ("recipient");--> statement-breakpoint
CREATE INDEX "invoice_items_invoice_id_idx" ON "invoice_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoices_policy_id_idx" ON "invoices" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "invoices_client_id_idx" ON "invoices" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "payments_invoice_id_idx" ON "payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "payments_policy_id_idx" ON "payments" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "payments_client_id_idx" ON "payments" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "persons_first_name_trgm_idx" ON "persons" USING gin ("first_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "persons_last_name_trgm_idx" ON "persons" USING gin ("last_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "persons_full_name_trgm_idx" ON "persons" USING gin (("first_name" || ' ' || "last_name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "policy_attachments_policy_id_idx" ON "policy_attachments" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "policy_attachments_source_idx" ON "policy_attachments" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "policy_log_attachments_log_id_idx" ON "policy_log_attachments" USING btree ("log_id");--> statement-breakpoint
CREATE INDEX "policy_log_attachments_attachment_id_idx" ON "policy_log_attachments" USING btree ("attachment_id");--> statement-breakpoint
CREATE INDEX "policy_logs_policy_id_idx" ON "policy_logs" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "receipts_invoice_id_idx" ON "receipts" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "receipts_policy_id_idx" ON "receipts" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "receipts_client_id_idx" ON "receipts" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trust_ledger_policy_id_idx" ON "trust_ledger" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "trust_ledger_client_id_idx" ON "trust_ledger" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "trust_ledger_invoice_id_idx" ON "trust_ledger" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "vehicles_policy_id_idx" ON "vehicles" USING btree ("policy_id");