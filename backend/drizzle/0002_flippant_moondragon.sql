CREATE TYPE "public"."invoice_item_category" AS ENUM('sweep', 'agency');--> statement-breakpoint
CREATE TYPE "public"."invoice_item_type" AS ENUM('new_business_sweep', 'installment_payment_sweep', 'endorsement_sweep', 'new_business_fee', 'installment_payment_fee', 'endorsement_fee');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('open', 'closed', 'void');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'check', 'credit_card', 'debit_card');--> statement-breakpoint
CREATE TYPE "public"."trust_ledger_direction" AS ENUM('in', 'out');--> statement-breakpoint
CREATE TYPE "public"."trust_ledger_entry_type" AS ENUM('payment_received', 'carrier_sweep', 'agency_fee');--> statement-breakpoint
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
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_policy_id_auto_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."auto_policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_ledger" ADD CONSTRAINT "trust_ledger_policy_id_auto_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."auto_policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_ledger" ADD CONSTRAINT "trust_ledger_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_ledger" ADD CONSTRAINT "trust_ledger_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_ledger" ADD CONSTRAINT "trust_ledger_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_ledger" ADD CONSTRAINT "trust_ledger_invoice_item_id_invoice_items_id_fk" FOREIGN KEY ("invoice_item_id") REFERENCES "public"."invoice_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trust_ledger" ADD CONSTRAINT "trust_ledger_carrier_id_carriers_id_fk" FOREIGN KEY ("carrier_id") REFERENCES "public"."carriers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_items_invoice_id_idx" ON "invoice_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoices_policy_id_idx" ON "invoices" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "invoices_client_id_idx" ON "invoices" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "payments_invoice_id_idx" ON "payments" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "payments_policy_id_idx" ON "payments" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "payments_client_id_idx" ON "payments" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "receipts_invoice_id_idx" ON "receipts" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "receipts_policy_id_idx" ON "receipts" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "receipts_client_id_idx" ON "receipts" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "trust_ledger_policy_id_idx" ON "trust_ledger" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "trust_ledger_client_id_idx" ON "trust_ledger" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "trust_ledger_invoice_id_idx" ON "trust_ledger" USING btree ("invoice_id");