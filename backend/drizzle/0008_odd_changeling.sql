CREATE TABLE "policy_log_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"log_id" integer NOT NULL,
	"attachment_id" integer NOT NULL,
	"linked_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "policy_log_attachments_log_id_attachment_id_unique" UNIQUE("log_id","attachment_id")
);
--> statement-breakpoint
ALTER TABLE "policy_log_attachments" ADD CONSTRAINT "policy_log_attachments_log_id_policy_logs_id_fk" FOREIGN KEY ("log_id") REFERENCES "public"."policy_logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_log_attachments" ADD CONSTRAINT "policy_log_attachments_attachment_id_policy_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."policy_attachments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_log_attachments" ADD CONSTRAINT "policy_log_attachments_linked_by_users_id_fk" FOREIGN KEY ("linked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "policy_log_attachments_log_id_idx" ON "policy_log_attachments" USING btree ("log_id");--> statement-breakpoint
CREATE INDEX "policy_log_attachments_attachment_id_idx" ON "policy_log_attachments" USING btree ("attachment_id");