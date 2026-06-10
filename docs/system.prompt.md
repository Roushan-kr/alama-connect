# AI Agent Prompting System — Alumni Networking Platform
**Purpose:** Feed these prompts to an agentic AI (Claude, GPT-4, Cursor Agent, etc.) to systematically build the platform phase by phase with minimal errors.

---

## HOW TO USE THIS FILE

1. Always start every session with the **SYSTEM CONTEXT PROMPT** below.
2. Then use the appropriate **PHASE PROMPT** for the current work.
3. After each task completes, update the **ACTIVITY TRACKER** in this file (mark `[x]`).
4. If continuing a previous session, also include the **CONTINUITY BLOCK** at the top of your message.
5. For any new session, paste: SYSTEM CONTEXT + CONTINUITY BLOCK + PHASE PROMPT.

---

## SYSTEM CONTEXT PROMPT
*(Paste this at the start of EVERY session)*

```
You are a senior full-stack engineer building an alumni networking platform for Indian universities. You write production-quality TypeScript/Node.js code. You never guess at implementation details — you follow the architecture document exactly.

STACK:
- Frontend: Next.js 14 (App Router), Tailwind CSS, React Query, Zustand, React Hook Form + Zod
- Backend: Next.js API Routes, Prisma ORM, PostgreSQL + PostGIS
- Cache: Redis (ioredis)
- Background Jobs: Trigger.dev (NOT BullMQ — do not use BullMQ anywhere)
- File Storage: Cloudflare R2 (S3-compatible API via @aws-sdk/client-s3)
- Realtime: Socket.IO with Redis adapter
- Email: nodemailer (or SendGrid) via abstraction layer in src/services/email/
- Push: FCM via abstraction layer in src/services/push/

ARCHITECTURE RULES (follow strictly):
1. Content table uses Single Table Inheritance with a JSONB `meta` column for type-specific fields. Do NOT create separate tables per content type.
2. All background/async work (emails, PDF processing, notifications, cache invalidation) goes into Trigger.dev tasks in src/tasks/. API handlers fire-and-forget these tasks and return immediately.
3. Feed pagination uses KEYSET (cursor-based), NOT LIMIT/OFFSET.
4. File uploads: virus scan FIRST (before R2 upload), then upload, then store R2 path. Never store path before scan passes.
5. Redis cache keys follow pattern: {entity}:{id}:{subkey}. Always include jitter on TTL (±10%).
6. connections table always stores (user_a, user_b) where user_a < user_b lexicographically.
7. Passwords: Argon2id only.
8. JWT: 15-min access token + 30-day refresh in httpOnly cookie.
9. All Zod schemas live in src/modules/{module}/schemas.ts.
10. All Prisma queries use parameterized inputs — never string interpolation in raw queries.
11. Socket.IO uses Redis adapter for multi-instance pub/sub.
12. Message expiry: set expires_at = NOW() + 60 days on insert. Nightly Trigger.dev task soft-deletes expired messages.
13. Network provisioning: CLI scripts only (scripts/cli/). No super-admin UI.
14. Search uses PostgreSQL tsvector with GIN indexes. No Elasticsearch in V1.

FOLDER STRUCTURE:
src/
├── modules/{module}/
│   ├── router.ts       (Next.js API route handlers)
│   ├── service.ts      (business logic)
│   ├── schemas.ts      (Zod validation schemas)
│   └── types.ts        (TypeScript types)
├── services/
│   ├── storage/index.ts   (R2 abstraction)
│   ├── email/index.ts     (email abstraction)
│   └── push/index.ts      (push abstraction)
├── tasks/              (Trigger.dev task definitions)
├── db/schema.prisma    (Prisma schema)
└── config/             (env, constants)

CODING STANDARDS:
- Every function must have TypeScript types (no `any`)
- Every API route must validate input with Zod before touching DB
- Every API route must check auth before any data access
- Error responses must be consistent: { error: string, code: string }
- Success responses: { data: T } or { data: T, meta: PaginationMeta }
- Use async/await, never .then() chains
- Log errors with context (module name, operation, error message)
- Write JSDoc for all exported functions

BEFORE WRITING ANY CODE, state:
1. What you are about to implement
2. Which files you will create or modify
3. Any assumptions you are making
4. Any blockers or questions

Then implement. After implementation, state:
1. What was created/modified
2. How to test it
3. What the next step is
```

---

## CONTINUITY BLOCK
*(Paste at start of new sessions, after System Context)*

```
CURRENT PROJECT STATE:
- Architecture document: alumni-platform-architecture.md (full spec)
- Current phase: [FILL IN: e.g. "Phase 2 — Social Core"]
- Last completed task: [FILL IN: e.g. "Feed API with Redis caching"]
- Completed phases: [FILL IN: e.g. "Phase 1 complete"]
- Known issues/blockers: [FILL IN or write "none"]
- Database migrations run: [FILL IN: e.g. "001_init, 002_content_table"]

Do not re-implement anything already completed. Continue from where we left off.
```

---

## PHASE 1 PROMPT — Foundation
*(Use after System Context. Estimated: 4 weeks)*

```
We are starting Phase 1: Foundation.

GOAL: Working auth, network enrollment, user profiles, and verification pipeline.

Implement in this EXACT order (do not skip ahead):

STEP 1.1 — Project Scaffold
Create the Next.js 14 project with App Router. Install all dependencies:
  prisma, @prisma/client, ioredis, @trigger.dev/sdk, @aws-sdk/client-s3,
  argon2, jsonwebtoken, zod, socket.io, socket.io-adapter-redis, nodemailer,
  react-query, zustand, react-hook-form, tailwindcss, typescript
Set up tsconfig, tailwind config, and .env.example with all required variables.
Create src/config/env.ts that validates env vars with Zod on startup.

STEP 1.2 — Database Schema (Phase 1 tables only)
Write Prisma schema for:
  users, profiles, sessions, networks, network_members, verification_requests, educations
Include all indexes specified in the architecture doc.
Run: npx prisma migrate dev --name init_phase1
Verify migration succeeds before continuing.

STEP 1.3 — CLI Seed Scripts
Create scripts/cli/seed-network.ts and scripts/cli/seed-admin.ts.
seed-network.ts accepts: --name, --code, --domains (comma-separated), --logo
seed-admin.ts accepts: --network-code, --email, --name
Seed admin generates a random 12-char temp password, hashes with Argon2id, emails it to admin.
Both scripts print confirmation with IDs on success.

STEP 1.4 — Auth Module
Implement src/modules/auth/:
  - POST /api/auth/register (create user, send confirmation email via Trigger.dev task)
  - GET  /api/auth/confirm?token=... (verify email)
  - POST /api/auth/login (return access JWT + set refresh cookie)
  - POST /api/auth/refresh (rotate tokens)
  - POST /api/auth/logout (invalidate refresh token)
  - Middleware: src/middleware/requireAuth.ts (validates JWT, attaches user to request)
  - Middleware: src/middleware/requireRole.ts (checks network_members role)

STEP 1.5 — File Upload Service
Implement src/services/storage/index.ts:
  - uploadFile(buffer, key, contentType): Promise<string>
  - getSignedUrl(key, expiresInSeconds): Promise<string>
  - deleteFile(key): Promise<void>
Use @aws-sdk/client-s3 pointing to R2 endpoint.
Implement src/services/storage/virusScan.ts:
  - scanBuffer(buffer): Promise<{ clean: boolean; threat?: string }>
  Stub with: if NODE_ENV=development, always return clean. In prod, integrate ClamAV or VirusTotal API.

STEP 1.6 — Verification Module
Implement src/modules/verification/:
  - POST /api/verification/submit (multipart form: method, optional file, network_id)
    Order: validate input → scan file → upload to R2 → create verification_request row → fire Trigger.dev task
  - GET  /api/admin/verification/pending (list pending requests, admin only)
  - POST /api/admin/verification/:req_id/approve (admin only)
  - POST /api/admin/verification/:req_id/reject (admin only, body: { reason })
Create tasks/notification.tasks.ts with:
  - notifyAdminNewVerification task
  - notifyUserVerificationOutcome task (sends email + in-app notification row)

STEP 1.7 — Profile Module (basic)
Implement src/modules/users/:
  - GET  /api/users/me (own profile)
  - PUT  /api/users/me (update bio, headline, city, etc.)
  - GET  /api/users/:user_id (public profile view, verified users only)

STEP 1.8 — Trigger.dev Setup
Set up Trigger.dev client in src/config/trigger.ts.
Create tasks/email.tasks.ts with:
  - sendConfirmationEmail task
  - sendVerificationOutcomeEmail task
  - sendWelcomeEmail task
Each task: retry maxAttempts: 3, exponential backoff.

MILESTONE CHECK (do not proceed to Phase 2 until all pass):
□ npx prisma migrate status shows no pending migrations
□ POST /api/auth/register creates user and sends email task
□ Admin can run seed-network.ts and seed-admin.ts without errors
□ Admin can list pending verifications and approve/reject
□ Approved user's network_members.status = 'verified'
□ All API routes return { error, code } on failure and { data } on success
□ No any types in TypeScript output
```

---

## PHASE 2 PROMPT — Social Core
*(Use after Phase 1 milestone check passes)*

```
Phase 1 is complete. Starting Phase 2: Social Core.

GOAL: Working global feed, posts, comments, likes, follows, and @mention notifications.

STEP 2.1 — Content Table Migration
Add to Prisma schema: content, post_media, post_likes, post_comments, follows, connection_requests, connections
Content table MUST use JSONB meta column (not individual nullable columns per type).
Add all indexes from architecture doc (idx_content_network_created, idx_content_search GIN, etc.)
Migration name: 002_content_and_social

STEP 2.2 — Feed Module
Implement src/modules/feed/:
  - POST /api/posts (create SOCIAL_POST content row)
    After DB insert, fire Trigger.dev events: feed cache invalidation + mention processing
  - GET  /api/feed/global?cursor=&limit=20 (keyset pagination, Redis cache with DB fallback)
  - GET  /api/feed/user/:user_id?cursor=&limit=20 (posts by specific user)

Feed cache implementation (critical — follow exactly):
  Key: feed:network:{network_id}:{cursor_hash}
  On cache miss: query Postgres, store in Redis with TTL 60s ± 6s jitter
  On cache hit: return immediately
  Cold start: if Redis empty, query Postgres directly (no error, no empty response)

STEP 2.3 — Feed Tasks (Trigger.dev)
Create tasks/feed.tasks.ts:
  - invalidateFeedCache(networkId): deletes feed:network:{networkId}:* keys from Redis
  - processMentions(contentId, bodyText): parse @username, create notification rows, emit socket events
  - processHashtags(contentId, tags): store in meta.tags, update trending cache

STEP 2.4 — Post Media
POST /api/posts should accept optional images (multipart):
  - Scan each image, upload to R2
  - Create post_media rows linked to content_id
  - Return signed preview URLs in feed response

STEP 2.5 — Likes & Comments
  - POST   /api/posts/:content_id/like
  - DELETE /api/posts/:content_id/like
  - POST   /api/posts/:content_id/comments
  - GET    /api/posts/:content_id/comments?cursor=&limit=20
  - DELETE /api/comments/:comment_id (author only)
On like: fire Trigger.dev notification task (notify post author, skip if self-like)

STEP 2.6 — Follow System
  - POST   /api/follow/:user_id
  - DELETE /api/follow/:user_id
  - GET    /api/users/:user_id/followers?cursor=&limit=20
  - GET    /api/users/:user_id/following?cursor=&limit=20

STEP 2.7 — Notification Foundation
Create notifications table migration: 003_notifications
Implement src/modules/notifications/:
  - GET /api/notifications?cursor=&limit=20 (unread first, then read)
  - POST /api/notifications/:notif_id/read
  - POST /api/notifications/read-all
Create tasks/notification.tasks.ts:
  - createInAppNotification(userId, type, relatedId, message, link)
  - Shared helper used by all other tasks that need to notify users

STEP 2.8 — Profile Enhancement
Add to profile:
  - Work experience CRUD: POST/PUT/DELETE /api/users/me/experience
  - Skills: POST/DELETE /api/users/me/skills
  - Education: GET /api/users/me/education (from educations table)

MILESTONE CHECK:
□ POST /api/posts creates content row with correct content_type='SOCIAL_POST'
□ GET /api/feed/global returns items with keyset cursor, no OFFSET in SQL
□ Feed returns data even when Redis cache is empty (cold start)
□ Redis cache is populated after first feed fetch and expires after ~60s
□ Likes/comments work and generate notification rows
□ @mention in post body creates notification for mentioned user
□ Follow/unfollow updates follows table
□ Trigger.dev dashboard shows tasks executing with retries visible
```

---

## PHASE 3 PROMPT — Professional Features
*(Use after Phase 2 milestone check passes)*

```
Phase 2 is complete. Starting Phase 3: Professional Features.
## PHASE 3 PROMPT — Jobs, Groups & Messaging
*(Use after Phase 2 milestone check passes)*

```
Phase 2 is complete. Starting Phase 3: Jobs, Groups & Messaging.

GOAL: Backend APIs, Socket.IO gateway, Trigger.dev cleanups, and Frontend pages for Jobs, Groups, and Chat.

STEP 3.1 — Jobs Module
  - Zod validation schemas in src/modules/jobs/schemas.ts
  - createJob, listJobs, getJob, deleteJob services in src/modules/jobs/service.ts (transaction for content + job rows, soft-delete visibility GROUP)
  - POST/GET/DELETE routes in src/modules/jobs/router.ts

STEP 3.2 — Groups Module
  - CreateGroupSchema, UpdateGroupSchema, InviteMemberSchema in src/modules/groups/schemas.ts
  - createGroup, listGroups, getGroup, joinGroup, inviteMember, removeMember, updateGroup, deleteGroup services in src/modules/groups/service.ts
  - Group routes in src/modules/groups/router.ts
  - Extend global feed endpoints and schemas to support optional group filtering (groupId) and namespace cache keys.

STEP 3.3 — Messaging Module
  - CreateConversationSchema, SendMessageSchema, ListMessagesSchema in src/modules/messaging/schemas.ts
  - getOrCreateConversation, sendMessage, listMessages, listConversations, markRead services in src/modules/messaging/service.ts
  - Messaging routes in src/modules/messaging/router.ts
  - Socket.IO gateway setup in src/socket/index.ts implementing handshake JWT auth, Redis bridge mapping for notifications, and database-driven connection joins.

STEP 3.4 — Nightly Cleanup Task (Trigger.dev)
  - soft-delete expired messages, hard-delete expired jobs, and hard-delete 30-day pending account deletions in src/tasks/cleanup.ts.

STEP 3.5 — Frontend UI Views
  - Jobs board dashboard page with tags/location filters and posting modal.
  - Group catalog dashboard page & group details space page.
  - Direct messaging thread dashboard page.

MILESTONE CHECK:
□ Jobs created with Content and companion tables correctly
□ Groups can be joined or updated by administrators
□ DM threads operate in real-time across Socket.IO
□ Nightly task soft-deletes expired DMs successfully
```

---

## PHASE 4 PROMPT — Real-time Presence, Search & Announcements
*(Use after Phase 3 milestone check passes)*

```
Phase 3 is complete. Starting Phase 4: Real-time Presence, Search & Announcements.

GOAL: Real-time user presence tracking in Redis, Full-Text Search, Admin analytics, Announcements and Newsletters.

STEP 4.1 — Connections & Follows
  - POST/accept/decline connection requests in src/modules/connections/
  - Enforce connections table sorting (userA < userB).

STEP 4.2 — Full-Text Search
  - tsvector columns to profiles and content via GIN index.
  - Update search_vector via Postgres functions and triggers.
  - GET /api/search API endpoint for users/contents.

STEP 4.3 — Socket.IO Presence
  - Redis presence tracking: presence:{userId}:online TTL updates on websocket ping/pong.

STEP 4.4 — Admin Analytics & Announcements
  - GET /api/admin/analytics/overview
  - POST /api/admin/announcements (pins to top, triggers Trigger.dev notifyNetworkAnnouncement)

STEP 4.5 — newsletters
  - POST /api/admin/newsletter (triggers Trigger.dev bulk rate-limited emails)
```

---

## PHASE 5 PROMPT — PDF & Polish
*(Use after Phase 4 milestone check passes)*

```
Phase 4 is complete. Starting Phase 5: PDF & Polish.

GOAL: PDF notices in feed with preview and search, push notifications, mobile UI, performance hardening.

STEP 5.1 — PDF Upload API
  - POST /api/content/pdf (admin/faculty only, multipart: title, file, visibility)
    Order: validate → virus scan → upload to R2 → create content row (type=PDF_NOTICE) →
    fire tasks/pdf.tasks.ts processPdfContent → return 201 with content_id immediately
  Content row created with preview_url=null, search_vector empty.
  These are filled in async by the Trigger.dev task.

STEP 5.2 — PDF Processing Task
Create tasks/pdf.tasks.ts → processPdfContent:
  1. Download file buffer from R2 using storage service
  2. Extract text using pdf-parse (install: npm i pdf-parse @types/pdf-parse)
  3. Generate preview: render first page to JPEG using pdfjs-dist (canvas module)
     Upload preview JPEG to R2 at key: previews/{content_id}.jpg
  4. Update content row:
     - preview_url = signed URL for preview JPEG
     - meta = { ...existing_meta, pdf_text: text.slice(0, 50000), page_count: numpages }
     - search_vector = to_tsvector('english', title || ' ' || text)
  5. Invalidate feed cache for network
  Retry: maxAttempts 3. Log page count and file size on success.

STEP 5.3 — PDF Feed Card
Frontend: create PDFNoticeCard component:
  - Show preview thumbnail (preview_url) or skeleton if still processing (preview_url=null)
  - Show title, page count (from meta), network name
  - "View" button: opens signed URL in new tab
  - "Download" button: triggers download with content-disposition header
  Polling: if preview_url is null, React Query refetches every 5s until populated (max 10 attempts)

STEP 5.4 — Push Notifications
Implement src/services/push/index.ts:
  - sendPush(userId, title, body, link): Promise<void>
  - Internally: look up user's FCM token from user_settings.fcm_token
  - Use Firebase Admin SDK or Expo Push API
Frontend: request notification permission on first login, store FCM token via PUT /api/users/me/fcm-token

Update notification.tasks.ts to call pushService.sendPush when user's push preference is enabled.

STEP 5.5 — Notification Preferences UI
  - GET /api/users/me/notification-prefs
  - PUT /api/users/me/notification-prefs
  Frontend: settings page with toggle matrix (event type × channel)
  Default: all in_app enabled, push enabled, email disabled except account events

STEP 5.6 — Profile Photo Upload
  - POST /api/users/me/avatar (multipart: file)
    Scan → upload to R2 at key: avatars/{user_id}.jpg → update profiles.profile_image → invalidate profile cache
  Frontend: click avatar to upload, show cropper (react-image-crop)

STEP 5.7 — Performance Audit
Run EXPLAIN ANALYZE on:
  - Feed query (content WHERE network_id ORDER BY created_at DESC)
  - Search query (content WHERE search_vector @@ tsquery)
  - Profile fetch query
Document results. Add any missing indexes. Confirm GIN indexes are being hit (not seq scan).
Check Redis memory usage: redis-cli INFO memory

STEP 5.8 — Mobile Responsive Pass
Audit every page for mobile layout issues (viewport < 768px):
  - Navigation: collapsible menu
  - Feed cards: full width, readable text
  - Chat: full-screen on mobile
  - Profile: stacked layout
  - Admin panel: accessible on tablet

MILESTONE CHECK:
□ POST /api/content/pdf returns 201 immediately, before PDF is processed
□ PDF content appears in feed with null preview_url initially, then fills in within ~30s
□ Feed card shows PDF preview thumbnail after processing
□ PDF text is searchable via GET /api/search?type=content&q=<words_from_pdf>
□ Push notification received on device when connection is accepted
□ Profile photo uploads and appears in feed/profile
□ No page shows horizontal scroll on 375px mobile viewport
□ All feed queries use index scans (no seq scan) per EXPLAIN ANALYZE
```

---

## PHASE 6 PROMPT — Launch Hardening
*(Use after Phase 5 milestone check passes)*

```
Phase 5 is complete. Starting Phase 6: Launch Hardening.

GOAL: Security audit, load testing, monitoring, GDPR, go-live readiness.

STEP 6.1 — Security Audit Checklist
For each module, verify:
  □ Input validated with Zod before any DB operation
  □ Auth middleware applied (no unguarded routes)
  □ Role check where admin-only
  □ No raw SQL string interpolation (Prisma params only)
  □ File uploads: magic byte check, not just extension
  □ Signed URLs used for all R2 file access
  □ No sensitive data in API responses (password_hash, session tokens)
  □ CORS headers: allow only app domain
  □ CSP headers set in Next.js middleware

STEP 6.2 — Rate Limiting
Implement Redis-backed rate limiting middleware:
  - Login: 10 attempts / 15 min / IP
  - Register: 5 attempts / hour / IP
  - API general: 100 requests / min / user
  - File upload: 20 uploads / hour / user
  - Admin actions: 200 / min / admin user
Apply middleware in Next.js middleware.ts before route handlers.

STEP 6.3 — Error Monitoring
Integrate Sentry:
  - npm i @sentry/nextjs
  - Capture unhandled errors in API routes
  - Capture Trigger.dev task failures (add Sentry to task error handler)
  - Set environment tag (production/staging)
  - Add user context (user_id) to Sentry scope in auth middleware

STEP 6.4 — Load Testing
Using k6 or Artillery, simulate:
  - 500 concurrent users reading global feed (/api/feed/global)
  - 100 concurrent users posting content
  - 200 concurrent users searching (/api/search?type=users&q=...)
  - 50 concurrent users in chat (Socket.IO connections)
Target: p95 response time < 500ms for feed, < 1s for search.
Document results and fix any bottlenecks before launch.

STEP 6.5 — Backup Strategy
  - Postgres: daily pg_dump to R2 bucket (separate from app bucket)
    Create Trigger.dev scheduled task: backupDatabase, runs at 01:00 daily
  - R2: enable versioning on app bucket
  - Document restore procedure

STEP 6.6 — GDPR / Privacy
  - POST /api/users/me/export-data
    Returns JSON with all user data (profile, posts, connections, messages)
    Runs as Trigger.dev task (async), emails download link when ready
  - DELETE /api/users/me/account (soft delete: anonymize PII, keep content as [deleted])
    Sets user email to deleted+{uuid}@deleted.invalid, clears profile fields
    Hard-delete after 30 days via scheduled Trigger.dev task

STEP 6.7 — Onboarding Flow
Frontend: after first login + verification:
  1. Welcome modal: "Complete your profile"
  2. Prompt: add profile photo, headline, work experience
  3. Suggest 5 people to follow (from same batch/department)
  4. First post prompt: "Share something with your network"
Track onboarding_completed boolean in user_settings.

STEP 6.8 — SEO
For public profile pages (/profile/:user_id):
  - generateMetadata in Next.js App Router returning og:title, og:description, og:image
  - Canonical URL
  - Structured data: Person schema (JSON-LD)
Note: only verified users' profiles are indexable. Pending/unverified: noindex.

LAUNCH READINESS CHECKLIST:
□ All Phase 1–5 milestone checks still pass
□ Security audit: all items checked
□ Rate limiting active on all critical endpoints
□ Sentry integrated and receiving test events
□ Load test: p95 < 500ms for feed under 500 concurrent users
□ Database backup task running and verified restorable
□ Data export and account deletion endpoints working
□ Onboarding flow completes without error for new user
□ Public profile SEO meta tags present
□ Trigger.dev dashboard: zero failed tasks in last 24h (staging)
□ All environment variables documented in .env.example
□ README.md has: setup, seeding, deployment, and runbook instructions
```

---

## TASK-LEVEL MICRO PROMPTS
*(Use these for specific sub-tasks when you need focused implementation)*

### For any new API endpoint:
```
Implement [ENDPOINT_NAME] following these rules:
1. Input schema in schemas.ts using Zod
2. Auth check first (requireAuth middleware)
3. Role check if admin-only (requireRole middleware)
4. Validate input against schema
5. Business logic in service.ts (no DB calls in router.ts)
6. Return { data: result } on success or { error: string, code: string } on failure
7. Fire any Trigger.dev tasks after DB write (fire-and-forget, do not await task result)
8. Add JSDoc comment to service function
Show the complete implementation including schema, router handler, and service function.
```

### For any new Trigger.dev task:
```
Implement Trigger.dev task [TASK_NAME]:
1. Define in src/tasks/[domain].tasks.ts
2. Configure retry: maxAttempts 3, exponential backoff, base 2
3. Strong TypeScript types for payload (no any)
4. Log start, key operations, and completion with relevant IDs
5. All DB operations wrapped in try/catch with specific error logging
6. Any sub-tasks triggered via task.trigger() not direct function calls
7. Add JSDoc describing what the task does and when it runs
```

### For any new database migration:
```
Add the following to Prisma schema and create migration [MIGRATION_NAME]:
[DESCRIBE TABLES/COLUMNS]
Requirements:
- All UUID primary keys use @default(uuid())
- All timestamps use @default(now()) and updatedAt uses @updatedAt
- Explicitly define all indexes (do not rely on Prisma auto-indexing for performance-critical paths)
- Enum values in SCREAMING_SNAKE_CASE
- Foreign keys: define onDelete behavior explicitly (Cascade, Restrict, or SetNull)
After writing the schema, run: npx prisma migrate dev --name [MIGRATION_NAME]
Show the migration SQL output and verify it matches intent.
```

### For debugging a failing test/feature:
```
[DESCRIBE THE PROBLEM]

Debug this systematically:
1. Show the exact error message and stack trace
2. Identify which layer the error is in (DB, service, task, API handler, frontend)
3. Check: is auth middleware passing? Is Zod schema accepting the input? Is the DB query correct?
4. Do NOT guess — check each layer in order
5. Propose one fix at a time, explain why it will solve the issue
6. After fix, state how to verify it works
```

---

## ACTIVITY TRACKER
*(Update this after every completed task. Use [x] for done, [ ] for pending, [~] for in progress)*

### Phase 1 — Foundation
- [x] 1.1 Project scaffold + dependencies
- [x] 1.2 Database schema (Phase 1 tables)
- [x] 1.3 CLI seed scripts
- [x] 1.4 Auth module (register, confirm, login, refresh, logout)
- [x] 1.5 File upload service (R2 + virus scan)
- [x] 1.6 Verification module (submit, admin review)
- [x] 1.7 Basic profile module
- [x] 1.8 Trigger.dev setup + email tasks
- [x] **Phase 1 Milestone Check**

### Phase 2 — Social Core
- [x] 2.1 Content table migration
- [x] 2.2 Feed module (create post, global feed, keyset pagination, cache)
- [x] 2.3 Feed Trigger.dev tasks (invalidation, mention processing, hashtags)
- [x] 2.4 Post media (image upload + attach)
- [x] 2.5 Likes and comments
- [x] 2.6 Follow system
- [x] 2.7 Notification foundation (table + in-app CRUD)
- [x] 2.8 Profile enhancement (work, skills, education)
- [x] **Phase 2 Milestone Check**

### Phase 3 — Jobs, Groups & Messaging
- [x] 3.1 Jobs and Groups schema migrations
- [x] 3.2 Jobs module & dashboard UI (create, list, filter)
- [x] 3.3 Groups module & spaces UI (CRUD, membership, group feeds)
- [x] 3.4 messaging module & chat UI (DMs, Socket.IO gateways, message reads)
- [x] 3.5 Cleanup nightly task (soft/hard deletion schedules)
- [x] **Phase 3 Milestone Check**

### Phase 4 — Real-time Presence, Search & Announcements
- [ ] 4.1 Connections & Follow request handlers
- [ ] 4.2 Full-text search (tsvector columns, triggers, GIN indexing)
- [ ] 4.3 Socket.IO Presence tracking in Redis
- [ ] 4.4 Admin Analytics overview
- [ ] 4.5 Announcements & newsletters (notify tasks)
- [ ] **Phase 4 Milestone Check**

### Phase 5 — PDF & Polish
- [ ] 5.1 PDF upload API
- [ ] 5.2 PDF processing Trigger.dev task
- [ ] 5.3 PDF feed card UI (with polling for preview)
- [ ] 5.4 Push notifications (FCM integration)
- [ ] 5.5 Notification preferences UI
- [ ] 5.6 Profile photo upload
- [ ] 5.7 Performance audit (EXPLAIN ANALYZE, index verification)
- [ ] 5.8 Mobile responsive pass
- [ ] **Phase 5 Milestone Check**

### Phase 6 — Launch Hardening
- [ ] 6.1 Security audit (all modules)
- [ ] 6.2 Rate limiting middleware
- [ ] 6.3 Error monitoring (Sentry)
- [ ] 6.4 Load testing (k6/Artillery)
- [ ] 6.5 Backup strategy (scheduled DB dump task)
- [ ] 6.6 GDPR (data export, account deletion)
- [ ] 6.7 Onboarding flow
- [ ] 6.8 SEO (metadata, JSON-LD)
- [ ] **Launch Readiness Checklist**

### Post-Launch Backlog
- [ ] AI: LinkedIn PDF → profile field extraction
- [ ] Semantic search (pgvector)
- [ ] Geo alumni map (Supercluster)
- [ ] Job matching notifications
- [ ] AI content moderation
- [ ] Mobile app (React Native / Expo)