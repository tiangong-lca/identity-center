CREATE TABLE "catalog_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"yaml" text NOT NULL,
	"diff" jsonb,
	"applied_by" text NOT NULL,
	"source" text DEFAULT 'cli' NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "catalog_versions_version_unique" UNIQUE("version")
);
