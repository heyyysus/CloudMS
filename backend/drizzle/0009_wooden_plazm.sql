ALTER TABLE "carriers" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "carriers" ADD COLUMN "phone" varchar(30);--> statement-breakpoint
ALTER TABLE "carriers" ADD COLUMN "email" varchar(255);--> statement-breakpoint
ALTER TABLE "carriers" ADD COLUMN "website" varchar(255);--> statement-breakpoint
ALTER TABLE "carriers" ADD COLUMN "producer_code" varchar(50);--> statement-breakpoint
ALTER TABLE "carriers" ADD COLUMN "notes" text;