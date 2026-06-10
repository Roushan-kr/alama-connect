-- DropIndex
DROP INDEX "content_search_vector_idx";

-- DropIndex
DROP INDEX "profiles_search_vector_idx";

-- CreateTable
CREATE TABLE "roster_upload_sessions" (
    "session_id" UUID NOT NULL,
    "network_id" UUID NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "original_name" TEXT NOT NULL,
    "r2_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "merge_summary" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "roster_upload_sessions_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "roster_column_mappings" (
    "mapping_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "excel_header" TEXT NOT NULL,
    "template_var" TEXT NOT NULL,
    "is_core_field" BOOLEAN NOT NULL DEFAULT false,
    "core_field" TEXT,

    CONSTRAINT "roster_column_mappings_pkey" PRIMARY KEY ("mapping_id")
);

-- CreateTable
CREATE TABLE "roster_records" (
    "record_id" UUID NOT NULL,
    "network_id" UUID NOT NULL,
    "entry_number" TEXT NOT NULL,
    "full_name" TEXT,
    "email" TEXT,
    "branch" TEXT,
    "batch" SMALLINT,
    "role" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "removed_from_roster" BOOLEAN NOT NULL DEFAULT false,
    "first_seen_session" UUID,
    "last_seen_session" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "roster_records_pkey" PRIMARY KEY ("record_id")
);

-- CreateTable
CREATE TABLE "email_campaigns" (
    "campaign_id" UUID NOT NULL,
    "network_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body_template" TEXT NOT NULL,
    "filter" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "scheduled_at" TIMESTAMPTZ,
    "send_summary" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "email_campaigns_pkey" PRIMARY KEY ("campaign_id")
);

-- CreateIndex
CREATE INDEX "roster_upload_sessions_network_id_created_at_idx" ON "roster_upload_sessions"("network_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "roster_column_mappings_session_id_excel_header_key" ON "roster_column_mappings"("session_id", "excel_header");

-- CreateIndex
CREATE UNIQUE INDEX "roster_column_mappings_session_id_template_var_key" ON "roster_column_mappings"("session_id", "template_var");

-- CreateIndex
CREATE INDEX "roster_records_network_id_batch_idx" ON "roster_records"("network_id", "batch");

-- CreateIndex
CREATE INDEX "roster_records_network_id_branch_idx" ON "roster_records"("network_id", "branch");

-- CreateIndex
CREATE INDEX "roster_records_network_id_removed_from_roster_idx" ON "roster_records"("network_id", "removed_from_roster");

-- CreateIndex
CREATE INDEX "roster_records_network_id_last_seen_session_idx" ON "roster_records"("network_id", "last_seen_session");

-- CreateIndex
CREATE UNIQUE INDEX "roster_records_network_id_entry_number_key" ON "roster_records"("network_id", "entry_number");

-- CreateIndex
CREATE INDEX "email_campaigns_network_id_status_idx" ON "email_campaigns"("network_id", "status");

-- AddForeignKey
ALTER TABLE "roster_upload_sessions" ADD CONSTRAINT "roster_upload_sessions_network_id_fkey" FOREIGN KEY ("network_id") REFERENCES "networks"("network_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_upload_sessions" ADD CONSTRAINT "roster_upload_sessions_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_column_mappings" ADD CONSTRAINT "roster_column_mappings_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "roster_upload_sessions"("session_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_records" ADD CONSTRAINT "roster_records_network_id_fkey" FOREIGN KEY ("network_id") REFERENCES "networks"("network_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_records" ADD CONSTRAINT "roster_records_first_seen_session_fkey" FOREIGN KEY ("first_seen_session") REFERENCES "roster_upload_sessions"("session_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_network_id_fkey" FOREIGN KEY ("network_id") REFERENCES "networks"("network_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Enable pg_trgm extension if not exists
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create GIN trigram index on roster_records.full_name
CREATE INDEX idx_roster_records_fullname_trgm
  ON roster_records USING GIN (full_name gin_trgm_ops);
