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
ALTER TABLE "policy_logs" ADD CONSTRAINT "policy_logs_policy_id_auto_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."auto_policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_logs" ADD CONSTRAINT "policy_logs_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "policy_logs_policy_id_idx" ON "policy_logs" USING btree ("policy_id");