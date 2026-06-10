# Alumni Platform — AI Agent Context

**Last updated:** 2026-05-22  
**Architecture doc:** [alumni-platform-architecture.md](file:///d:/PTU/6th-sem/campus_project/docs/alumni-platform-architecture.md) (v2.0)  
**System prompt doc:** [system.prompt.md](file:///d:/PTU/6th-sem/campus_project/docs/system.prompt.md)

> **INSTRUCTIONS FOR AI:**  
> Read this file at the start of every session. Do **not** re-implement anything marked `[x]`.  
> Use the STACK and RULES sections as absolute constraints — never deviate.

---

## Monorepo Layout

```
d:\PTU\6th-sem\campus_project\          ← monorepo root
├── .env.example                         ← ✅ DONE — all required env vars documented
├── apps/
│   ├── api/                            ← Fastify backend (Node.js / TypeScript)
│   │   ├── prisma/
│   │   │   ├── schema.prisma           ← ✅ DONE — full schema, all phases
│   │   │   └── migrations/
│   │   │       └── 0_init/
│   │   │           └── migration.sql   ← ⚠️ STALE — does not match current schema.prisma (see Blockers)
│   │   ├── scripts/cli/
│   │   │   ├── seed-network.ts         ← ✅ DONE
│   │   │   └── seed-admin.ts           ← ✅ DONE
│   │   ├── src/
│   │   │   ├── config/
│   │   │   │   ├── env.ts              ← ✅ DONE — Zod startup validation
│   │   │   │   ├── logger.ts           ← ✅ DONE — Pino (pretty dev / JSON prod)
│   │   │   │   ├── db.ts               ← ✅ DONE — Prisma singleton
│   │   │   │   ├── redis.ts            ← ✅ DONE — ioredis (Upstash TCP)
│   │   │   │   └── trigger.ts          ← ✅ DONE — Trigger.dev v4 configure()
│   │   │   ├── middleware/
│   │   │   │   ├── requireAuth.ts      ← ✅ DONE — JWT Bearer → request.user
│   │   │   │   └── requireRole.ts      ← ✅ DONE — network-scoped role guard factory
│   │   │   ├── services/
│   │   │   │   ├── storage/
│   │   │   │   │   ├── index.ts        ← ✅ DONE — R2 abstraction (upload/signedUrl/delete)
│   │   │   │   │   └── virusScan.ts    ← ✅ DONE — dev stub; prod TODO Phase 6
│   │   │   │   └── email/
│   │   │   │       └── index.ts        ← ✅ DONE — Nodemailer (Ethereal dev fallback)
│   │   │   ├── lib/
│   │   │   │   ├── cache.ts            ← ✅ DONE — jitteredTtl helper
│   │   │   │   └── content-parse.ts    ← ✅ DONE — #hashtag + @mention parsing
│   │   │   ├── tasks/
│   │   │   │   ├── email.tasks.ts      ← ✅ DONE — confirmation/welcome/outcome tasks
│   │   │   │   ├── notification.tasks.ts ← ✅ DONE — verification + createInAppNotification
│   │   │   │   └── feed.tasks.ts       ← ✅ DONE — cache invalidation, mentions, hashtags stub
│   │   │   ├── modules/
│   │   │   │   ├── auth/               ← ✅ DONE (Phase 1)
│   │   │   │   ├── verification/       ← ✅ DONE (Phase 1)
│   │   │   │   ├── users/              ← ✅ DONE — profile + education + experience + skills + follow lists
│   │   │   │   ├── feed/               ← ✅ DONE — global/user feed (keyset + Redis cache)
│   │   │   │   ├── posts/              ← ✅ DONE — create post (multipart), likes, comments
│   │   │   │   ├── follow/             ← ✅ DONE — follow/unfollow
│   │   │   │   └── notifications/      ← ✅ DONE — list, mark read, mark all read
│   │   │   ├── app.ts                  ← ✅ DONE — Phase 1 + Phase 2 routers registered
│   │   │   └── index.ts                ← ✅ DONE — entry point, graceful shutdown
│   │   ├── prisma.config.ts            ← ✅ DONE
│   │   ├── tsconfig.json               ← ✅ DONE
│   │   ├── tsconfig.build.json         ← ✅ DONE
│   │   └── package.json
│   └── web/                            ← Next.js 16 frontend (🟡 IN PROGRESS — shell + login)
│       └── src/
│           ├── app/
│           │   ├── layout.tsx          ← ✅ DONE
│           │   ├── providers.tsx       ← ✅ DONE — React Query
│           │   ├── globals.css         ← ✅ DONE — Tailwind v4
│           │   ├── page.tsx            ← ✅ DONE — redirects to /feed
│           │   └── (auth)/
│           │       ├── layout.tsx      ← ✅ DONE
│           │       └── login/page.tsx  ← ✅ DONE
│           ├── lib/api-client.ts       ← ✅ DONE
│           └── store/auth.ts           ← ✅ DONE — Zustand persist
├── packages/
│   └── shared/
│       └── src/
│           └── index.ts                ← ✅ DONE — shared types, enums, pagination
└── docs/
    ├── alumni-platform-architecture.md
    ├── system.prompt.md
    └── ai-context.md                  ← ✅ YOU ARE HERE (Living AI Context)
```

---

## Tech Stack (locked — do not change)

| Layer           | Technology                                   | Notes                                        |
| --------------- | -------------------------------------------- | -------------------------------------------- |
| API Server      | **Fastify 5**                                | NOT Express, NOT Next.js API routes          |
| ORM             | **Prisma 7.8+**                              | Config via `prisma.config.ts`                |
| Database        | **PostgreSQL + PostGIS**                     | Extensions in migration SQL (not schema)     |
| Cache           | **ioredis**                                  | Redis 7+ — Upstash TCP (`rediss://`)         |
| Background Jobs | **Trigger.dev v4 SDK**                       | NOT BullMQ                                   |
| Auth            | **Argon2id** + **jose** (JWT)                | 15m access / 30d refresh in httpOnly cookie  |
| File Storage    | **Cloudflare R2** via `@aws-sdk/client-s3`   | R2 creds optional until bucket ready         |
| Realtime        | **Socket.IO 4** + `@socket.io/redis-adapter` | Phase 4                                      |
| Email           | **Nodemailer**                               | Ethereal dev fallback when SMTP_USER unset   |
| Push            | FCM via Firebase Admin                       | Phase 5                                      |
| Validation      | **Zod 4**                                    | schemas in `src/modules/{module}/schemas.ts` |
| Frontend        | **Next.js 16** (App Router)                  | `apps/web/` — Phase 2 frontend               |
| Shared Logic    | **@alumni/shared**                           | workspace package — types/enums/pagination   |

---

## Critical Architecture Rules (never break these)

1. **Content table = Single Table Inheritance** — one `content` table, `contentType` enum discriminator, type-specific fields in `meta` JSONB. Never add separate tables per content type.
2. **Feed pagination = keyset cursor** — never LIMIT/OFFSET in feed queries.
3. **File uploads** — virus scan FIRST (before R2 upload), then upload, then store R2 path.
4. **Background tasks** — all async work (emails, PDF, notifications, cache) via Trigger.dev tasks. API handlers fire-and-forget and return immediately.
5. **Redis cache keys** — pattern `{entity}:{id}:{subkey}`. Always jitter TTL ±10%.
6. **`connections` table** — always store `(userA, userB)` where `userA < userB` (UUID lexicographic). Enforced in service layer.
7. **Passwords** — Argon2id only. No bcrypt.
8. **Zod schemas** — live in `src/modules/{module}/schemas.ts`. Never inline in route handlers.
9. **No raw SQL string interpolation** — Prisma parameterized queries + TypedSQL for complex cases.
10. **Socket.IO** — Redis adapter always; JWT validated on handshake; reject connection if invalid.
11. **Message expiry** — `expiresAt = sentAt + 60 days` set in app layer on insert. Nightly Trigger.dev task soft-deletes.
12. **Network provisioning** — CLI scripts only (`scripts/cli/`). No super-admin UI.
13. **Search** — PostgreSQL `tsvector` + GIN indexes. Mapped as `Unsupported("tsvector")?`. Fully automated via auto-update database triggers (in migration SQL) for profiles and content (including PDF notices).
14. **Error responses** — always `{ error: string, code: string }`. Success: `{ data: T }` or `{ data: T, meta: PaginationMeta }`.
15. **No `any` TypeScript types** — ever.

---

## Prisma 7 Specifics

| Item                  | Detail                                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Config file           | `apps/api/prisma.config.ts` — schema path, migrations path, datasource URL                                                                                   |
| `.env` loading        | `dotenv/config` imported at top of `prisma.config.ts` (Prisma 7 does NOT auto-load `.env`)                                                                   |
| Extensions            | Managed via **migration SQL** (`000_manual_extensions_triggers/migration.sql`), NOT `previewFeatures` or datasource `extensions` block (removed in Prisma 7) |
| CLI scripts           | All pass `--config prisma.config.ts` (see `package.json` `db:*` scripts)                                                                                     |
| `Unsupported` columns | `profiles.search_vector`, `content.search_vector` are `Unsupported("tsvector")` — fully automated via Postgres insert/update triggers                        |
| PostGIS geom          | Declared as `Unsupported("geometry(Point, 4326)")?` in `schema.prisma`. Spatial GIST index and lat/lon synchronization trigger configured via migration SQL  |

---

## TypeScript / Import Gotchas (session learnings — do not repeat these mistakes)

| Issue                                                                       | Fix                                                                                                       |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `import Redis from "ioredis"` fails with NodeNext                           | Use `import { Redis } from "ioredis"` (named export)                                                      |
| Cross-`rootDir` import from `@alumni/shared` in `requireRole.ts`            | Define the type locally; shared package types only usable via path alias during build, not `tsc --noEmit` |
| `tsconfig.build.json` with `rootDir: ./src` breaks `@alumni/shared` imports | Extend `tsconfig.json` without narrowing `rootDir`; `pnpm typecheck` passes                               |
| `exactOptionalPropertyTypes`: `string \| undefined` ≠ optional field        | Use conditional spread: `...(val !== undefined ? { field: val } : {})`                                    |
| Prisma `$on("query")` with `@ts-expect-error` unused in Prisma 7.8          | Cast `client.$on` directly: `(client.$on as ...)("query", cb)`                                            |
| Fastify `setErrorHandler` — `err` is `unknown` in TS strict mode            | Cast as `{ statusCode?: number; message?: string }` before accessing properties                           |

---

## Database Schema — Model Inventory

### Phase 1 — Foundation ✅ SCHEMA DONE

| Model                 | Table                   | Notes                                                                          |
| --------------------- | ----------------------- | ------------------------------------------------------------------------------ |
| `User`                | `users`                 | Argon2id password, unique `username` handle (for @mentions), `GlobalRole` enum |
| `Profile`             | `profiles`              | 1:1 with User; `search_vector` tsvector via trigger                            |
| `Session`             | `sessions`              | httpOnly refresh token store                                                   |
| `Network`             | `networks`              | CLI-provisioned only                                                           |
| `NetworkMember`       | `network_members`       | `(userId, networkId)` PK; `NetworkRole` + `MemberStatus`                       |
| `VerificationRequest` | `verification_requests` | `VerificationMethod` enum; R2 documentUrl                                      |
| `Education`           | `educations`            | `isVerified` flipped by admin approval                                         |
| `WorkExperience`      | `work_experiences`      | `endDate = null` means current                                                 |
| `Skill`               | `skills`                | normalised catalogue                                                           |
| `UserSkill`           | `user_skills`           | M2M user ↔ skill                                                               |
| `Certification`       | `certifications`        |                                                                                |

### Phase 1.3 — Roster Management ✅ SCHEMA & IMPLEMENTATION DONE

| Model                 | Table                   | Notes                                                                          |
| --------------------- | ----------------------- | ------------------------------------------------------------------------------ |
| `RosterUploadSession` | `roster_upload_sessions`| Tracks batch roster upload history, sanitization errors, and merge summary     |
| `RosterColumnMapping` | `roster_column_mappings`| Left-to-right header mappings. Requires entryNumber core mapping               |
| `RosterRecord`        | `roster_records`        | Normalized student records, index on lastSeenSession, batch, branch, full_name |
| `EmailCampaign`       | `email_campaigns`       | Email template bodies with variable parsing and filtered target segments       |

### Phase 2 — Social Core ✅ SCHEMA DONE

| Model               | Table                 | Notes                                                                                         |
| ------------------- | --------------------- | --------------------------------------------------------------------------------------------- |
| `Content`           | `content`             | STI; top-level `tags` GIN array; `meta` JSONB; `search_vector` tsvector via Postgres triggers |
| `PostMedia`         | `post_media`          | Images/video attached to SOCIAL_POST                                                          |
| `PostLike`          | `post_likes`          | `(userId, contentId)` PK                                                                      |
| `PostComment`       | `post_comments`       | Self-referential `parentId` for nested replies                                                |
| `Follow`            | `follows`             | One-way; `(followerId, followeeId)` PK                                                        |
| `ConnectionRequest` | `connection_requests` | `ConnectionStatus` enum                                                                       |
| `Connection`        | `connections`         | `(userA, userB)` PK; `userA < userB` always                                                   |
| `Notification`      | `notifications`       | Polymorphic `relatedId`                                                                       |
| `NotificationPref`  | `notification_prefs`  | `(userId, notifType, channel)` PK                                                             |

### Phase 3 — Professional Features ✅ SCHEMA DONE

| Model | Table  | Notes                                                                     |
| ----- | ------ | ------------------------------------------------------------------------- |
| `Job` | `jobs` | Companion to Content(type=JOB); `expiresAt` → nightly Trigger.dev cleanup |

### Phase 4 — Groups & Messaging ✅ SCHEMA DONE

| Model                | Table                  | Notes                                         |
| -------------------- | ---------------------- | --------------------------------------------- |
| `Group`              | `groups`               | Group posts = Content rows with `groupId` set |
| `GroupMember`        | `group_members`        | `GroupRole` enum                              |
| `Conversation`       | `conversations`        | 1:1 and group chat                            |
| `ConversationMember` | `conversation_members` | `ConvRole` enum                               |
| `Message`            | `messages`             | `expiresAt = sentAt + 60d` (app layer)        |
| `MessageRead`        | `message_reads`        | Read receipts                                 |

### Phase 5–6 — Geo & Settings ✅ SCHEMA DONE

| Model          | Table            | Notes                                                                                      |
| -------------- | ---------------- | ------------------------------------------------------------------------------------------ |
| `UserLocation` | `user_locations` | Mapped via `Unsupported("geometry(Point, 4326)")`. Synced via `trg_sync_user_geom` trigger |
| `UserSettings` | `user_settings`  | FCM token, onboarding flag, deletion request                                               |

---

## Implementation Phase Tracker

### Phase 1 — Foundation

- [x] Prisma schema (all models, all phases)
- [x] `prisma.config.ts` (Prisma 7 config with dotenv)
- [ ] `migration.sql` baseline — `0_init` exists but **stale**; regenerate from `schema.prisma` + manual SQL (PostGIS, GIN, tsvector triggers)
- [x] `scripts/cli/seed-network.ts`
- [x] `scripts/cli/seed-admin.ts`
- [x] `tsconfig.json` update (covers root files & CLI scripts)
- [x] `tsconfig.build.json` added (isolates `/src` directory for production compilation)
- [x] `src/config/env.ts` — Zod env validation on startup (crashes fast, typed `env` object)
- [x] `src/config/logger.ts` — Pino logger (pretty dev, JSON prod, `pino-pretty` installed)
- [x] `src/config/db.ts` — Prisma singleton (hot-reload safe, slow query >100ms logged)
- [x] `src/config/redis.ts` — ioredis Upstash TCP (`{ Redis }` named import, retry strategy)
- [x] `src/config/trigger.ts` — Trigger.dev v4 `configure()` singleton
- [x] `src/services/storage/index.ts` — R2 abstraction (uploadFile, getSignedUrl, deleteFile, buildKey); warns when unconfigured
- [x] `src/services/storage/virusScan.ts` — dev stub (always clean); prod TODO wired
- [x] `src/services/email/index.ts` — Nodemailer (Ethereal test account fallback in dev); email templates
- [x] `src/tasks/email.tasks.ts` — `sendConfirmationEmail`, `sendWelcomeEmail`, `sendVerificationOutcomeEmail` (retry ×3, exponential)
- [x] `src/tasks/notification.tasks.ts` — `notifyAdminNewVerification`, `notifyUserVerificationOutcome`, `createInAppNotification` (Phase 2+)
- [x] `src/middleware/requireAuth.ts` — JWT Bearer validation, `request.user` augmentation
- [x] `src/middleware/requireRole.ts` — network-scoped role guard factory (`requireRole`, `requireAdmin`, `requireAdminOrFaculty`)
- [x] Auth module: `schemas.ts`, `types.ts`, `service.ts`, `router.ts`
  - POST /api/auth/register (Argon2id hash, profile+settings create, fire confirm email task)
  - GET /api/auth/confirm?token= (verify email JWT, set emailVerified=true, redirect)
  - POST /api/auth/login (verify password, issue access+refresh tokens, session row)
  - POST /api/auth/refresh (rotate refresh token, invalidate old session)
  - POST /api/auth/logout (delete session, clear cookie)
- [x] Verification module: `schemas.ts`, `service.ts`, `router.ts`
  - POST /api/verification/submit (multipart: scan→upload→DB→notify admins)
  - GET /api/verification/admin/pending (paginated pending queue)
  - POST /api/verification/admin/:reqId/approve (transaction: status+membership+education)
  - POST /api/verification/admin/:reqId/reject (transaction: status, fire outcome task)
- [x] Basic profile module: `schemas.ts`, `service.ts`, `router.ts`
  - GET /api/users/me (Redis-cached, includes educations/work/skills/memberships)
  - PUT /api/users/me (upsert profile, invalidate cache)
  - GET /api/users/:userId (verified-only public view)
- [x] `src/app.ts` — Fastify factory (@fastify/cookie, cors, multipart `files:4`, error handlers, /health)
- [x] `src/index.ts` — entry point (dotenv→env→DB ping→Redis ping→listen→graceful shutdown)
- [x] `packages/shared/src/index.ts` — `PaginationMeta`, `CursorPage`, `ApiSuccess`, `ApiError`, shared enums, `AuthorSummary`
- [x] `.env.example` at monorepo root
- [x] `apps/api/.env` updated with all variable slots (R2 commented out until bucket ready)
- [ ] **Database migrations** — `0_init` SQL is out of sync with `schema.prisma` (old table names: `contents`, `user_profiles`, `firebase_uid`). Regenerate baseline before first `db:migrate` on a fresh DB.
- [ ] **Phase 1 milestone check** — pending migration + smoke test (see `docs/system.prompt.md` Phase 1 checklist)

### Phase 2 — Social Core

> **Status:** API Waves A + B **code complete** (`pnpm --filter @alumni/api typecheck` passes). Wave C **partial** (shell + login).  
> **Prerequisite for runtime:** Phase 1 milestone — migrations still stale (`0_init`); smoke tests not run.  
> **Implementation order:** Finish Wave C → milestone check. Connections module is **Phase 4** — do not build in Phase 2.

#### Wave A — Feed & posts (API)

- [ ] **2.0 Migration baseline** — replace stale `0_init` with migration from current `schema.prisma` + manual SQL (PostGIS, GIN on `tags`, tsvector triggers on `profiles` + `content`)
- [x] **2.1** `src/modules/feed/schemas.ts` — create post, feed query, feed item response Zod types
- [x] **2.2** `src/modules/feed/service.ts` — `createPost`, `getGlobalFeed`, `getUserFeed` (keyset on `createdAt` + `contentId`, no OFFSET)
- [x] **2.3** `src/modules/feed/router.ts` + `posts/router.ts` — registered in `app.ts`
  - `POST /api/posts` — SOCIAL_POST, parse `#tags` + `@mentions` into `content.tags`, fire Trigger.dev tasks
  - `GET /api/feed/global?cursor=&limit=` — network from verified `network_members`; Redis cache
  - `GET /api/feed/user/:userId?cursor=&limit=` — author-scoped feed
- [x] **2.4** `src/tasks/feed.tasks.ts` — `invalidateFeedCache`, `processMentions`, `processHashtags`
- [x] **2.5** Post media — multipart `files: 4`; scan→R2→`post_media`; signed URLs in feed DTO
- [x] **2.6** Likes & comments — `src/modules/posts/`
  - `POST/DELETE /api/posts/:contentId/like`
  - `POST /api/posts/:contentId/comments`, `GET` (keyset), `DELETE /api/comments/:commentId`
  - Like/comment → `createInAppNotification` task (skip self-actions)

#### Wave B — Social graph & notifications (API)

- [x] **2.7** `src/modules/follow/` — `POST/DELETE /api/follow/:userId`; lists on `/api/users/:userId/followers|following`
- [x] **2.8** `src/modules/notifications/` — `GET /api/notifications`, `POST .../read`, `POST .../read-all`
- [x] **2.9** `createInAppNotification` task in `notification.tasks.ts`
- [x] **2.10** Extend `src/modules/users/` — work experience CRUD, skills add/remove, `GET /api/users/me/education`
  - `GET /api/users/me/education`
  - `POST /api/users/me/experience`, `PUT /api/users/me/experience/:expId`, `DELETE .../:expId`
  - `POST /api/users/me/skills`, `DELETE /api/users/me/skills/:skillId`

#### Wave C — Frontend (`apps/web`)

- [x] **2.11** Monorepo wiring — `@alumni/shared` in `apps/web/package.json`; `transpilePackages` in `next.config.ts`
- [x] **2.12** App shell — `layout.tsx`, `providers.tsx` (React Query), `api-client.ts`, `auth.ts` (Zustand persist), `globals.css`, `postcss.config.mjs`
- [ ] **2.13** Auth pages — login ✅; register page ⬜; confirm redirect handled by API → `/login?confirmed=1` ✅
- [ ] **2.14** Feed UI — `/feed` page ⬜; infinite scroll, `PostCard`, create-post form
- [ ] **2.15** Profile UI — view/edit profile, work experience, skills ⬜
- [ ] **2.16** Notifications drawer — list + mark read ⬜

#### Phase 2 milestone check

- [ ] `POST /api/posts` → `content_type = SOCIAL_POST`, tags stored, tasks fired
- [ ] `GET /api/feed/global` — keyset cursor, cold-start works when Redis empty
- [ ] Cache key `feed:network:{networkId}:{cursorHash}` populated, TTL ~60s ± jitter
- [ ] Likes/comments create `notifications` rows; `@mention` notifies target user
- [ ] Follow/unfollow updates `follows` table
- [ ] Web: login → feed → post → like → comment (happy path)

### Phase 3 — Professional Features

- [ ] Jobs module (create, list, filter, nightly expiry task)
- [ ] Full-text search API (users + content, tsvector)
- [ ] Admin analytics endpoint
- [ ] Announcements (admin post + batch-notify Trigger.dev task)
- [ ] Newsletter (bulk email Trigger.dev task)
- [ ] **Phase 3 milestone check**

### Phase 4 — Groups & Messaging

- [ ] Groups module (CRUD, membership, group-scoped feed)
- [ ] Connections module (request, accept, decline)
- [ ] Socket.IO server setup (Redis adapter, JWT handshake auth)
- [ ] Messaging API (conversations, history keyset, read receipts)
- [ ] Message expiry Trigger.dev task (nightly 02:00)
- [ ] **Phase 4 milestone check**

### Phase 5 — PDF & Polish

- [ ] PDF upload API (type=PDF_NOTICE)
- [ ] PDF processing Trigger.dev task (pdf-parse, pdfjs-dist preview)
- [ ] Push notification service (FCM)
- [ ] Notification prefs API + frontend toggle matrix
- [ ] Profile photo upload (R2 + avatar endpoint)
- [ ] Performance audit (EXPLAIN ANALYZE on feed + search)
- [ ] Mobile responsive pass (Next.js frontend)
- [ ] **Phase 5 milestone check**

### Phase 6 — Launch Hardening

- [ ] Rate limiting middleware (`@fastify/rate-limit` + Redis)
- [ ] Virus scan — production AV integration (`virusScan.ts` TODO)
- [ ] Sentry integration (`@sentry/node`)
- [ ] Load test (k6 or Artillery)
- [ ] Backup strategy (nightly pg_dump to R2 via Trigger.dev)
- [ ] GDPR: data export + account deletion endpoints
- [ ] Onboarding flow
- [ ] SEO meta (Next.js `generateMetadata`)
- [ ] **Launch readiness checklist**

---

## Key File Locations

| File                                              | Purpose                                                                      |
| ------------------------------------------------- | ---------------------------------------------------------------------------- |
| `apps/api/prisma/schema.prisma`                   | Full Prisma schema — all models, all phases                                  |
| `apps/api/prisma/migrations/0_init/migration.sql` | ⚠️ Stale — must be regenerated to match `schema.prisma` before first migrate |
| `apps/api/prisma.config.ts`                       | Prisma 7 CLI config (schema path, migrations, datasource)                    |
| `apps/api/scripts/cli/seed-network.ts`            | Bootstrap a new university network via CLI                                   |
| `apps/api/scripts/cli/seed-admin.ts`              | Create initial admin user for a network via CLI                              |
| `apps/api/tsconfig.json`                          | API package TSConfig (workspace cover for CLI & config)                      |
| `apps/api/tsconfig.build.json`                    | API package production compilation build target                              |
| `apps/api/.env`                                   | Local env vars (R2 creds commented out; DB/Redis/JWT/Trigger filled)         |
| `.env.example`                                    | Monorepo root — documents all required variables                             |
| `apps/api/src/config/env.ts`                      | Zod env schema — source of truth for all env var names                       |
| `apps/api/src/config/logger.ts`                   | Pino logger singleton                                                        |
| `apps/api/src/config/db.ts`                       | Prisma client singleton                                                      |
| `apps/api/src/config/redis.ts`                    | ioredis client (Upstash TCP) + redisPublish helper                           |
| `apps/api/src/config/trigger.ts`                  | Trigger.dev v4 configure()                                                   |
| `apps/api/src/services/storage/index.ts`          | R2 abstraction (upload/sign/delete/buildKey)                                 |
| `apps/api/src/services/storage/virusScan.ts`      | Virus scan stub (dev=always clean; prod TODO)                                |
| `apps/api/src/services/email/index.ts`            | Nodemailer abstraction + HTML email templates                                |
| `apps/api/src/tasks/email.tasks.ts`               | Trigger.dev email tasks (confirm/welcome/outcome)                            |
| `apps/api/src/tasks/notification.tasks.ts`        | Verification notify tasks + `createInAppNotification`                        |
| `apps/api/src/tasks/feed.tasks.ts`                | `invalidateFeedCache`, `processMentions`, `processHashtags`                  |
| `apps/api/src/lib/cache.ts`                       | `jitteredTtl()` for Redis TTL jitter                                         |
| `apps/api/src/lib/content-parse.ts`               | `parseHashtags()`, `parseMentionUsernames()`                                 |
| `apps/api/src/middleware/requireAuth.ts`          | JWT Bearer preHandler → `request.user`                                       |
| `apps/api/src/middleware/requireRole.ts`          | Network-scoped role guard factory                                            |
| `apps/api/src/modules/auth/`                      | Auth module (schemas, types, service, router)                                |
| `apps/api/src/modules/verification/`              | Verification module (schemas, service, router)                               |
| `apps/api/src/modules/users/`                     | Profile + education + experience + skills + follower lists                   |
| `apps/api/src/modules/feed/`                      | `GET /api/feed/global`, `GET /api/feed/user/:userId`                         |
| `apps/api/src/modules/posts/`                     | `POST /api/posts`, likes, comments; `DELETE /api/comments/:id`               |
| `apps/api/src/modules/follow/`                    | `POST/DELETE /api/follow/:userId`                                            |
| `apps/api/src/modules/notifications/`             | `GET /api/notifications`, mark read, read-all                                |
| `apps/api/src/app.ts`                             | Fastify app factory (all Phase 1–2 routers)                                  |
| `apps/web/src/lib/api-client.ts`                  | Typed fetch wrapper + `ApiRequestError`                                      |
| `apps/web/src/store/auth.ts`                      | Zustand auth session (persisted)                                             |
| `apps/web/src/app/(auth)/login/page.tsx`          | Login form → `POST /api/auth/login`                                          |
| `apps/api/src/index.ts`                           | Server entry point + graceful shutdown                                       |
| `packages/shared/src/index.ts`                    | Shared types: pagination, API shapes, enums, AuthorSummary                   |
| `docs/ai-context.md`                              | This file (Living AI Context)                                                |

---

## Phase 2 — API Routes (implemented)

| Method          | Path                                     | Module                                   |
| --------------- | ---------------------------------------- | ---------------------------------------- |
| POST            | `/api/posts`                             | posts (multipart: body + up to 4 images) |
| GET             | `/api/feed/global`                       | feed                                     |
| GET             | `/api/feed/user/:userId`                 | feed                                     |
| POST/DELETE     | `/api/posts/:contentId/like`             | posts                                    |
| POST/GET        | `/api/posts/:contentId/comments`         | posts                                    |
| DELETE          | `/api/comments/:commentId`               | posts                                    |
| POST/DELETE     | `/api/follow/:userId`                    | follow                                   |
| GET             | `/api/users/:userId/followers`           | users                                    |
| GET             | `/api/users/:userId/following`           | users                                    |
| GET             | `/api/notifications`                     | notifications                            |
| POST            | `/api/notifications/:notifId/read`       | notifications                            |
| POST            | `/api/notifications/read-all`            | notifications                            |
| GET             | `/api/users/me/education`                | users                                    |
| POST/PUT/DELETE | `/api/users/me/experience` (+ `/:expId`) | users                                    |
| POST/DELETE     | `/api/users/me/skills` (+ `/:skillId`)   | users                                    |

---

## Phase 2 — File Tree (current)

```
apps/api/src/                          ✅ Wave A + B complete
├── lib/cache.ts, content-parse.ts
├── tasks/feed.tasks.ts
├── modules/feed/, posts/, follow/, notifications/
└── app.ts                             ← registers all Phase 2 routers

apps/web/src/                          🟡 Wave C partial
├── app/layout.tsx, providers.tsx, globals.css, page.tsx
├── app/(auth)/layout.tsx, login/page.tsx
├── lib/api-client.ts
└── store/auth.ts
# TODO: register/page.tsx, (app)/feed/, profile/, notifications UI
```

---

## Next Steps for New AI Session

**Copy this block into your next session after the system context:**

```
COMPLETED — Phase 1.3 API & Web:
- roster: parse excel/csv, mappings, delta-merge sequence tasks, verification service matching
- campaigns: template variables, filter criteria target segmenting, rate-limited Trigger.dev campaign task
- UI views for Roster Upload, Roster Sessions mapping, and Campaigns Manager page

IN PROGRESS — Phase 2 Web:
- Shell: layout, React Query, api-client, Zustand auth store, login page
- TODO: register page, /feed UI, profile UI, notifications drawer

BLOCKERS (runtime / milestone):
1. R2 optional — post images fail upload until R2_* env vars set

NEXT SESSION — START HERE:
1. Wave C: register page → feed page (useInfiniteQuery) → profile → notifications UI
2. Phase 2 milestone checklist in ai-context.md

DO NOT: connections, Socket.IO, jobs, groups (Phase 3–4).
```
