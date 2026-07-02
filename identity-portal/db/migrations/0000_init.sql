CREATE TABLE "admin_permissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_permissions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "admin_role_permissions" (
	"admin_role_id" uuid NOT NULL,
	"admin_permission_id" uuid NOT NULL,
	CONSTRAINT "admin_role_permissions_admin_role_id_admin_permission_id_pk" PRIMARY KEY("admin_role_id","admin_permission_id")
);
--> statement-breakpoint
CREATE TABLE "admin_roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"built_in" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_roles_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "admin_user_roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"portal_user_id" uuid NOT NULL,
	"admin_role_id" uuid NOT NULL,
	"scope_type" text DEFAULT 'global' NOT NULL,
	"scope_id" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_assignments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"application_id" uuid NOT NULL,
	"portal_user_id" uuid NOT NULL,
	"keycloak_sub" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"source" text DEFAULT 'admin' NOT NULL,
	"expires_at" timestamp with time zone,
	"projection_status" text DEFAULT 'pending' NOT NULL,
	"last_projection_error" text,
	"projected_at" timestamp with time zone,
	"business_projection_status" text DEFAULT 'pending' NOT NULL,
	"last_business_projection_error" text,
	"business_projected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"application_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_user_roles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"application_id" uuid NOT NULL,
	"application_role_id" uuid NOT NULL,
	"portal_user_id" uuid NOT NULL,
	"keycloak_sub" text NOT NULL,
	"scope_type" text DEFAULT 'global' NOT NULL,
	"scope_id" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"source" text DEFAULT 'admin' NOT NULL,
	"expires_at" timestamp with time zone,
	"projection_status" text DEFAULT 'pending' NOT NULL,
	"last_projection_error" text,
	"projected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"keycloak_client_id" text NOT NULL,
	"access_client_role" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"login_url" text,
	"admin_url" text,
	"webhook_url" text,
	"webhook_secret_ref" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applications_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_keycloak_sub" text NOT NULL,
	"actor_email" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"before_data" jsonb,
	"after_data" jsonb,
	"result" text DEFAULT 'success' NOT NULL,
	"failure_reason" text,
	"ip" text,
	"user_agent" text,
	"request_id" text,
	"trace_id" text,
	"operation_id" text,
	"record_hash" text NOT NULL,
	"previous_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dead_letter_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"event_version" integer DEFAULT 1 NOT NULL,
	"payload" jsonb NOT NULL,
	"consumer" text,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"trace_id" text,
	"operation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"event_version" integer DEFAULT 1 NOT NULL,
	"payload" jsonb NOT NULL,
	"trace_id" text,
	"operation_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processed_events" (
	"event_id" text NOT NULL,
	"consumer" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processed_events_event_id_consumer_pk" PRIMARY KEY("event_id","consumer")
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"application_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_retry_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_app_organization_mappings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"platform_organization_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"business_app_org_id" text NOT NULL,
	"mapping_type" text DEFAULT 'direct' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_organization_members" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"portal_user_id" uuid NOT NULL,
	"member_type" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"joined_at" timestamp with time zone,
	"left_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_organizations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid,
	"parent_id" uuid,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'department' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_organizations_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "platform_tenant_members" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"portal_user_id" uuid NOT NULL,
	"member_type" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_tenants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_tenants_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "portal_users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"keycloak_sub" text NOT NULL,
	"keycloak_user_id" text,
	"email" text NOT NULL,
	"display_name" text,
	"status" text DEFAULT 'active' NOT NULL,
	"sync_status" text DEFAULT 'in_sync' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registration_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"requested_organization_id" uuid,
	"requested_reason" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"approval_required" boolean DEFAULT true NOT NULL,
	"portal_user_id" uuid,
	"keycloak_sub" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_role_permissions" ADD CONSTRAINT "admin_role_permissions_admin_role_id_admin_roles_id_fk" FOREIGN KEY ("admin_role_id") REFERENCES "public"."admin_roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_role_permissions" ADD CONSTRAINT "admin_role_permissions_admin_permission_id_admin_permissions_id_fk" FOREIGN KEY ("admin_permission_id") REFERENCES "public"."admin_permissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_user_roles" ADD CONSTRAINT "admin_user_roles_portal_user_id_portal_users_id_fk" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_user_roles" ADD CONSTRAINT "admin_user_roles_admin_role_id_admin_roles_id_fk" FOREIGN KEY ("admin_role_id") REFERENCES "public"."admin_roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_assignments" ADD CONSTRAINT "application_assignments_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_assignments" ADD CONSTRAINT "application_assignments_portal_user_id_portal_users_id_fk" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_roles" ADD CONSTRAINT "application_roles_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_user_roles" ADD CONSTRAINT "application_user_roles_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_user_roles" ADD CONSTRAINT "application_user_roles_application_role_id_application_roles_id_fk" FOREIGN KEY ("application_role_id") REFERENCES "public"."application_roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_user_roles" ADD CONSTRAINT "application_user_roles_portal_user_id_portal_users_id_fk" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_app_organization_mappings" ADD CONSTRAINT "business_app_organization_mappings_platform_organization_id_platform_organizations_id_fk" FOREIGN KEY ("platform_organization_id") REFERENCES "public"."platform_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_app_organization_mappings" ADD CONSTRAINT "business_app_organization_mappings_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_organization_members" ADD CONSTRAINT "platform_organization_members_organization_id_platform_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."platform_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_organization_members" ADD CONSTRAINT "platform_organization_members_portal_user_id_portal_users_id_fk" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_organizations" ADD CONSTRAINT "platform_organizations_tenant_id_platform_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."platform_tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_organizations" ADD CONSTRAINT "platform_organizations_parent_id_platform_organizations_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."platform_organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_tenant_members" ADD CONSTRAINT "platform_tenant_members_tenant_id_platform_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."platform_tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_tenant_members" ADD CONSTRAINT "platform_tenant_members_portal_user_id_portal_users_id_fk" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_requests" ADD CONSTRAINT "registration_requests_portal_user_id_portal_users_id_fk" FOREIGN KEY ("portal_user_id") REFERENCES "public"."portal_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_user_roles_uq" ON "admin_user_roles" USING btree ("portal_user_id","admin_role_id","scope_type","scope_id");--> statement-breakpoint
CREATE UNIQUE INDEX "application_assignments_uq" ON "application_assignments" USING btree ("application_id","portal_user_id");--> statement-breakpoint
CREATE INDEX "application_assignments_status_idx" ON "application_assignments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "application_assignments_projection_idx" ON "application_assignments" USING btree ("projection_status");--> statement-breakpoint
CREATE UNIQUE INDEX "application_roles_app_code_uq" ON "application_roles" USING btree ("application_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "application_user_roles_uq" ON "application_user_roles" USING btree ("application_id","application_role_id","portal_user_id","scope_type","scope_id");--> statement-breakpoint
CREATE INDEX "application_user_roles_status_idx" ON "application_user_roles" USING btree ("status");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_idx" ON "audit_logs" USING btree ("actor_keycloak_sub");--> statement-breakpoint
CREATE INDEX "audit_logs_target_idx" ON "audit_logs" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "dead_letter_events_created_idx" ON "dead_letter_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "outbox_events_status_created_idx" ON "outbox_events" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_status_retry_idx" ON "webhook_deliveries" USING btree ("status","next_retry_at");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_event_idx" ON "webhook_deliveries" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "business_app_org_mappings_uq" ON "business_app_organization_mappings" USING btree ("platform_organization_id","application_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_organization_members_uq" ON "platform_organization_members" USING btree ("organization_id","portal_user_id");--> statement-breakpoint
CREATE INDEX "platform_organizations_parent_idx" ON "platform_organizations" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_tenant_members_uq" ON "platform_tenant_members" USING btree ("tenant_id","portal_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "portal_users_keycloak_sub_uq" ON "portal_users" USING btree ("keycloak_sub");--> statement-breakpoint
CREATE INDEX "portal_users_email_idx" ON "portal_users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "portal_users_status_idx" ON "portal_users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "registration_requests_status_idx" ON "registration_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "registration_requests_email_idx" ON "registration_requests" USING btree ("email");