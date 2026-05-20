-- Enable PostGIS extension for geometry support
CREATE EXTENSION IF NOT EXISTS postgis;

-- CreateEnum GlobalRole
CREATE TYPE "GlobalRole" AS ENUM ('USER', 'SUPER_ADMIN');

-- CreateEnum NetworkRole
CREATE TYPE "NetworkRole" AS ENUM ('STUDENT', 'ALUMNI', 'FACULTY', 'ADMIN');

-- CreateEnum MemberStatus
CREATE TYPE "MemberStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED');

-- CreateEnum VerificationMethod
CREATE TYPE "VerificationMethod" AS ENUM ('ENTRY_NUMBER', 'DOCUMENT_UPLOAD');

-- CreateEnum ContentType
CREATE TYPE "ContentType" AS ENUM ('SOCIAL_POST', 'ANNOUNCEMENT', 'PDF_NOTICE', 'NEWSLETTER', 'EVENT', 'JOB');

-- CreateEnum ContentVisibility
CREATE TYPE "ContentVisibility" AS ENUM ('PUBLIC', 'NETWORK', 'GROUP');

-- CreateEnum MediaType
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum ConnectionStatus
CREATE TYPE "ConnectionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateEnum ConvRole
CREATE TYPE "ConvRole" AS ENUM ('MEMBER', 'ADMIN');

-- CreateEnum GroupRole
CREATE TYPE "GroupRole" AS ENUM ('MEMBER', 'MODERATOR', 'ADMIN');

-- CreateEnum NotificationType
CREATE TYPE "NotificationType" AS ENUM ('CONNECTION_REQUEST', 'CONNECTION_ACCEPTED', 'POST_LIKED', 'POST_COMMENTED', 'POST_MENTIONED', 'GROUP_ADDED', 'NEW_MESSAGE', 'ACCOUNT_VERIFIED', 'ACCOUNT_REJECTED', 'ANNOUNCEMENT', 'NEWSLETTER');

-- CreateEnum NotificationChannel
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'PUSH', 'EMAIL');

-- CreateTable User
CREATE TABLE "users" (
    "user_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "global_role" "GlobalRole" NOT NULL DEFAULT 'USER',
    "firebase_uid" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable UserProfile
CREATE TABLE "user_profiles" (
    "user_id" UUID NOT NULL,
    "full_name" TEXT,
    "preferred_name" TEXT,
    "bio" TEXT,
    "gender" TEXT,
    "dob" DATE,
    "avatar_url" TEXT,
    "avatar_url_public" TEXT,
    "updated_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable Network
CREATE TABLE "networks" (
    "network_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "logo_url" TEXT,
    "logo_url_public" TEXT,
    "member_count" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "networks_pkey" PRIMARY KEY ("network_id")
);

-- CreateTable NetworkMember
CREATE TABLE "network_members" (
    "network_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "network_role" "NetworkRole" NOT NULL,
    "member_status" "MemberStatus" NOT NULL DEFAULT 'PENDING',
    "verification_method" "VerificationMethod",
    "verified_at" TIMESTAMP(3) WITH TIME ZONE,
    "verified_by_user_id" UUID,
    "created_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "network_members_pkey" PRIMARY KEY ("network_id","user_id")
);

-- CreateTable VerificationDocument
CREATE TABLE "verification_documents" (
    "doc_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "network_member_network_id" UUID NOT NULL,
    "network_member_user_id" UUID NOT NULL,
    "doc_type" TEXT NOT NULL,
    "doc_url" TEXT NOT NULL,
    "doc_url_public" TEXT,
    "upload_date" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_documents_pkey" PRIMARY KEY ("doc_id")
);

-- CreateTable Content
CREATE TABLE "contents" (
    "content_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "network_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "content_type" "ContentType" NOT NULL,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "visibility" "ContentVisibility" NOT NULL DEFAULT 'NETWORK',
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "like_count" INTEGER NOT NULL DEFAULT 0,
    "comment_count" INTEGER NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contents_pkey" PRIMARY KEY ("content_id")
);

-- CreateTable ContentMedia
CREATE TABLE "content_media" (
    "media_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "content_id" UUID NOT NULL,
    "media_type" "MediaType" NOT NULL,
    "url" TEXT NOT NULL,
    "url_public" TEXT,
    "created_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_media_pkey" PRIMARY KEY ("media_id")
);

-- CreateTable Like
CREATE TABLE "likes" (
    "content_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "likes_pkey" PRIMARY KEY ("content_id","user_id")
);

-- CreateTable Comment
CREATE TABLE "comments" (
    "comment_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "content_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("comment_id")
);

-- CreateTable Connection
CREATE TABLE "connections" (
    "connection_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "requester_id" UUID NOT NULL,
    "receiver_id" UUID NOT NULL,
    "network_id" UUID NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "initiated_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3) WITH TIME ZONE,

    CONSTRAINT "connections_pkey" PRIMARY KEY ("connection_id")
);

-- CreateTable Conversation
CREATE TABLE "conversations" (
    "conv_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT,
    "owner_id" UUID NOT NULL,
    "is_group" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("conv_id")
);

-- CreateTable ConversationMember
CREATE TABLE "conversation_members" (
    "conv_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "conv_role" "ConvRole" NOT NULL DEFAULT 'MEMBER',
    "joined_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_members_pkey" PRIMARY KEY ("conv_id","user_id")
);

-- CreateTable Message
CREATE TABLE "messages" (
    "message_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conv_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("message_id")
);

-- CreateTable Group
CREATE TABLE "groups" (
    "group_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "network_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "icon_url" TEXT,
    "icon_url_public" TEXT,
    "member_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("group_id")
);

-- CreateTable GroupMember
CREATE TABLE "group_members" (
    "group_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "group_role" "GroupRole" NOT NULL DEFAULT 'MEMBER',
    "joined_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_members_pkey" PRIMARY KEY ("group_id","user_id")
);

-- CreateTable Notification
CREATE TABLE "notifications" (
    "notification_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "notification_type" "NotificationType" NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "related_user_id" UUID,
    "related_content_id" UUID,
    "message" TEXT,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("notification_id")
);

-- CreateTable PushToken
CREATE TABLE "push_tokens" (
    "token_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "device_name" TEXT,
    "device_os" TEXT,
    "created_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3) WITH TIME ZONE,

    CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("token_id")
);

-- CreateTable UserLocation
CREATE TABLE "user_locations" (
    "user_id" UUID NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "geom" geometry(Point, 4326),
    "address_text" TEXT,
    "updated_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_locations_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable UserSettings
CREATE TABLE "user_settings" (
    "user_id" UUID NOT NULL,
    "completed_onboarding" BOOLEAN NOT NULL DEFAULT false,
    "agreed_to_tos" BOOLEAN NOT NULL DEFAULT false,
    "accepted_privacy_policy" BOOLEAN NOT NULL DEFAULT false,
    "export_requested_at" TIMESTAMP(3) WITH TIME ZONE,
    "deletion_requested_at" TIMESTAMP(3) WITH TIME ZONE,
    "updated_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_firebase_uid_key" ON "users"("firebase_uid");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "networks_slug_key" ON "networks"("slug");

-- CreateIndex
CREATE INDEX "content_network_id_idx" ON "contents"("network_id");

-- CreateIndex
CREATE INDEX "content_author_id_idx" ON "contents"("author_id");

-- CreateIndex
CREATE INDEX "comment_content_id_idx" ON "comments"("content_id");

-- CreateIndex
CREATE INDEX "message_conv_id_idx" ON "messages"("conv_id");

-- CreateIndex
CREATE INDEX "message_sender_id_idx" ON "messages"("sender_id");

-- CreateIndex
CREATE INDEX "notification_user_id_idx" ON "notifications"("user_id");

-- CreateIndex
CREATE INDEX "push_tokens_user_id_idx" ON "push_tokens"("user_id");

-- CreateIndex
CREATE INDEX "user_locations_geom_gist_idx" ON "user_locations" USING GIST (geom);

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_members" ADD CONSTRAINT "network_members_network_id_fkey" FOREIGN KEY ("network_id") REFERENCES "networks"("network_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_members" ADD CONSTRAINT "network_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_members" ADD CONSTRAINT "network_members_verified_by_user_id_fkey" FOREIGN KEY ("verified_by_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_documents" ADD CONSTRAINT "verification_documents_network_member_network_id_network_member_user_id_fkey" FOREIGN KEY ("network_member_network_id", "network_member_user_id") REFERENCES "network_members"("network_id", "user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contents" ADD CONSTRAINT "contents_network_id_fkey" FOREIGN KEY ("network_id") REFERENCES "networks"("network_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contents" ADD CONSTRAINT "contents_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_media" ADD CONSTRAINT "content_media_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "contents"("content_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "likes" ADD CONSTRAINT "likes_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "contents"("content_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "likes" ADD CONSTRAINT "likes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "contents"("content_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connections" ADD CONSTRAINT "connections_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connections" ADD CONSTRAINT "connections_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connections" ADD CONSTRAINT "connections_network_id_fkey" FOREIGN KEY ("network_id") REFERENCES "networks"("network_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_conv_id_fkey" FOREIGN KEY ("conv_id") REFERENCES "conversations"("conv_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conv_id_fkey" FOREIGN KEY ("conv_id") REFERENCES "conversations"("conv_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_network_id_fkey" FOREIGN KEY ("network_id") REFERENCES "networks"("network_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("group_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_related_user_id_fkey" FOREIGN KEY ("related_user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_related_content_id_fkey" FOREIGN KEY ("related_content_id") REFERENCES "contents"("content_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_locations" ADD CONSTRAINT "user_locations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
