CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TYPE "public"."driver_rating" AS ENUM('rated', 'excluded');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('m', 'f', 'other');--> statement-breakpoint
CREATE TYPE "public"."marital_status" AS ENUM('single', 'married', 'divorced', 'widowed', 'separated');--> statement-breakpoint
CREATE TYPE "public"."policy_status" AS ENUM('pending', 'active', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."relation_to_insured" AS ENUM('self', 'spouse', 'child', 'sibling', 'significant-other', 'other-related', 'other');--> statement-breakpoint
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
CREATE TABLE "policy_drivers" (
	"id" serial PRIMARY KEY NOT NULL,
	"policy_id" integer NOT NULL,
	"driver_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "policy_drivers_policy_id_driver_id_unique" UNIQUE("policy_id","driver_id")
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
ALTER TABLE "policy_drivers" ADD CONSTRAINT "policy_drivers_policy_id_auto_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."auto_policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_drivers" ADD CONSTRAINT "policy_drivers_driver_id_drivers_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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
CREATE INDEX "persons_first_name_trgm_idx" ON "persons" USING gin ("first_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "persons_last_name_trgm_idx" ON "persons" USING gin ("last_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "persons_full_name_trgm_idx" ON "persons" USING gin (("first_name" || ' ' || "last_name") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "vehicles_policy_id_idx" ON "vehicles" USING btree ("policy_id");