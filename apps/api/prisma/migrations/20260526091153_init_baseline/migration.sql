-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- CreateEnum
CREATE TYPE "GlobalRole" AS ENUM ('USER', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "NetworkRole" AS ENUM ('STUDENT', 'ALUMNI', 'FACULTY', 'ADMIN');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "VerificationMethod" AS ENUM ('ENTRY_NUMBER', 'DOCUMENT_UPLOAD');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('SOCIAL_POST', 'ANNOUNCEMENT', 'PDF_NOTICE', 'NEWSLETTER', 'EVENT', 'JOB');

-- CreateEnum
CREATE TYPE "ContentVisibility" AS ENUM ('PUBLIC', 'NETWORK', 'GROUP');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "ConvRole" AS ENUM ('MEMBER', 'ADMIN');

-- CreateEnum
CREATE TYPE "GroupRole" AS ENUM ('MEMBER', 'MODERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('CONNECTION_REQUEST', 'CONNECTION_ACCEPTED', 'POST_LIKED', 'POST_COMMENTED', 'POST_MENTIONED', 'GROUP_ADDED', 'NEW_MESSAGE', 'ACCOUNT_VERIFIED', 'ACCOUNT_REJECTED', 'ANNOUNCEMENT', 'NEWSLETTER');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'PUSH', 'EMAIL');

-- CreateTable
CREATE TABLE "users" (
    "user_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "global_role" "GlobalRole" NOT NULL DEFAULT 'USER',
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "user_id" UUID NOT NULL,
    "full_name" TEXT,
    "headline" TEXT,
    "bio" TEXT,
    "country" TEXT,
    "state" TEXT,
    "city" TEXT,
    "locality" TEXT,
    "profile_image" TEXT,
    "linkedin_url" TEXT,
    "public_email" TEXT,
    "search_vector" tsvector,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "session_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "networks" (
    "network_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "logo_url" TEXT,
    "allowed_domains" TEXT[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "networks_pkey" PRIMARY KEY ("network_id")
);

-- CreateTable
CREATE TABLE "network_members" (
    "user_id" UUID NOT NULL,
    "network_id" UUID NOT NULL,
    "role" "NetworkRole" NOT NULL DEFAULT 'STUDENT',
    "status" "MemberStatus" NOT NULL DEFAULT 'PENDING',
    "joined_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "network_members_pkey" PRIMARY KEY ("user_id","network_id")
);

-- CreateTable
CREATE TABLE "verification_requests" (
    "req_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "network_id" UUID NOT NULL,
    "method" "VerificationMethod" NOT NULL,
    "entry_number" TEXT,
    "document_url" TEXT,
    "status" "MemberStatus" NOT NULL DEFAULT 'PENDING',
    "admin_notes" TEXT,
    "submitted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMPTZ,
    "reviewed_by" UUID,

    CONSTRAINT "verification_requests_pkey" PRIMARY KEY ("req_id")
);

-- CreateTable
CREATE TABLE "educations" (
    "edu_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "network_id" UUID NOT NULL,
    "degree" TEXT,
    "field" TEXT,
    "start_year" SMALLINT,
    "end_year" SMALLINT,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "educations_pkey" PRIMARY KEY ("edu_id")
);

-- CreateTable
CREATE TABLE "work_experiences" (
    "exp_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "location" TEXT,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "description" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "work_experiences_pkey" PRIMARY KEY ("exp_id")
);

-- CreateTable
CREATE TABLE "skills" (
    "skill_id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("skill_id")
);

-- CreateTable
CREATE TABLE "user_skills" (
    "user_id" UUID NOT NULL,
    "skill_id" INTEGER NOT NULL,

    CONSTRAINT "user_skills_pkey" PRIMARY KEY ("user_id","skill_id")
);

-- CreateTable
CREATE TABLE "certifications" (
    "cert_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "year" SMALLINT,

    CONSTRAINT "certifications_pkey" PRIMARY KEY ("cert_id")
);

-- CreateTable
CREATE TABLE "content" (
    "content_id" UUID NOT NULL,
    "network_id" UUID NOT NULL,
    "group_id" UUID,
    "content_type" "ContentType" NOT NULL,
    "title" TEXT,
    "body" TEXT,
    "file_url" TEXT,
    "preview_url" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "meta" JSONB NOT NULL DEFAULT '{}',
    "search_vector" tsvector,
    "created_by" UUID NOT NULL,
    "visibility" "ContentVisibility" NOT NULL DEFAULT 'NETWORK',
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "content_pkey" PRIMARY KEY ("content_id")
);

-- CreateTable
CREATE TABLE "post_media" (
    "media_id" UUID NOT NULL,
    "content_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "media_type" "MediaType" NOT NULL,
    "display_order" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_media_pkey" PRIMARY KEY ("media_id")
);

-- CreateTable
CREATE TABLE "post_likes" (
    "user_id" UUID NOT NULL,
    "content_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_likes_pkey" PRIMARY KEY ("user_id","content_id")
);

-- CreateTable
CREATE TABLE "post_comments" (
    "comment_id" UUID NOT NULL,
    "content_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "parent_id" UUID,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "post_comments_pkey" PRIMARY KEY ("comment_id")
);

-- CreateTable
CREATE TABLE "follows" (
    "follower_id" UUID NOT NULL,
    "followee_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follows_pkey" PRIMARY KEY ("follower_id","followee_id")
);

-- CreateTable
CREATE TABLE "connection_requests" (
    "req_id" UUID NOT NULL,
    "from_user" UUID NOT NULL,
    "to_user" UUID NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "connection_requests_pkey" PRIMARY KEY ("req_id")
);

-- CreateTable
CREATE TABLE "connections" (
    "user_a" UUID NOT NULL,
    "user_b" UUID NOT NULL,
    "connected_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "connections_pkey" PRIMARY KEY ("user_a","user_b")
);

-- CreateTable
CREATE TABLE "notifications" (
    "notif_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "network_id" UUID,
    "type" "NotificationType" NOT NULL,
    "related_id" UUID,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "read_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("notif_id")
);

-- CreateTable
CREATE TABLE "notification_prefs" (
    "user_id" UUID NOT NULL,
    "notif_type" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "notification_prefs_pkey" PRIMARY KEY ("user_id","notif_type","channel")
);

-- CreateTable
CREATE TABLE "jobs" (
    "job_id" UUID NOT NULL,
    "content_id" UUID NOT NULL,
    "posted_by" UUID NOT NULL,
    "network_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "apply_link" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expires_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("job_id")
);

-- CreateTable
CREATE TABLE "groups" (
    "group_id" UUID NOT NULL,
    "network_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_private" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("group_id")
);

-- CreateTable
CREATE TABLE "group_members" (
    "group_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "GroupRole" NOT NULL DEFAULT 'MEMBER',
    "joined_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_members_pkey" PRIMARY KEY ("group_id","user_id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "conv_id" UUID NOT NULL,
    "is_group" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("conv_id")
);

-- CreateTable
CREATE TABLE "conversation_members" (
    "conv_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "ConvRole" NOT NULL DEFAULT 'MEMBER',
    "joined_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_members_pkey" PRIMARY KEY ("conv_id","user_id")
);

-- CreateTable
CREATE TABLE "messages" (
    "msg_id" UUID NOT NULL,
    "conv_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "sent_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("msg_id")
);

-- CreateTable
CREATE TABLE "message_reads" (
    "msg_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "read_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_reads_pkey" PRIMARY KEY ("msg_id","user_id")
);

-- CreateTable
CREATE TABLE "user_locations" (
    "user_id" UUID NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "geom" geometry(Point, 4326),
    "address_text" TEXT,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_locations_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "user_settings" (
    "user_id" UUID NOT NULL,
    "fcm_token" TEXT,
    "onboarding_completed" BOOLEAN NOT NULL DEFAULT false,
    "deletion_requested_at" TIMESTAMPTZ,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "profiles_user_id_idx" ON "profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "sessions_token_hash_idx" ON "sessions"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "networks_code_key" ON "networks"("code");

-- CreateIndex
CREATE INDEX "network_members_network_id_status_idx" ON "network_members"("network_id", "status");

-- CreateIndex
CREATE INDEX "verification_requests_network_id_status_idx" ON "verification_requests"("network_id", "status");

-- CreateIndex
CREATE INDEX "verification_requests_user_id_idx" ON "verification_requests"("user_id");

-- CreateIndex
CREATE INDEX "educations_user_id_idx" ON "educations"("user_id");

-- CreateIndex
CREATE INDEX "work_experiences_user_id_idx" ON "work_experiences"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "skills_name_key" ON "skills"("name");

-- CreateIndex
CREATE INDEX "certifications_user_id_idx" ON "certifications"("user_id");

-- CreateIndex
CREATE INDEX "content_network_id_created_at_idx" ON "content"("network_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "content_group_id_created_at_idx" ON "content"("group_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "content_content_type_network_id_idx" ON "content"("content_type", "network_id");

-- CreateIndex
CREATE INDEX "content_tags_idx" ON "content" USING GIN ("tags");

-- CreateIndex
CREATE INDEX "post_media_content_id_idx" ON "post_media"("content_id");

-- CreateIndex
CREATE INDEX "post_likes_content_id_idx" ON "post_likes"("content_id");

-- CreateIndex
CREATE INDEX "post_comments_content_id_idx" ON "post_comments"("content_id");

-- CreateIndex
CREATE INDEX "post_comments_parent_id_idx" ON "post_comments"("parent_id");

-- CreateIndex
CREATE INDEX "follows_followee_id_idx" ON "follows"("followee_id");

-- CreateIndex
CREATE INDEX "connection_requests_to_user_status_idx" ON "connection_requests"("to_user", "status");

-- CreateIndex
CREATE UNIQUE INDEX "connection_requests_from_user_to_user_key" ON "connection_requests"("from_user", "to_user");

-- CreateIndex
CREATE INDEX "connections_user_b_idx" ON "connections"("user_b");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "jobs_content_id_key" ON "jobs"("content_id");

-- CreateIndex
CREATE INDEX "jobs_network_id_expires_at_idx" ON "jobs"("network_id", "expires_at");

-- CreateIndex
CREATE INDEX "jobs_tags_idx" ON "jobs" USING GIN ("tags");

-- CreateIndex
CREATE INDEX "groups_network_id_idx" ON "groups"("network_id");

-- CreateIndex
CREATE INDEX "conversation_members_user_id_idx" ON "conversation_members"("user_id");

-- CreateIndex
CREATE INDEX "messages_conv_id_sent_at_idx" ON "messages"("conv_id", "sent_at" DESC);

-- CreateIndex
CREATE INDEX "messages_expires_at_idx" ON "messages"("expires_at");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_members" ADD CONSTRAINT "network_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_members" ADD CONSTRAINT "network_members_network_id_fkey" FOREIGN KEY ("network_id") REFERENCES "networks"("network_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_network_id_fkey" FOREIGN KEY ("network_id") REFERENCES "networks"("network_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "educations" ADD CONSTRAINT "educations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "educations" ADD CONSTRAINT "educations_network_id_fkey" FOREIGN KEY ("network_id") REFERENCES "networks"("network_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_experiences" ADD CONSTRAINT "work_experiences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("skill_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content" ADD CONSTRAINT "content_network_id_fkey" FOREIGN KEY ("network_id") REFERENCES "networks"("network_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content" ADD CONSTRAINT "content_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("group_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content" ADD CONSTRAINT "content_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "content"("content_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "content"("content_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "content"("content_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "post_comments"("comment_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_followee_id_fkey" FOREIGN KEY ("followee_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connection_requests" ADD CONSTRAINT "connection_requests_from_user_fkey" FOREIGN KEY ("from_user") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connection_requests" ADD CONSTRAINT "connection_requests_to_user_fkey" FOREIGN KEY ("to_user") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connections" ADD CONSTRAINT "connections_user_a_fkey" FOREIGN KEY ("user_a") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connections" ADD CONSTRAINT "connections_user_b_fkey" FOREIGN KEY ("user_b") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_network_id_fkey" FOREIGN KEY ("network_id") REFERENCES "networks"("network_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_prefs" ADD CONSTRAINT "notification_prefs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "content"("content_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_posted_by_fkey" FOREIGN KEY ("posted_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_network_id_fkey" FOREIGN KEY ("network_id") REFERENCES "networks"("network_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_network_id_fkey" FOREIGN KEY ("network_id") REFERENCES "networks"("network_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("group_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_conv_id_fkey" FOREIGN KEY ("conv_id") REFERENCES "conversations"("conv_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conv_id_fkey" FOREIGN KEY ("conv_id") REFERENCES "conversations"("conv_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_reads" ADD CONSTRAINT "message_reads_msg_id_fkey" FOREIGN KEY ("msg_id") REFERENCES "messages"("msg_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_reads" ADD CONSTRAINT "message_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_locations" ADD CONSTRAINT "user_locations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create GIN search indexes for profiles and content search vectors
CREATE INDEX "profiles_search_vector_idx" ON "profiles" USING GIN ("search_vector");
CREATE INDEX "content_search_vector_idx" ON "content" USING GIN ("search_vector");

-- Create function and trigger for profiles search_vector
CREATE OR REPLACE FUNCTION profiles_search_vector_trigger() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    to_tsvector('english', coalesce(NEW.full_name, '')) ||
    to_tsvector('english', coalesce(NEW.headline, '')) ||
    to_tsvector('english', coalesce(NEW.bio, ''));
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_search_vector_update
BEFORE INSERT OR UPDATE ON "profiles"
FOR EACH ROW EXECUTE FUNCTION profiles_search_vector_trigger();

-- Create function and trigger for content search_vector
CREATE OR REPLACE FUNCTION content_search_vector_trigger() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    to_tsvector('english', coalesce(NEW.title, '')) ||
    to_tsvector('english', coalesce(NEW.body, '')) ||
    to_tsvector('english', array_to_string(coalesce(NEW.tags, '{}'), ' '));
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_content_search_vector_update
BEFORE INSERT OR UPDATE ON "content"
FOR EACH ROW EXECUTE FUNCTION content_search_vector_trigger();

-- Sync trigger to keep user_locations.geom synced with user_locations.latitude and longitude
CREATE OR REPLACE FUNCTION sync_user_geom_trigger() RETURNS trigger AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.geom := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  ELSE
    NEW.geom := NULL;
  END IF;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_user_geom
BEFORE INSERT OR UPDATE ON "user_locations"
FOR EACH ROW EXECUTE FUNCTION sync_user_geom_trigger();

