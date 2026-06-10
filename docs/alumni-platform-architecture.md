# Alumni Networking Platform — Full Architecture Document

**Version:** 2.0 (Corrected)
**Last Updated:** 2026-05-17
**Target Scale:** 200,000 verified users
**Region:** Patiāla, IN (Cloudflare CDN edge)

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [Core Modules](#2-core-modules)
3. [Tech Stack](#3-tech-stack)
4. [High-Level Architecture](#4-high-level-architecture)
5. [Folder Structure](#5-folder-structure)
6. [Database Architecture](#6-database-architecture)
7. [Authentication Workflow](#7-authentication-workflow)
8. [Verification Workflow](#8-verification-workflow)
9. [Feed Workflow](#9-feed-workflow)
10. [Job System Workflow](#10-job-system-workflow)
11. [Connection System Workflow](#11-connection-system-workflow)
12. [Messaging Architecture](#12-messaging-architecture)
13. [Search Architecture](#13-search-architecture)
14. [Notification System](#14-notification-system)
15. [AI Integration Architecture](#15-ai-integration-architecture)
16. [Geo Intelligence (Future)](#16-geo-intelligence-future)
17. [Event-Driven Internal Architecture](#17-event-driven-internal-architecture)
18. [Caching Strategy](#18-caching-strategy)
19. [Security Architecture](#19-security-architecture)
20. [Network Provisioning & CLI Bootstrap](#20-network-provisioning--cli-bootstrap)
21. [Scaling Strategy](#21-scaling-strategy)
22. [Development Phases & Tracking](#22-development-phases--tracking)

---

## 1. Product Vision

A **university-focused alumni network** combining:

- **Verified Identity Management** — students, alumni, faculty within institution-scoped _networks_
- **Professional Profiles & Connections** — LinkedIn-style profiles, follow/connect
- **Social Features** — posts, jobs, groups, comments, likes
- **Institutional Communication** — announcements, newsletters, PDFs treated as first-class feed content

The platform is **institution-controlled**: faculty/administrators moderate, create networks, and verify new users. No anonymous signups. Every user must pass admin verification before accessing the full platform.

**Key Principles:**

- Trust-first (admin-approved only)
- Low cost (Cloudflare R2, no egress fees)
- Simplicity (monolith first, no premature microservices)
- PDF as content (official docs appear in feed with preview, text search, download)

---

## 2. Core Modules

| Module                 | Description                                                |
| ---------------------- | ---------------------------------------------------------- |
| **Auth & Identity**    | Registration, login, JWT/session, email confirmation       |
| **Network Management** | University/campus info, membership, roles                  |
| **Verification**       | Entry number / document upload, admin review               |
| **User Profiles**      | Bio, education, work history, skills, social links         |
| **Social Feed**        | Posts, likes, comments, hashtags, mentions                 |
| **Connections**        | Follow (one-way) + Connect (mutual) with request flow      |
| **Jobs & Careers**     | Structured job posts, external apply links, expiry         |
| **Groups**             | Private groups with membership and group-only posts        |
| **Messaging**          | 1:1 and group chat via WebSocket, 60-day message retention |
| **Search & Directory** | FTS on profiles, posts, PDF content, skill/year filters    |
| **Notifications**      | In-app + push + email digest                               |
| **Admin Panel**        | Approve users, send newsletters, view analytics            |
| **Content Engine**     | Unified content table (posts, PDFs, announcements, jobs)   |
| **Geo Intelligence**   | _(Future)_ Alumni density map with clustering              |

> **No super-admin UI.** Network provisioning is done via a developer CLI/seed script (see Section 20). Regular admins (faculty/TPO) manage their own network via the Admin Panel.

---

## 3. Tech Stack

### Frontend

| Layer           | Technology                  | Notes                                     |
| --------------- | --------------------------- | ----------------------------------------- |
| Framework       | Next.js 14 (React)          | Full-stack, SSR, SEO, App Router          |
| Styling         | Tailwind CSS                | Utility-first, rapid UI                   |
| State           | Zustand                     | Lightweight global state                  |
| Data Fetching   | React Query (TanStack)      | Server state, caching, background refetch |
| Forms           | React Hook Form + Zod       | Type-safe validation                      |
| Maps _(future)_ | Mapbox GL JS + Supercluster | Clustering alumni on map                  |
| Realtime        | Socket.IO Client            | WS for notifications + chat               |

### Backend

| Layer           | Technology         | Notes                                             |
| --------------- | ------------------ | ------------------------------------------------- |
| Server          | Next.js API Routes | Monolith; optionally thin Express layer           |
| ORM             | Prisma             | Type-safe queries; raw SQL for FTS/geo            |
| Cache           | Redis              | Sessions, feed cache, pub/sub, rate limits        |
| Background Jobs | **Trigger.dev**    | Open-source, retries, monitoring, scheduled tasks |
| Realtime        | Socket.IO Server   | Push events (chat, notifications)                 |

### Data & Storage

| Layer        | Technology                    | Notes                                 |
| ------------ | ----------------------------- | ------------------------------------- |
| Database     | PostgreSQL + PostGIS          | Relational, geo queries, built-in FTS |
| Search       | PostgreSQL FTS (tsvector/GIN) | No extra infra for V1                 |
| File Storage | Cloudflare R2 (S3 API)        | Zero egress fees                      |
| CDN          | Cloudflare                    | Static assets, global edge            |

### AI & Future (Added much latter)

| Layer       | Technology                | Notes                                |
| ----------- | ------------------------- | ------------------------------------ |
| PDF Parsing | `pdf-parse`, `pdfjs-dist` | Text extraction from PDFs            |
| LLM         | OpenAI / Ollama (local)   | Profile parsing, summarization (V2+) |
| Vector DB   | `pgvector` in Postgres    | Semantic search embeddings (V3+)     |

> **Why Trigger.dev over BullMQ?** Trigger.dev wraps Redis queues with a developer dashboard, automatic retries, failure tracking, scheduled tasks, and webhook support — all without writing boilerplate queue management. BullMQ is powerful but bare-metal; Trigger.dev gives the same Redis-backed durability with observability out of the box.

---

## 4. High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        CLIENT                           │
│              Next.js Web App (React)                    │
│         React Query hooks + Socket.IO client            │
└────────────────────────┬────────────────────────────────┘
                         │ HTTPS / WSS
┌────────────────────────▼────────────────────────────────┐
│                     BACKEND                             │
│              Next.js API Routes / Server                │
│         Auth ▪ Feed ▪ Jobs ▪ Search ▪ Admin             │
└──────┬──────────┬────────────┬───────────┬──────────────┘
       │          │            │           │
  ┌────▼───┐ ┌───▼────┐ ┌────▼────┐ ┌────▼──────────┐
  │Postgres│ │ Redis  │ │  R2     │ │  Trigger.dev  │
  │+PostGIS│ │ Cache  │ │ Storage │ │  Background   │
  └────────┘ └───┬────┘ └─────────┘ │  Jobs         │
                 │                  └───────┬────────┘
         ┌───────▼──────┐                  │
         │ Socket.IO    │◄─────────────────┘
         │ Server       │  (emit events after job completion)
         └───────┬──────┘
                 │ WSS
           ┌─────▼──────┐
           │   CLIENT   │
           └────────────┘
```

**Flow summary:**

- All user requests hit the Next.js API.
- Heavy/async work (PDF parsing, emails, notifications, AI) is handed off to Trigger.dev tasks immediately.
- Feed and profile data is served from Redis cache first, Postgres fallback.
- Files (PDFs, images) go to Cloudflare R2; served via signed URLs through Cloudflare CDN.
- Real-time events (messages, notifications) travel via Socket.IO, backed by Redis pub/sub for multi-instance support.

---

## 5. Folder Structure

```
src/
├── modules/
│   ├── auth/              # Login, JWT/session, email confirm
│   ├── users/             # Profiles, settings, social links
│   ├── networks/          # Campus info, membership, roles
│   ├── verification/      # Verification workflows, document handling
│   ├── feed/              # Posts, hashtags, feed logic, ranking
│   ├── jobs/              # Job posts, applications, expiry
│   ├── groups/            # Group creation, membership, group posts
│   ├── connections/       # Follows + mutual connections
│   ├── messaging/         # Chat, conversations, read receipts
│   ├── notifications/     # In-app, push, email digest
│   ├── search/            # FTS queries, filters, index management
│   ├── geo/               # (future) PostGIS queries, clustering
│   └── analytics/         # Metrics, admin dashboards
│
├── services/
│   ├── storage/           # R2/S3 abstraction (swap providers here)
│   ├── email/             # nodemailer abstraction
│   ├── push/              # FCM / Expo push abstraction
│   └── ai/                # PDF parsing, LLM calls, embeddings
│
├── tasks/                 # Trigger.dev task definitions
│   ├── pdf.tasks.ts       # PDF extract, preview generation
│   ├── notification.tasks.ts
│   ├── email.tasks.ts
│   ├── feed.tasks.ts      # Cache invalidation, fan-out
│   └── ai.tasks.ts        # LLM parsing, embedding generation
│
├── db/
│   ├── schema.prisma      # Prisma schema
│   └── migrations/        # Prisma migrations
│
├── socket/                # Socket.IO event handlers
├── utils/                 # Formatting, validators, helpers
└── config/                # Env vars, constants, logger setup

scripts/
└── cli/
    ├── seed-network.ts    # Bootstrap new university network
    └── seed-admin.ts      # Create initial admin user for a network
```

---

## 6. Database Architecture

### Design Principles

- **Semi-denormalization** for read-heavy paths (feeds, profiles). Accept minor redundancy to reduce JOIN cost.
- **Single Table Inheritance** for the `content` table (one table, `content_type` discriminator). Type-specific fields stored in a `meta` JSONB column to keep the table clean as types grow.
- **Keyset pagination** over LIMIT/OFFSET for feed queries at scale.
- **GIN indexes** on `tsvector` columns for full-text search.
- **PostGIS** geometry columns on user location for future geo clustering.

---

### 6.1 Core Identity

```sql
-- users
user_id         UUID PK
email           TEXT UNIQUE NOT NULL
password_hash   TEXT NOT NULL
global_role     ENUM('user','super_admin') DEFAULT 'user'
email_verified  BOOLEAN DEFAULT false
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ

-- profiles
user_id         UUID FK → users PK
full_name       TEXT
headline        TEXT
bio             TEXT
country         TEXT        -- denormalized for fast filter
state           TEXT
city            TEXT
locality        TEXT
profile_image   TEXT        -- R2 signed URL
linkedin_url    TEXT
public_email    TEXT
search_vector   TSVECTOR    -- GIN indexed, updated on write
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ

-- sessions (if server-side; skip if JWT-only)
session_id      UUID PK
user_id         UUID FK
token_hash      TEXT
expires_at      TIMESTAMPTZ
created_at      TIMESTAMPTZ
```

---

### 6.2 Educational Identity

```sql
-- networks
network_id      UUID PK
name            TEXT NOT NULL
code            TEXT UNIQUE     -- e.g. 'PTU'
logo_url        TEXT
allowed_domains TEXT[]          -- e.g. ['ptu.ac.in']
created_at      TIMESTAMPTZ

-- network_members
user_id         UUID FK
network_id      UUID FK
role            ENUM('student','alumni','faculty','admin')
status          ENUM('pending','under_review','verified','rejected')
joined_at       TIMESTAMPTZ
PRIMARY KEY (user_id, network_id)

-- verification_requests
req_id          UUID PK
user_id         UUID FK
network_id      UUID FK
method          ENUM('entry_number','document_upload')
entry_number    TEXT
document_url    TEXT            -- R2 path (scanned before upload)
status          ENUM('pending','under_review','verified','rejected')
admin_notes     TEXT
submitted_at    TIMESTAMPTZ
reviewed_at     TIMESTAMPTZ
reviewed_by     UUID FK → users

-- educations
edu_id          UUID PK
user_id         UUID FK
network_id      UUID FK
degree          TEXT
field           TEXT
start_year      SMALLINT
end_year        SMALLINT
is_verified     BOOLEAN DEFAULT false
```

---

### 6.3 Professional Layer

```sql
-- work_experience
exp_id          UUID PK
user_id         UUID FK
title           TEXT
company         TEXT
location        TEXT
start_date      DATE
end_date        DATE            -- NULL = current
description     TEXT
created_at      TIMESTAMPTZ

-- skills
skill_id        SERIAL PK
name            TEXT UNIQUE

-- user_skills
user_id         UUID FK
skill_id        INT FK
PRIMARY KEY (user_id, skill_id)

-- certifications
cert_id         UUID PK
user_id         UUID FK
name            TEXT
issuer          TEXT
year            SMALLINT
```

---

### 6.4 Unified Content Table (Single Table Inheritance)

> **Design decision:** Instead of separate tables per content type (which require many LEFT JOINs in feed queries), we use one `content` table with a `content_type` discriminator. Type-specific fields live in a `meta` JSONB column. This keeps the table clean as new content types are added, avoids nullable column sprawl, and makes feed queries a single scan.

```sql
-- content (unified feed items)
content_id      UUID PK
network_id      UUID FK
group_id        UUID FK → groups   -- NULL if network-wide
content_type    ENUM(
                  'SOCIAL_POST',
                  'ANNOUNCEMENT',
                  'PDF_NOTICE',
                  'NEWSLETTER',
                  'EVENT',
                  'JOB'
                )
title           TEXT
body            TEXT
file_url        TEXT               -- for PDF_NOTICE, NEWSLETTER
preview_url     TEXT               -- thumbnail (generated by Trigger.dev task)
meta            JSONB              -- type-specific fields
                                   -- e.g. {apply_link, expires_at} for JOB
                                   -- e.g. {page_count, file_size} for PDF_NOTICE
search_vector   TSVECTOR           -- GIN indexed: title + body + PDF text
created_by      UUID FK → users
visibility      ENUM('public','network','group') DEFAULT 'network'
is_pinned       BOOLEAN DEFAULT false
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ

-- Indexes
CREATE INDEX idx_content_network_created ON content(network_id, created_at DESC);
CREATE INDEX idx_content_group ON content(group_id, created_at DESC) WHERE group_id IS NOT NULL;
CREATE INDEX idx_content_search ON content USING GIN(search_vector);
CREATE INDEX idx_content_type ON content(content_type, network_id);
```

**JSONB `meta` examples per type:**

| content_type  | meta fields                                                              |
| ------------- | ------------------------------------------------------------------------ |
| `JOB`         | `{ "apply_link": "...", "location": "...", "expires_at": "2026-08-01" }` |
| `PDF_NOTICE`  | `{ "page_count": 4, "file_size_kb": 320, "pdf_text": "..." }`            |
| `EVENT`       | `{ "event_date": "2026-06-15", "venue": "...", "rsvp_link": "..." }`     |
| `NEWSLETTER`  | `{ "edition": "May 2026", "recipient_count": 1200 }`                     |
| `SOCIAL_POST` | `{ "tags": ["#tpc-placement", "#grp-batch2020"] }`                       |

---

### 6.5 Social Layer

```sql
-- post_media (images attached to SOCIAL_POST content)
media_id        UUID PK
content_id      UUID FK → content
url             TEXT
media_type      ENUM('image','video')
display_order   SMALLINT
created_at      TIMESTAMPTZ

-- post_likes
user_id         UUID FK
content_id      UUID FK
created_at      TIMESTAMPTZ
PRIMARY KEY (user_id, content_id)

-- post_comments
comment_id      UUID PK
content_id      UUID FK
user_id         UUID FK
parent_id       UUID FK → post_comments   -- for nested replies
body            TEXT
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
```

---

### 6.6 Connections

```sql
-- follows (one-way)
follower_id     UUID FK
followee_id     UUID FK
created_at      TIMESTAMPTZ
PRIMARY KEY (follower_id, followee_id)

-- connection_requests
req_id          UUID PK
from_user       UUID FK
to_user         UUID FK
status          ENUM('pending','accepted','declined')
created_at      TIMESTAMPTZ

-- connections (mutual, accepted)
user_a          UUID FK
user_b          UUID FK
connected_at    TIMESTAMPTZ
PRIMARY KEY (user_a, user_b)  -- enforce user_a < user_b for uniqueness
```

---

### 6.7 Jobs System

> Jobs are stored primarily in `content` (type=`JOB`) for feed integration. The `jobs` table stores structured fields for filtering; it references `content_id`.

```sql
-- jobs (structured fields for filtering, references content)
job_id          UUID PK
content_id      UUID FK → content
posted_by       UUID FK → users
network_id      UUID FK
title           TEXT
description     TEXT
location        TEXT
apply_link      TEXT
tags            TEXT[]
expires_at      TIMESTAMPTZ        -- after this, job hidden from feed
created_at      TIMESTAMPTZ
```

---

### 6.8 Messaging

```sql
-- conversations
conv_id         UUID PK
is_group        BOOLEAN DEFAULT false
created_at      TIMESTAMPTZ

-- conversation_members
conv_id         UUID FK
user_id         UUID FK
role            ENUM('member','admin') DEFAULT 'member'
joined_at       TIMESTAMPTZ
PRIMARY KEY (conv_id, user_id)

-- messages (60-day retention via scheduled Trigger.dev cleanup task)
msg_id          UUID PK
conv_id         UUID FK
sender_id       UUID FK
body            TEXT
sent_at         TIMESTAMPTZ
expires_at      TIMESTAMPTZ        -- = sent_at + 60 days
is_deleted      BOOLEAN DEFAULT false

-- message_reads
msg_id          UUID FK
user_id         UUID FK
read_at         TIMESTAMPTZ
PRIMARY KEY (msg_id, user_id)
```

> **60-day retention:** A scheduled Trigger.dev task runs nightly to soft-delete (or hard-delete) messages where `expires_at < NOW()`. `is_deleted` flag is set; client shows "Message expired."

---

### 6.9 Groups

```sql
-- groups
group_id        UUID PK
network_id      UUID FK
name            TEXT
description     TEXT
is_private      BOOLEAN DEFAULT true
created_by      UUID FK
created_at      TIMESTAMPTZ

-- group_members
group_id        UUID FK
user_id         UUID FK
role            ENUM('member','moderator','admin') DEFAULT 'member'
joined_at       TIMESTAMPTZ
PRIMARY KEY (group_id, user_id)

-- group posts are CONTENT rows with group_id set and visibility='group'
```

---

### 6.10 Notifications

```sql
-- notifications
notif_id        UUID PK
user_id         UUID FK
type            ENUM(
                  'connection_request','connection_accepted',
                  'post_liked','post_commented','post_mentioned',
                  'group_added','new_message',
                  'account_verified','announcement'
                )
related_id      UUID               -- content_id, msg_id, user_id, etc.
message         TEXT               -- pre-rendered human-readable text
link            TEXT               -- deep link in app
read_at         TIMESTAMPTZ        -- NULL = unread
created_at      TIMESTAMPTZ

-- notification_prefs
user_id         UUID FK
notif_type      TEXT
channel         ENUM('in_app','push','email')
enabled         BOOLEAN DEFAULT true
PRIMARY KEY (user_id, notif_type, channel)
```

---

### 6.11 Geo Layer (Future-Ready)

```sql
-- user_locations
user_id         UUID FK PK
latitude        DOUBLE PRECISION
longitude       DOUBLE PRECISION
geom            GEOMETRY(Point, 4326)   -- PostGIS column for spatial queries
address_text    TEXT
updated_at      TIMESTAMPTZ

CREATE INDEX idx_user_locations_geom ON user_locations USING GIST(geom);
```

---

## 7. Authentication Workflow

### Registration Flow

```
1. User visits /register
2. Submits email + password
3. API: create user (status=unverified), send confirmation email (Trigger.dev task)
4. User clicks email link → email_verified = true
5. User selects network from predefined list
6. User selects role: student | alumni | faculty
7. User submits verification info → status = PENDING
8. Admin reviews → VERIFIED or REJECTED
9. On VERIFIED: welcome email sent, full access granted
```

### Security Requirements

- Passwords hashed with **Argon2id**
- JWTs: short-lived access token (15 min) + long-lived refresh token (30 days) stored in httpOnly cookie
- Rate limit login: max 10 attempts/15 min per IP
- All API routes require auth middleware
- Role-based guards: admin-only routes check `network_members.role`

---

## 8. Verification Workflow

### Methods

| Method          | Description                                                      |
| --------------- | ---------------------------------------------------------------- |
| Entry Number    | Alumni provide official entry number; admin cross-checks records |
| Document Upload | Upload degree certificate or transcript PDF                      |

### State Machine

```
PENDING → UNDER_REVIEW → VERIFIED
                       → REJECTED
```

### Pipeline (Corrected Order)

```
1. User submits entry number OR uploads document via API
2. If document upload:
   a. API receives file in memory (buffer)
   b. ⚠️  VIRUS SCAN FIRST (ClamAV / external AV API) — before any storage
   c. If scan fails → reject with error, do not store
   d. If scan passes → upload to R2 with private ACL
3. Create verification_request row (status=PENDING)
4. Trigger.dev task: notify network admins (in-app + email)
5. Admin opens Admin Panel → views pending queue
6. Admin examines document → clicks Approve or Reject
7. API:
   a. Updates network_members.status → VERIFIED or REJECTED
   b. Trigger.dev task: send email + push to user
   c. On VERIFIED: update educations.is_verified = true
8. If REJECTED: user can resubmit after 48h cooldown
```

> **Critical:** Virus scan MUST happen before R2 upload, not after. Storing then scanning creates a window where malicious files exist in storage.

### Verification API Examples

```http
POST /api/verification/submit
Content-Type: multipart/form-data
Body: { method: "document_upload", file: <PDF>, network_id: "uuid" }

POST /api/admin/verification/:req_id/approve
Body: { notes: "Documents verified." }
→ 200 { userId: "...", status: "VERIFIED" }

POST /api/admin/verification/:req_id/reject
Body: { reason: "Entry number mismatch." }
→ 200 { userId: "...", status: "REJECTED" }
```

---

## 9. Feed Workflow

### V1 Strategy: Fan-Out on Write

**Global feed** (network-wide): All content (posts, announcements, jobs, PDFs) is visible to the full network. New content is added to a Redis sorted set (score = `created_at` unix timestamp) keyed by network.

**Cold start handling:** When a new user joins or cache is empty:

1. Check Redis: `ZREVRANGE feed:network:{id} 0 19` — if empty or TTL expired
2. Fall back to Postgres: `SELECT * FROM content WHERE network_id = ? ORDER BY created_at DESC LIMIT 20`
3. Warm cache with result, set TTL

**Group feed:** Content with `group_id` set is served from a separate group-scoped endpoint.

### Feed Cache Keys

```
feed:network:{network_id}:page:{n}      TTL: 60s
feed:group:{group_id}:page:{n}          TTL: 60s
feed:user:{user_id}:personalized:page:{n}  TTL: 30s  (future)
```

### New Post Flow

```
1. User creates post via POST /api/posts
2. API validates and saves content row
3. API fires Trigger.dev tasks (fire-and-forget):
   a. feed.tasks.ts → invalidate/update feed cache for network
   b. notification.tasks.ts → notify @mentioned users
   c. (if PDF) pdf.tasks.ts → extract text, generate preview thumbnail
4. API returns 201 immediately (does not wait for tasks)
5. Trigger.dev tasks execute with auto-retry on failure
```

### Feed API

```http
GET /api/feed/global?cursor=<last_content_id>&limit=20
Response:
{
  "items": [
    {
      "content_id": "c123",
      "content_type": "SOCIAL_POST",
      "body": "Welcome seniors #tpc-education",
      "author": { "user_id": "u1", "full_name": "Priya S.", "headline": "SWE @ Google" },
      "created_at": "2026-05-17T10:00:00Z",
      "likes_count": 14,
      "comments_count": 3,
      "user_liked": true
    },
    {
      "content_id": "c124",
      "content_type": "PDF_NOTICE",
      "title": "Placement Brochure 2026",
      "file_url": "https://cdn.example.com/signed/...",
      "preview_url": "https://cdn.example.com/previews/c124.jpg",
      "meta": { "page_count": 8, "file_size_kb": 512 },
      "created_at": "2026-05-16T08:30:00Z"
    }
  ],
  "next_cursor": "c119",
  "has_more": true
}
```

> **Keyset pagination** (`cursor` = last `content_id`) is used instead of OFFSET. This prevents the "shifting results" problem and is far more efficient at scale.

### Tagging Conventions

| Syntax            | Meaning                           |
| ----------------- | --------------------------------- |
| `#tpc-<topic>`    | Topic tag (e.g. `#tpc-placement`) |
| `#grp-<groupTag>` | Group mention                     |
| `@username`       | User mention → notification       |

Tags are parsed at content creation time (posts, jobs, notices, etc.) and stored directly in the top-level, GIN-indexed `tags` array column on the `content` table. 

This architectural decision enables a unified, lightning-fast cross-context filter query when a user clicks a tag or topic. A single GIN-index-assisted query filters all visible posts:
- **Public** (`visibility = 'PUBLIC'`)
- **Network** (`visibility = 'NETWORK'` for the user's verified network)
- **Group** (`visibility = 'GROUP'` for any groups where the user is an active member)

Additionally, the PostgreSQL `tsvector` auto-update triggers index the `tags` array to make standard text search (e.g., searching for "placement" or "tpc-placement") instant.

---

## 10. Job System Workflow

Jobs are first-class content items but with extra structure for filtering and expiry.

```
1. POST /api/jobs with title, description, location, apply_link, tags, expires_at
2. API: create jobs row + content row (type=JOB, meta includes apply_link + expires_at)
3. Trigger.dev task: add to feed cache, optionally notify matching users (future)
4. Feed shows JOB card with "Apply" button → redirect to apply_link
5. Scheduled Trigger.dev task (nightly): set content.visibility = 'hidden' where job expires_at < NOW()
```

### Job API

```http
POST /api/jobs
{
  "title": "Full Stack Developer",
  "description": "...",
  "location": "Patiāla, IN",
  "apply_link": "https://company.com/apply/123",
  "tags": ["react", "node"],
  "expires_at": "2026-08-01T00:00:00Z"
}
→ 201 { "job_id": "...", "content_id": "...", "status": "CREATED" }
```

---

## 11. Connection System Workflow

### Two Models

| Model       | Direction               | Storage             | Permission            |
| ----------- | ----------------------- | ------------------- | --------------------- |
| **Follow**  | One-way                 | `follows` table     | Can see posts in feed |
| **Connect** | Mutual (request/accept) | `connections` table | Can DM each other     |

### Connection Request Flow

```
UserA → POST /api/connections/request { to: UserB }
  → DB: INSERT connection_requests (status=PENDING)
  → Trigger.dev: notify UserB in-app

UserB → POST /api/connections/accept { from: UserA }
  → DB: INSERT connections(min(A,B), max(A,B))
  → DB: DELETE connection_requests
  → Trigger.dev: notify UserA "UserB accepted your request"
  → Socket.IO: emit to UserA if online
```

> **Symmetry rule:** `connections` always stores `(user_a, user_b)` where `user_a < user_b` lexicographically. This prevents duplicate entries and simplifies lookup queries.

---

## 12. Messaging Architecture

### Scope (V1)

- Text-only messages
- 1:1 (between connected users) and group conversations
- Real-time delivery via Socket.IO
- 60-day message retention (enforced by nightly Trigger.dev task)
- Read receipts

### Real-Time Flow

```
1. UserA authenticates WebSocket connection (token validated on connect)
2. UserA emits: message.send { conv_id: "20", body: "Hello" }
3. Server:
   a. Validates UserA is member of conv 20
   b. Sanitizes body text
   c. INSERTs message row (expires_at = NOW() + 60 days)
   d. Publishes to Redis channel: chat:conv:20
4. All server instances subscribed to chat:conv:20 emit to their connected clients
5. UserB (online) receives: message.received { msg_id, body, sender, sent_at }
6. UserB emits: message.read { msg_id }
7. Server: INSERT message_reads, publish read_ack event
```

### Security

- Socket connection requires valid JWT in handshake `auth.token`
- Server enforces conversation membership before any emit
- All message bodies sanitized server-side (strip HTML, limit length)
- Only connected users (mutual `connections` row) can start 1:1 conversations

### Message Expiry (60-day cleanup)

```typescript
// tasks/messaging.tasks.ts
export const cleanExpiredMessages = task({
  id: 'clean-expired-messages',
  cron: '0 2 * * *', // 2am daily
  run: async () => {
    await db.messages.updateMany({
      where: { expires_at: { lt: new Date() }, is_deleted: false },
      data: { is_deleted: true, body: '[Message expired]' },
    });
  },
});
```

---

## 13. Search Architecture

### V1: PostgreSQL Full-Text Search

No external search infrastructure. Postgres FTS handles 200K users comfortably.

### Indexed Fields

```sql
-- profiles search vector (maintained via trigger or on write)
to_tsvector('english',
  coalesce(full_name, '') || ' ' ||
  coalesce(headline, '') || ' ' ||
  coalesce(city, '') || ' ' ||
  coalesce(bio, '')
)

-- content search vector
to_tsvector('english',
  coalesce(title, '') || ' ' ||
  coalesce(body, '') || ' ' ||
  coalesce(meta->>'pdf_text', '')  -- extracted PDF text
)
```

### Search API

```http
GET /api/search?type=users&q=computer+science&year=2020&city=Patiala
GET /api/search?type=content&q=placement+drive&content_type=PDF_NOTICE
```

### Filters Supported

- Users: `year`, `city`, `skills`, `degree`, `company`, `role` (student/alumni/faculty)
- Content: `content_type`, `network_id`, `group_id`, `date_range`
- Hashtag/topic filter: `tag=tpc-placement`

### Upgrade Path

- V1: Postgres FTS (GIN index on tsvector)
- V2: `pg_trgm` trigram indexes for fuzzy matching
- V3: OpenSearch / pgvector for semantic/embedding-based search

---

## 14. Notification System

### Event → Notification Mapping

| Event                       | In-App | Push | Email |
| --------------------------- | ------ | ---- | ----- |
| Connection request received | ✅     | ✅   | ❌    |
| Connection accepted         | ✅     | ✅   | ❌    |
| Post liked / commented      | ✅     | ❌   | ❌    |
| @mentioned in post          | ✅     | ✅   | ❌    |
| New DM received             | ✅     | ✅   | ❌    |
| Account verified            | ✅     | ✅   | ✅    |
| Account rejected            | ✅     | ✅   | ✅    |
| Admin announcement          | ✅     | ✅   | ✅    |
| Weekly newsletter           | ❌     | ❌   | ✅    |

### Trigger.dev Notification Task Example

```typescript
// tasks/notification.tasks.ts
export const sendNotification = task({
  id: 'send-notification',
  retry: { maxAttempts: 3, backoff: { type: 'exponential', base: 2 } },
  run: async (payload: {
    userId: string;
    type: NotifType;
    relatedId: string;
    message: string;
    link: string;
  }) => {
    // 1. Insert in-app notification row
    await db.notifications.create({ data: payload });

    // 2. Emit via Socket.IO if user is online
    await redisPublish(`user:${payload.userId}:notif`, payload);

    // 3. Send push if user opted in
    const prefs = await getUserNotifPrefs(payload.userId, payload.type);
    if (prefs.push) await pushService.send(payload.userId, payload.message);
    if (prefs.email) await emailService.sendNotifEmail(payload);
  },
});
```

### No SMS Policy

No SMS to control cost. Rely on push (FCM/Expo) + email (nodemailer).

---

## 15. AI Integration Architecture

### Phased Roadmap

| Phase | Feature                               | Tool                         |
| ----- | ------------------------------------- | ---------------------------- |
| V1    | PDF text extraction (no AI)           | `pdf-parse`, `pdfjs-dist`    |
| V2    | LinkedIn PDF parsing → profile fields | OpenAI / Ollama              |
| V2    | Post/profile summarization            | OpenAI GPT-4o-mini           |
| V3    | Semantic job matching                 | pgvector embeddings          |
| V3    | Semantic alumni search                | pgvector + cosine similarity |

### V1 PDF Pipeline (Trigger.dev Task)

```typescript
// tasks/pdf.tasks.ts
export const processPdfContent = task({
  id: 'process-pdf-content',
  retry: { maxAttempts: 3 },
  run: async ({
    contentId,
    fileUrl,
  }: {
    contentId: string;
    fileUrl: string;
  }) => {
    // 1. Download PDF from R2
    const buffer = await storageService.download(fileUrl);

    // 2. Extract text (pdf-parse for plain text)
    const { text, numpages } = await pdfParse(buffer);

    // 3. Generate preview thumbnail (first page → JPEG)
    const previewUrl = await generatePdfPreview(buffer, contentId);

    // 4. Update content row
    await db.content.update({
      where: { content_id: contentId },
      data: {
        preview_url: previewUrl,
        meta: { pdf_text: text.slice(0, 50000), page_count: numpages },
        search_vector: generateTsVector(title + ' ' + text),
      },
    });
  },
});
```

### PDF Library Selection Guide

| Library      | Use Case                      | Notes                         |
| ------------ | ----------------------------- | ----------------------------- |
| `pdf-parse`  | Plain text extraction         | Fastest, minimal dependencies |
| `pdfjs-dist` | Layout + images needed        | Heavy but complete            |
| `pdf2json`   | Structured JSON + coordinates | Use for form PDFs             |
| `pdfreader`  | Memory-constrained streaming  | Use for very large files      |

---

## 16. Geo Intelligence (Future)

### Data Model (Already in Schema)

User's `geom` column (PostGIS Point) populated when user enters location.

### Clustering Strategy

- **Client-side (V1 geo):** Load all alumni points from `/api/geo/points`, cluster using Mapbox Supercluster in browser. Feasible up to ~50K points.
- **Server-side (V2 geo):** Pre-clustered endpoint using PostGIS `ST_ClusterWithin` or `ST_ClusterDBSCAN`. Returns cluster counts for viewport bbox + zoom.

### Zoom Level Design

| Zoom  | Cluster Level           |
| ----- | ----------------------- |
| < 3   | Country                 |
| 3–6   | State                   |
| 7–10  | City / District         |
| 11–15 | Locality / Neighborhood |
| ≥ 16  | Individual markers      |

### Cluster API (V2)

```http
GET /api/geo/clusters?bbox=73.5,29.5,77.5,32.5&zoom=7
Response:
[
  { "type": "cluster", "count": 320, "lat": 30.34, "lng": 76.38 },
  { "type": "point", "user_id": "u1", "lat": 30.32, "lng": 76.41 }
]
```

---

## 17. Event-Driven Internal Architecture

All business-critical actions emit domain events. Trigger.dev tasks subscribe and react.

### Domain Events

| Event                 | Emitted By       | Trigger.dev Task                        |
| --------------------- | ---------------- | --------------------------------------- |
| `USER_VERIFIED`       | Verification API | Welcome email, update metrics           |
| `POST_CREATED`        | Feed API         | Invalidate feed cache, process mentions |
| `PDF_UPLOADED`        | Content API      | Extract text, generate preview          |
| `POST_LIKED`          | Social API       | Notification to post author             |
| `CONNECTION_ACCEPTED` | Connection API   | Notification to requester, enable DM    |
| `MESSAGE_SENT`        | Messaging        | Push if recipient offline               |
| `JOB_POSTED`          | Jobs API         | Feed cache update, future: match notify |
| `NEWSLETTER_CREATED`  | Admin API        | Bulk email send task                    |

### Event Flow Pattern

```typescript
// In API handler (fire-and-forget)
await triggerClient.sendEvent({
  name: 'POST_CREATED',
  payload: { contentId, networkId, authorId, tags },
});
// API returns 201 immediately — does not wait for task execution

// In Trigger.dev task
export const onPostCreated = eventTrigger({
  name: 'POST_CREATED',
  run: async (payload) => {
    await invalidateFeedCache(payload.networkId);
    await processMentions(payload.contentId, payload.authorId);
    if (payload.tags.includes('pdf')) {
      await processPdfContent.trigger({ contentId: payload.contentId });
    }
  },
});
```

### Benefits

- API stays fast — no synchronous email/notification blocking
- Trigger.dev dashboard shows every task execution, failure, and retry
- Adding new reactions (analytics, AI moderation) = new task, no API changes

---

## 18. Caching Strategy

### Redis Cache Keys & TTLs

| Cache            | Key Pattern                      | TTL           | Invalidated By          |
| ---------------- | -------------------------------- | ------------- | ----------------------- |
| Global feed page | `feed:network:{id}:page:{n}`     | 60s           | POST_CREATED event task |
| Group feed page  | `feed:group:{id}:page:{n}`       | 60s           | POST_CREATED in group   |
| Profile summary  | `profile:{user_id}`              | 600s          | Profile update          |
| Search results   | `search:{hash_of_params}`        | 300s          | TTL expiry only         |
| Network list     | `networks:all`                   | 3600s         | Manual invalidation     |
| Top hashtags     | `hashtags:trending:{network_id}` | 600s          | TTL expiry              |
| Session          | `session:{token_hash}`           | match JWT TTL | Logout                  |
| Rate limit       | `rl:{user_id}:{endpoint}`        | 60s           | TTL expiry              |

### Cache Stampede Prevention

Use Redis `SET NX EX` (set if not exists) as a lock when rebuilding a cache entry. Jitter TTLs by ±10% to prevent synchronized expiry storms.

```typescript
// Stale-while-revalidate pattern for feed
async function getFeedPage(networkId: string, page: number) {
  const cached = await redis.get(`feed:network:${networkId}:page:${page}`);
  if (cached) return JSON.parse(cached);

  // Acquire lock to prevent stampede
  const lock = await redis.set(
    `feed:lock:${networkId}:${page}`,
    '1',
    'NX',
    'EX',
    5,
  );
  if (!lock) {
    await sleep(100);
    return getFeedPage(networkId, page); // retry
  }

  const data = await db.content.findMany({
    /* ... */
  });
  const ttl = 60 + Math.floor(Math.random() * 12); // 60-72s jitter
  await redis.set(
    `feed:network:${networkId}:page:${page}`,
    JSON.stringify(data),
    'EX',
    ttl,
  );
  return data;
}
```

---

## 19. Security Architecture

### Authentication & Authorization

- JWT (access 15min + refresh 30d in httpOnly cookie)
- All routes: auth middleware validates token
- Admin routes: additional role check on `network_members`
- Connection-gated DMs: check `connections` table before allowing chat

### File Upload Security

```
1. Client uploads → API receives (multipart, max 10MB)
2. File type validation (magic bytes, not just extension)
3. ClamAV / AV API scan → REJECT if infected
4. Upload to R2 with private ACL
5. Client accesses via signed URL (15-min expiry)
6. Never serve uploaded files directly from public URL
```

### Input Validation

- Zod schemas on all API inputs (server-side)
- Prisma parameterized queries (no raw string interpolation)
- HTML sanitized from all user text (even text-only messaging)
- File names normalized before R2 storage (UUID-based keys)

### Additional Controls

- **CORS:** Whitelist only app domains
- **CSP headers:** Restrict inline scripts
- **Rate limiting:** Redis-backed per user + per IP
- **CSRF:** Not needed with JWT in Authorization header; if using cookies, add CSRF token
- **Logging:** Audit log for admin actions (approve/reject, newsletter send)

---

## 20. Network Provisioning & CLI Bootstrap

> No super-admin UI. Network creation and initial admin setup is done via CLI scripts run by developers. This is intentional: it keeps the attack surface small and provisioning rare.

### CLI Scripts

```bash
# Create a new university network
npx ts-node scripts/cli/seed-network.ts \
  --name "Punjab Technical University" \
  --code "PTU" \
  --domains "ptu.ac.in,lpu.in" \
  --logo "https://cdn.example.com/logos/ptu.png"

# Create initial admin user for a network
npx ts-node scripts/cli/seed-admin.ts \
  --network-code "PTU" \
  --email "tpo@ptu.ac.in" \
  --name "Dr. Sharma"
  # → prints temporary password, forces change on first login
```

### What CLI Does

```
seed-network.ts:
  → INSERT into networks
  → INSERT default notification_prefs for the network
  → Print network_id for reference

seed-admin.ts:
  → INSERT into users (email, temp_password_hash)
  → INSERT into profiles
  → INSERT into network_members (role=admin, status=verified)
  → Email admin their temporary password
  → Print confirmation
```

---

## 21. Scaling Strategy

### Phase 1 — MVP (0–10K users)

- Single VPS (4 CPU, 8GB RAM): Next.js + Postgres + Redis on same or adjacent nodes
- Trigger.dev Cloud (free/starter tier) for background tasks
- Cloudflare R2 for storage, Cloudflare CDN for assets
- Basic Redis caching for feed
- **Goal:** Ship all core features, verify product-market fit

### Phase 2 — Growth (10K–50K users)

- Separate Postgres onto a managed DB (Supabase, Railway, or Neon)
- Add Postgres read replica for feed/search queries
- Redis Cluster or managed Redis (Upstash)
- Trigger.dev cloud upgraded plan with higher concurrency
- CDN caching of API responses for public content
- **Goal:** Zero downtime, fast search, stable messaging

### Phase 3 — Scale (50K–200K users)

- Postgres connection pooling (PgBouncer)
- Possibly partition `content` table by `network_id`
- Move to Kubernetes (or similar) for autoscaling Next.js pods
- Trigger.dev self-hosted with horizontal worker scaling
- Consider OpenSearch for advanced search at this scale
- **Goal:** Handle peak loads (placement season, announcement blasts)

### Phase 4 — Beyond 200K

- Evaluate breaking messaging into a separate service (chat is stateful, scales differently)
- Kafka or Redis Streams for high-volume event bus
- Separate media service for video uploads (if added)
- True CDN video delivery (Cloudflare Stream)

---

## 22. Development Phases & Tracking

Each phase ends with a working, deployable milestone. Track task completion with checkboxes.

---

### Phase 1 — Foundation (Month 1)

_Goal: Working auth, network enrollment, and user profiles_

- [ ] Project scaffold (Next.js 14, Prisma, PostgreSQL, Redis, Trigger.dev setup)
- [ ] Environment config (`.env` schema, Zod config validation)
- [ ] CLI seed scripts (`seed-network.ts`, `seed-admin.ts`)
- [ ] Database schema: `users`, `profiles`, `networks`, `network_members`, `sessions`
- [ ] Auth module: register, email verify, login, JWT refresh, logout
- [ ] Network enrollment: list networks, select, assign role
- [ ] Verification module: submit entry number or document upload
- [ ] File upload service: R2 integration, virus scan, signed URL generation
- [ ] Admin panel: pending verifications queue, approve/reject UI
- [ ] Email service: confirmation email, verification outcome email
- [ ] Trigger.dev: welcome email task, verification notification task
- [ ] Basic profile page: view own profile
- [ ] **Milestone:** Admin can create a network via CLI, users can register and submit verification, admin can approve

---

### Phase 2 — Social Core (Month 2)

_Goal: Working feed, posts, follows, comments_

- [ ] Content table schema + migrations
- [ ] Post creation API (SOCIAL_POST type)
- [ ] Feed API: global feed with keyset pagination + cold-start fallback
- [ ] Feed cache: Redis sorted set per network, TTL + invalidation
- [ ] Post media: image upload (R2), attach to post
- [ ] Likes and comments API
- [ ] Hashtag/mention parsing on post creation
- [ ] Follow system: follow/unfollow, follower count
- [ ] @mention notifications (Trigger.dev task)
- [ ] Feed UI: infinite scroll, post card (text, image, PDF card stubs)
- [ ] Profile page: work experience, skills, education display
- [ ] Profile edit: update bio, headline, work, skills
- [ ] **Milestone:** Users can post, see global feed, follow others, like/comment

---

### Phase 3 — Professional Features (Month 3)

_Goal: Jobs module, enhanced search, admin analytics_

- [ ] Jobs table schema + migrations
- [ ] Job creation API + content row linking
- [ ] Job listing feed card UI
- [ ] Job expiry: scheduled Trigger.dev task (nightly cleanup)
- [ ] PostgreSQL FTS: `tsvector` columns on `profiles` + `content`
- [ ] GIN indexes on search columns
- [ ] Search API: user search + content search with filters
- [ ] Search UI: results page with filter sidebar
- [ ] Admin panel: analytics dashboard (user counts, post counts, verification stats)
- [ ] Admin: send network-wide announcement (creates ANNOUNCEMENT content row)
- [ ] Trigger.dev: newsletter creation task (bulk email)
- [ ] **Milestone:** Jobs visible in feed with expiry, search works across profiles and posts, admin can send announcements

---

### Phase 4 — Groups & Messaging (Month 4)

_Goal: Private groups and 1:1 text chat_

- [ ] Groups schema: `groups`, `group_members`
- [ ] Group creation, membership invite/join
- [ ] Group-scoped feed (content with group_id)
- [ ] Group feed UI (separate from global)
- [ ] Connections schema: `connection_requests`, `connections`
- [ ] Connection request flow (send, accept, decline)
- [ ] Messaging schema: `conversations`, `messages`, `message_reads`
- [ ] Socket.IO server setup with Redis adapter (multi-instance pub/sub)
- [ ] Chat API: create conversation, send message, load history
- [ ] Chat UI: conversation list, message thread, real-time delivery
- [ ] Read receipts: emit + store
- [ ] Message expiry: 60-day scheduled Trigger.dev cleanup task
- [ ] **Milestone:** Users can form groups, connect with others, and chat in real time

---

### Phase 5 — PDF & Polish (Month 5)

_Goal: PDF content in feed, UI polish, performance hardening_

- [ ] PDF upload API (PDF_NOTICE, NEWSLETTER types)
- [ ] Trigger.dev PDF processing task: extract text, update search_vector, generate preview
- [ ] PDF feed card UI: preview thumbnail, page count, download button
- [ ] Push notifications: FCM / Expo integration
- [ ] Full notification preference UI (toggle per type per channel)
- [ ] Profile photo upload (R2, signed URL)
- [ ] Mobile-responsive UI pass across all screens
- [ ] Performance audit: slow query log, add missing indexes
- [ ] Cache audit: verify TTLs and invalidation coverage
- [ ] Trigger.dev monitoring: review dashboard, add alerting
- [ ] **Milestone:** PDFs appear in feed with search, push notifications work, UI is mobile-ready

---

### Phase 6 — Launch & Hardening (Month 6)

_Goal: Security audit, load testing, go-live_

- [ ] Security audit: input validation, auth checks, file upload edge cases
- [ ] Rate limiting: implement per-endpoint limits in Redis
- [ ] Load testing: simulate 1,000 concurrent users on feed and search
- [ ] Error monitoring: Sentry or similar integration
- [ ] Backup strategy: Postgres daily snapshots, R2 versioning
- [ ] GDPR/privacy: data export endpoint, account deletion flow
- [ ] Onboarding flow: new user walkthrough (first post, first follow)
- [ ] SEO: meta tags for public profile pages
- [ ] **Launch:** First university network goes live
- [ ] Post-launch: monitor Trigger.dev dashboard for task failures, Redis memory, Postgres query times

---

### Future Backlog (Post-Launch)

- [ ] AI: LinkedIn PDF → profile field extraction (Trigger.dev + OpenAI)
- [ ] Semantic search (pgvector embeddings)
- [ ] Geo map: alumni density clustering (Supercluster)
- [ ] Job matching: notify users of relevant new jobs
- [ ] AI content moderation (spam detection)
- [ ] Mobile app (React Native / Expo) using same API
- [ ] Multi-language support
- [ ] Video/voice (Cloudflare Calls or Daily.co)

---

## Appendix: Key Design Decisions Summary

| Decision                  | Choice                                | Rationale                                                |
| ------------------------- | ------------------------------------- | -------------------------------------------------------- |
| Monolith vs microservices | Monolith                              | Speed of development, simpler ops at <200K scale         |
| Queue system              | Trigger.dev                           | Dashboard, retries, monitoring — not bare BullMQ         |
| Content table pattern     | Single Table Inheritance + JSONB meta | Clean feed queries; extensible without schema migrations |
| Pagination                | Keyset (cursor-based)                 | No offset drift; efficient at scale                      |
| PDF timing                | Virus scan BEFORE R2 upload           | Security: no malicious file window in storage            |
| Message retention         | 60-day soft delete via scheduled task | Cost + privacy balance                                   |
| Connections symmetry      | Store `(min, max)` pair               | Deduplication, simpler lookup queries                    |
| Network provisioning      | CLI only, no UI                       | Security: small attack surface, provisioning is rare     |
| Search infrastructure     | Postgres FTS (V1)                     | No extra infra; upgrade path to OpenSearch clear         |
| File access               | Signed URLs (15-min expiry)           | Private R2 bucket, no public file exposure               |
| Cold start cache          | DB fallback when Redis empty          | No empty feed on first load or cache miss                |
