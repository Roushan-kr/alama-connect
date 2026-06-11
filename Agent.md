# AI Agent Context, Learning & Task Tracker (`Agent.md`)

This file is the living context and state repository for the AI coding agent working on the **Alumni Networking Platform** monorepo. It acts as the source of truth for current status, technical rules, gotchas, CLI commands, and active tasks.

> **INSTRUCTION FOR THE AI AGENT:** Read this file at the start of every session. Update this file as you complete tasks, discover learnings, or hit blockers. Do not duplicate information or re-implement completed components.

---

## 📂 Project Structure & Key Files

The project is structured as a `pnpm` monorepo:
* **Backend:** [@alumni/api](file:///d:/PTU/6th-sem/campus_project/apps/api/package.json) (Fastify 5 + TypeScript)
* **Frontend:** [@alumni/web](file:///d:/PTU/6th-sem/campus_project/apps/web/package.json) (Next.js 16 + Tailwind CSS v4)
* **Shared Module:** [@alumni/shared](file:///d:/PTU/6th-sem/campus_project/packages/shared/package.json) (Types, schemas, and common enums)

### Key File Map
* **Database Schema:** [schema.prisma](file:///d:/PTU/6th-sem/campus_project/apps/api/prisma/schema.prisma)
* **Prisma CLI Config:** [prisma.config.ts](file:///d:/PTU/6th-sem/campus_project/apps/api/prisma.config.ts)
* **Outdated Baseline Migration:** [0_init/migration.sql](file:///d:/PTU/6th-sem/campus_project/apps/api/prisma/migrations/0_init/migration.sql) (⚠️ Stale)
* **Fastify Entrypoint:** [index.ts](file:///d:/PTU/6th-sem/campus_project/apps/api/src/index.ts)
* **Fastify App Factory:** [app.ts](file:///d:/PTU/6th-sem/campus_project/apps/api/src/app.ts)
* **API Route Configuration:** [app.ts](file:///d:/PTU/6th-sem/campus_project/apps/api/src/app.ts) (Registers all modules)
* **Environment Validation:** [env.ts](file:///d:/PTU/6th-sem/campus_project/apps/api/src/config/env.ts) (Zod startup check)
* **Zustand Auth Store:** [auth.ts](file:///d:/PTU/6th-sem/campus_project/apps/web/src/store/auth.ts)
* **API Client (Frontend):** [api-client.ts](file:///d:/PTU/6th-sem/campus_project/apps/web/src/lib/api-client.ts)

---

## 🛠️ Technology Stack

| Layer | Technology | Key Details |
| :--- | :--- | :--- |
| **Backend API** | **Fastify 5** | Fast, low-overhead Node.js framework. |
| **ORM** | **Prisma 7.8+** | Managed via [prisma.config.ts](file:///d:/PTU/6th-sem/campus_project/apps/api/prisma.config.ts). `.env` is loaded manually in config. |
| **Database** | **PostgreSQL + PostGIS** | Relational data, full-text search, and spatial coordinates. |
| **Cache & PubSub** | **Redis (ioredis)** | Redis 7+ — Upstash TCP protocol (`rediss://`). |
| **Background Jobs** | **Trigger.dev v4 SDK** | Durable, retryable queues and scheduled runs (No BullMQ allowed). |
| **File Storage** | **Cloudflare R2** | Private uploads and signed URLs (using `@aws-sdk/client-s3`). |
| **Realtime** | **Socket.IO 4** | Real-time chat & notifications with Redis adapter. |
| **Email Service** | **Nodemailer** | Nodemailer fallback to Ethereal dev email when SMTP not set. |
| **Validation** | **Zod 4** | Schemas reside in `src/modules/{module}/schemas.ts` and `@alumni/shared`. |
| **Frontend UI** | **Next.js 16** | App Router, React Query v5, Zustand, React Hook Form. |
| **Styling** | **Tailwind CSS v4** | Modern theme-based styling (Vanilla CSS approach). |

---

## 🚨 Critical Architecture Rules (Never Deviate!)

1. **Unified Content Table (STI):** All feed-like models (`SOCIAL_POST`, `ANNOUNCEMENT`, `PDF_NOTICE`, `NEWSLETTER`, `EVENT`, `JOB`) are stored in the single [content](file:///d:/PTU/6th-sem/campus_project/apps/api/prisma/schema.prisma) table. Type-specific fields are stored in the `meta` JSONB column. Do not create separate tables per content type.
2. **Keyset Cursor Pagination:** All feeds and lists MUST use keyset cursor-based pagination (e.g., querying `createdAt` and `contentId`). Never use `LIMIT`/`OFFSET` on high-throughput queries.
3. **Background Job Offloading:** Heavy/async actions (sending emails, parsing PDFs, compiling newsletters, notifications) must be offloaded to Trigger.dev tasks inside [src/tasks/](file:///d:/PTU/6th-sem/campus_project/apps/api/src/tasks). API route handlers must fire-and-forget these tasks and return a response immediately.
4. **Redis Key Pattern:** Redis keys must follow `{entity}:{id}:{subkey}`. Every TTL set must include a $\pm10\%$ jitter to prevent cache stampedes. Use [jitteredTtl()](file:///d:/PTU/6th-sem/campus_project/apps/api/src/lib/cache.ts).
5. **Connection Table UUID Sorting:** The `connections` table must enforce sorting such that `userA < userB` lexicographically. This constraint must be handled in the service layer before Prisma insert.
6. **Passwords:** Hash passwords only using `Argon2id` (no bcrypt).
7. **Auth Tokens:** 15-minute access JWT returned in JSON response, 30-day refresh token stored in a secure, `httpOnly`, partitioned cookie.
8. **Zod Schema Location:** Input schemas must be defined in `src/modules/{module}/schemas.ts`. Never define schemas directly inside route handlers.
9. **No SQL Interpolation:** Prevent SQL injection by using Prisma parameterized queries or TypedSQL for complex queries.
10. **Socket.IO Auth:** Validate the JWT on handshake connection. Immediately reject the socket connection if the token is invalid or missing.
11. **Message Expiry (60 Days):** Messages must have an `expiresAt = sentAt + 60 days` timestamp. A scheduled nightly task soft-deletes expired records (`isDeleted = true`).
12. **CLI Network Provisioning:** No UI exists for creating university networks or registering network administrators. This is provisioned using scripts [seed-network.ts](file:///d:/PTU/6th-sem/campus_project/apps/api/scripts/cli/seed-network.ts) and [seed-admin.ts](file:///d:/PTU/6th-sem/campus_project/apps/api/scripts/cli/seed-admin.ts).
13. **Search Engine:** Postgres Full-Text Search (`tsvector` + GIN indexes) is used. The `searchVector` columns are updated automatically by database triggers (defined in the manual migration SQL) on record insert or update.
14. **Standard API Response Formats:**
    * **Success:** `{ data: T }` or `{ data: T, meta: PaginationMeta }`
    * **Failure:** `{ error: string, code: string }`
15. **Strict TypeScript:** No `any` type overrides. Always maintain type checks.

---

## 🧠 TypeScript / Import Session Learnings

Keep these guidelines in mind to avoid repeating past development mistakes:
* **Named Redis Import:** Do not use `import Redis from "ioredis"`. Instead, use `import { Redis } from "ioredis"`.
* **Cross-Package Types:** Do not import TypeScript types across package boundaries if they cause rootDir violations. Define local shapes or compile packages as necessary.
* **Exact Optional Properties:** Under `exactOptionalPropertyTypes`, assigning `undefined` to an optional property will trigger compile errors. Use conditional spreads, e.g., `...(val !== undefined ? { field: val } : {})`.
* **Prisma query listener typing:** Cast `$on` explicitly in TS strict mode: `(client.$on as any)("query", callback)`.
* **Fastify Error Handler:** The error parameter in `setErrorHandler` is of type `unknown`. Cast to `{ statusCode?: number; message?: string; code?: string }` before dereferencing properties.

---

## ⚡ PNPM Multi-Package Command Cheatsheet

Use these commands from the monorepo root:

### Development & Builds
* **Start API (Fastify) Dev Server:** `pnpm --filter @alumni/api dev`
* **Start Web (Next.js) Dev Server:** `pnpm --filter @alumni/web dev`
* **Build API Production Dist:** `pnpm --filter @alumni/api build`
* **Build Web Production Bundle:** `pnpm --filter @alumni/web build`
* **Clean Build Artifacts:** `pnpm -r clean`

### Linting & Typechecking
* **Typecheck API Code:** `pnpm --filter @alumni/api typecheck`
* **Typecheck Web Code:** `pnpm --filter @alumni/web typecheck`
* **Lint API Codebase:** `pnpm --filter @alumni/api lint`
* **Lint Web Codebase:** `pnpm --filter @alumni/web lint`

### Prisma Database Management
* **Generate Prisma Client:** `pnpm --filter @alumni/api db:generate`
* **Create/Run DB Migrations:** `pnpm --filter @alumni/api db:migrate`
* **Deploy DB Migrations (Production):** `pnpm --filter @alumni/api db:migrate:deploy`
* **Open Prisma Studio:** `pnpm --filter @alumni/api db:studio`

### CLI Seeding & Provisioning
* **Provision/Seed Network:** `pnpm --filter @alumni/api db:seed -- --name "Patiala Technical University" --code "PTU" --domains "ptu.ac.in"`
* **Provision Network Administrator:** `pnpm --filter @alumni/api db:seed:admin -- --network-code "PTU" --email "admin@ptu.ac.in" --name "Roushan Kumar"`

---

## 📋 Phase-by-Phase Checklist & Task Progress

### Phase 1 — Foundation (Backend Complete)
* [x] Prisma Database Schema definitions.
* [x] Prisma v7 configuration with custom `.env` loader.
* [x] **Fix stale Migration Baseline:** Replaced outdated [0_init/migration.sql](file:///d:/PTU/6th-sem/campus_project/apps/api/prisma/migrations/0_init/migration.sql) with a new working baseline migration [init_baseline](file:///d:/PTU/6th-sem/campus_project/apps/api/prisma/migrations/20260526091153_init_baseline/migration.sql).
* [x] CLI Seed script for university networks ([seed-network.ts](file:///d:/PTU/6th-sem/campus_project/apps/api/scripts/cli/seed-network.ts)).
* [x] CLI Seed script for admin provisioning ([seed-admin.ts](file:///d:/PTU/6th-sem/campus_project/apps/api/scripts/cli/seed-admin.ts)).
* [x] Zod-based application configuration and logger.
* [x] Cloudflare R2 file storage service wrapper.
* [x] Trigger.dev v4 background task setup (email, notification tasks).
* [x] Nodemailer transport logic + email verification endpoints.
* [x] Auth Module: Login, token rotation, cookies, and network authorization middleware.
* [x] Verification Request Module: document upload pipeline, admin pending queue, approve/reject flows.
* [x] Basic Profile Module: `/users/me` endpoint.
* [x] **Phase 1 Milestone Verification Check:** Database initialized, seeded, and connection verified.

### Phase 2 — Social Core (API & Web Complete)
* [x] **API Waves A + B Complete (Typechecks Cleanly):**
  * [x] Keyset global and user feed API endpoints with Redis cache.
  * [x] Posts API (`POST /api/posts` for social media content creation, mentions/hashtag parsing, multi-media uploads).
  * [x] Post Likes & Comments API (nested comments, notification triggers).
  * [x] Follow/Unfollow user graph.
  * [x] User notifications index and marking read.
  * [x] Profile extensions (education listing, work experience CRUD, skills catalogue additions).
* [x] **Wave C: Frontend Integration (`apps/web`):**
  * [x] Web Scaffold: App Layout, global styles, providers, Zustand auth store, React Query client.
  * [x] Auth Flow: Login page.
  * [x] Auth Flow: Register page.
  * [x] Feed UI: Global feed scroll, custom `PostCard` components, and create post modal.
  * [x] Profile UI: View and edit education, work experiences, and skills.
  * [x] Notifications: In-app notifications popover/drawer.
* [x] **Phase 2 Milestone Check:** Checked and validated.

### Phase 3 — Jobs, Groups & Messaging (API & Web Complete)
* [x] **Wave A: Jobs System (Backend)**: Keyset-paginated job listing with tag filtering, transaction writes, and soft-delete hidden flag.
* [x] **Wave B: Groups System (Backend)**: Privacy-aware group CRUD and membership handlers.
* [x] **Wave C: Messaging System (Backend)**: Safe conversation initialization, Socket.IO rooms, and DMs.
* [x] **Wave D: Cleanup Task (Trigger.dev)**: Nightly scheduled cleanup task to purge expired content and GDPR requests.
* [x] **Wave E: Frontend Phase 3 UI**: Job board dashboard, Group discussion feeds, and live chat interface.

### Phase 4 — Real-time Presence, Search & Announcements (API & Web Complete)
* [x] **Wave A: Connections Module (Backend)**: Transactional invites with lexicographical sorting, keyset-paginated active list, and request management.
* [x] **Wave B: Full-Text Search (Backend)**: GIN indexed search for users, content, and jobs utilizing `prisma.$queryRaw` tagged templates.
* [x] **Wave C: Socket.IO Presence & Heartbeats**: Heartbeat ping/pong listener, online status mapping in Redis (EX 35), and network room broadcasts.
* [x] **Wave D: Admin Analytics & Announcements**: Cached metrics in Redis (5m TTL + jitter), keyset-paginated Trigger.dev task dispatches, and Admin forms.
* [x] **Wave E: Frontend UI Views**: `/search` workspace, `/connections` network manager, `/admin` dashboard panel, and active green dot status indicators.

### Phase 4.5 & Phase 2.5-Admin — Unified Admin Management Console (API & Web Complete)
* [x] **Step A: Middleware & Type Consolidation**: Consolidate global `FastifyRequest` properties into `fastify.d.ts` and implement weights-based `requireGroupRole` guard.
* [x] **Step B: Group Moderation API**: Implement post/comment soft-deletion (modify body/meta in-place) and cross-group ownership verification.
* [x] **Step C: Super Admin API & Self-Correction**: Add `disabledAt`/`disabledReason` to `UserSettings` with local SQL migration file, startup auto-migration guard, and `requireAuth` cache.
* [x] **Step D: Verification Queue UI & Presigned URLs**: Secure `GET /admin/:reqId/document-url` presigned URL generation and React verification queue dashboard with review modals.
* [x] **Step E: Member Management API & UI Console**: Role edits, user removal, and bulk action floating panel.
* [x] **Step F: Roster Upload UI Extension**: Drag-and-drop file upload, upload logs history, and header-to-template column mapping page.
* [x] **Step G: Super Admin Control Panel**: Condo-tabs rendering, right-drawer admins panel, Metrics cards auto-refreshing (60s TTL), and user search block list.
* [x] **Step H: Admin Layout & Context**: `<AdminNetworkProvider>` context and sidebar navigation.

---

## 🧠 TypeScript / Import Session Learnings

Keep these guidelines in mind to avoid repeating past development mistakes:
* **Named Redis Import:** Do not use `import Redis from "ioredis"`. Instead, use `import { Redis } from "ioredis"`.
* **Cross-Package Types:** Do not import TypeScript types across package boundaries if they cause rootDir violations. Define local shapes or compile packages as necessary.
* **Exact Optional Properties:** Under `exactOptionalPropertyTypes`, assigning `undefined` to an optional property will trigger compile errors. Use conditional spreads, e.g., `...(val !== undefined ? { field: val } : {})`.
* **Prisma query listener typing:** Cast `$on` explicitly in TS strict mode: `(client.$on as any)("query", callback)`.
* **Fastify Error Handler:** The error parameter in `setErrorHandler` is of type `unknown`. Cast to `{ statusCode?: number; message?: string; code?: string }` before dereferencing properties.
* **Suspense for useSearchParams:** Any component calling `useSearchParams()` must be (a) a Client Component and (b) wrapped in `<Suspense>` by its parent page. Split the page into a thin shell (no hooks) + a child component (has the hook).
* **Fastify Route Handler Parameter Casting:** Under `exactOptionalPropertyTypes`, assigning custom request type shapes inline (like `req: FastifyRequest<{ Querystring: ... }>`) causes signature mismatch errors with Fastify's generic handlers. Instead, use type assertions inside the handler function body (e.g. `const query = req.query as QueryType`).

---

## ⚡ Current Session State & Focus Log

### 🎯 Current Focus
1. **Roster Integration & Auto-Verification:**
   - Completed the auto-verification logic for users who register or verify using their institutional roster records. Resolved conflict mapping resolution bugs and search network restrictions for Super Admin.

### ⚠️ Current Blockers & Risks
* None.

### 📝 Change Log & Session Notes
* **2026-06-11 (Roster Integration & Auto-Verification Complete):**
  - Implemented auto-verification logic in `register` (`apps/api/src/modules/auth/service.ts`) and `submitVerification` (`apps/api/src/modules/verification/service.ts`). Users selecting `ENTRY_NUMBER` who match an active, non-removed roster record are immediately marked as `VERIFIED` (`NetworkMember.status = 'VERIFIED'` and `VerificationRequest.status = 'VERIFIED'`).
  - Automatically created a verified `Education` entry (`isVerified = true`) for auto-verified users, mapping the roster record's `branch` to `degree` and `batch` to `endYear`.
  - Added user notification triggers (`notifyUserVerificationOutcome`) immediately on auto-verification when submitted post-registration, and bypassed admin notifications.
  - Relaxed Zod `.min(1)` in `ConflictResolutionSchema` to allow saving removal confirmations.
  - Resolved Redis HSET crash on empty resolutions in conflicts resolution route (`POST /sessions/:sessionId/conflicts/resolve`).
  - Corrected conflicts endpoint to gracefully return 200 with empty rows instead of 404 once merged.
  - Replaced SQL `$executeRaw` `unnest` query with a standard Prisma loop-based `upsert` in `mergeRosterRecords` task, preventing array-binding casting errors.
  - Upgraded frontend `apiRequest` parser to support empty body returns (e.g. 204 or 202) by reading text first.
  - Added `SUPER_ADMIN` check bypass in search router to allow super admins to perform searches without checking network memberships.
* **2026-06-11 (Admin Management Console Phase 4.5 & Phase 2.5-Admin Complete):**
  - Consolidated all FastifyRequest types globally inside `fastify.d.ts` and created `requireGroupRole` middleware.
  - Implemented soft-deletion for group posts/comments and cross-group post/comment ownership validation.
  - Created Super Admin user disabling, admin lists demotion/management, and metrics endpoints under `/api/admin/super`.
  - Added dynamic database auto-migration on server startup to verify/add `disabled_at` and `disabled_reason` columns to the `user_settings` table.
  - Separated token signature decoding from database/Redis checks in `requireAuth` to prevent database schema errors from masking as a generic 401 token invalidation.
  - Created Presigned Document URL route and Verification queue dashboard with tabs, review dialogs, and skeletons.
  - Built Member Management list with bulk actions, inline edits, and filter query.
  - Added drag-drop Roster uploads and session template mappings.
  - Integrated conditional tab rendering for Super Admin metrics, user search, and admins side-drawer.
  - Implemented `<AdminNetworkProvider>` context and sidebar navigation.
* **2026-06-04 (Phase 1.3 Complete):**
  - Implemented Excel/CSV parsing (max 50k rows), client mapping screen, delta-merge sequential transaction upserts, and filtered campaign template broadcasts.
  - Resolved Fastify route handler typing issues and exactOptionalPropertyTypes strict errors. Production compilation build checks out perfectly.
* **2026-05-26:** 
  - Phase 3: Implemented DMs, Groups, and Jobs boards. Added nightly cleanup cron task. Resolved searchParams static building bailouts.
  - Phase 4: Implemented Connection requests, GIN-indexed Postgres Full-Text Search, Socket.IO presence tracking (heartbeats/MGET endpoints), and Admin dash with Redis-cached analytics and keyset-paginated Trigger.dev tasks. Added UI green dots across chat threads, list buttons, and group sidebars.