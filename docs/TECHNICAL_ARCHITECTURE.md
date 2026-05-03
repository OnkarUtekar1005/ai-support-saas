# CRM of Techview — Technical Architecture Document

**Version:** 2.1.0
**Last Updated:** 2026-04-30
**Changelog:** See `CHANGELOG.md` for full details of every change

---

## 1. System Overview

CRM of Techview is a unified, multi-tenant SaaS platform that combines AI-powered support engineering with a full-featured CRM and automated error monitoring. It enables organizations to manage support tickets, interact with an AI assistant powered by Google Gemini, track customers through a sales pipeline, monitor application errors with AI root-cause analysis, and auto-fix bugs using Claude Code CLI.

### 1.1 Core Capabilities

| Module | Description |
|--------|-------------|
| **AI Support Engine** | Ticket analysis, knowledge base (RAG), safe SQL generation, AI chat |
| **CRM** | Multi-project management, contacts, companies, deal pipeline, activities |
| **Error Monitoring** | Error logging, Gemini-powered root-cause analysis, email alerts |
| **Multi-Tenancy** | Organization-scoped data, role-based access (Admin/Agent/Viewer) |

---

## 2. Technology Stack

### 2.1 Backend

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Runtime | Node.js 20+ | Server execution environment |
| Framework | Express.js 4.x | HTTP API framework |
| Language | TypeScript 5.6+ | Type-safe development |
| ORM | Prisma 6.x + `postgresqlExtensions` preview | Database access, migrations, schema management |
| Database | PostgreSQL 16 + **pgvector** | Primary data store + vector similarity search |
| Vector Search | pgvector `vector(768)` + IVFFlat index | RAG embeddings — DB-side cosine search (`<=>` operator) |
| AI Model | Google Gemini 2.5 Flash | Ticket analysis, chat, SQL generation, error analysis |
| AI Streaming | Gemini `generateContentStream()` + SSE | Real-time token streaming for chat |
| AI Observability | **Langfuse** (optional) | LLM trace, latency, token usage, cost per call |
| Embeddings | text-embedding-004 | RAG vector embeddings |
| Real-time | Socket.IO 4.x | WebSocket for live chat and ticket analysis |
| Auth | JWT access tokens (15min) + HttpOnly refresh cookies (7d) | Stateless auth with secure refresh |
| Cookies | cookie-parser | Parses HttpOnly refresh token cookies |
| Email | Nodemailer | SMTP email delivery |
| Logging | Winston | Structured file/console logging |
| SQL Safety | node-sql-parser + regex | Multi-layer query validation |
| Security | Helmet, CORS, express-rate-limit | HTTP hardening |
| Tests | Jest + ts-jest + Supertest | Unit + middleware tests (46 passing) |

### 2.2 Frontend

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Framework | React 18 | UI rendering |
| Build Tool | Vite 6 | Dev server and production bundler |
| Styling | Tailwind CSS 3.4 | Utility-first CSS |
| Routing | React Router 7 | Client-side navigation |
| **Server State** | **TanStack React Query v5** | API data fetching, caching, background sync |
| **Global State** | **Zustand v5** | Auth store with localStorage persistence |
| Icons | Lucide React | Icon library |
| Real-time | socket.io-client | WebSocket client |
| Language | TypeScript | Type-safe frontend |

### 2.3 Infrastructure

| Component | Technology |
|-----------|-----------|
| Containerization | Docker + Docker Compose |
| PostgreSQL Image | `pgvector/pgvector:pg16` (includes pgvector extension) |
| Reverse Proxy | Nginx (production) |
| Database Hosting | PostgreSQL (Docker or managed — must have pgvector) |
| Process Management | Node.js built-in (SIGTERM handling) |

---

## 3. Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                     FRONTEND (React + Vite)             │
│                                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │Dashboard │ │ Support  │ │   CRM    │ │   Admin   │  │
│  │          │ │Tickets   │ │Projects  │ │Error Logs │  │
│  │          │ │AI Chat   │ │Contacts  │ │Settings   │  │
│  │          │ │          │ │Companies │ │Email Cfg  │  │
│  │          │ │          │ │Deals     │ │Team Mgmt  │  │
│  │          │ │          │ │Activities│ │           │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────┘  │
│        │              │            │            │       │
│        └──────────────┴────────────┴────────────┘       │
│                  REST API  +  WebSocket                 │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────┐
│                   BACKEND (Express + TypeScript)         │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │                  MIDDLEWARE LAYER                    │ │
│  │  Helmet │ CORS │ Rate Limit │ JWT Auth │ Error Hdlr │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │ API ROUTES  │  │  WEBSOCKET   │  │  BACKGROUND    │  │
│  │             │  │              │  │                │  │
│  │ /auth       │  │ chat:message │  │ Error Analysis │  │
│  │ /tickets    │  │ ticket:      │  │ Email Alerts   │  │
│  │ /chat       │  │   analyze    │  │ Trend Reports  │  │
│  │ /projects   │  │ sql:generate │  │                │  │
│  │ /contacts   │  │              │  │                │  │
│  │ /companies  │  └──────────────┘  └────────────────┘  │
│  │ /deals      │                                        │
│  │ /activities │                                        │
│  │ /error-logs │                                        │
│  │ /admin      │                                        │
│  └─────────────┘                                        │
│                                                          │
│  ┌─────────────────────────────────────────────────────┐ │
│  │                  SERVICE LAYER                      │ │
│  │                                                     │ │
│  │  ┌─────────────┐  ┌──────────┐  ┌───────────────┐  │ │
│  │  │ AI Services │  │   SQL    │  │   Logging     │  │ │
│  │  │             │  │          │  │               │  │ │
│  │  │ GeminiClient│  │Connector │  │ ErrorLogger   │  │ │
│  │  │ Embeddings  │  │SafeGuard │  │ GeminiAnalyzer│  │ │
│  │  │ TaskAnalyzer│  │Executor  │  │ EmailService  │  │ │
│  │  │ SQLGenerator│  │          │  │               │  │ │
│  │  │ Resolution  │  │          │  │               │  │ │
│  │  └─────────────┘  └──────────┘  └───────────────┘  │ │
│  │                                                     │ │
│  │  ┌──────────────────────────────────────────────┐   │ │
│  │  │           RAG / Knowledge Base               │   │ │
│  │  │  VectorStore (cosine similarity search)      │   │ │
│  │  └──────────────────────────────────────────────┘   │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────┬───────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────┐
│                  PostgreSQL DATABASE                      │
│                                                          │
│  Organization ─┬─ Users          ─── ChatSessions        │
│                ├─ Tickets        ─── ChatMessages         │
│                ├─ SystemConfigs   ── Attachments          │
│                ├─ DatabaseConns   ── KnowledgeEntries     │
│                ├─ ErrorLogs       ── EmailSettings        │
│                ├─ Projects       ─── ProjectMembers       │
│                ├─ Contacts                                │
│                ├─ Companies                               │
│                ├─ Deals                                   │
│                └─ Activities                              │
└──────────────────────────────────────────────────────────┘
```

---

## 4. Database Schema

### 4.1 Entity Relationship Summary

```
Organization (tenant)
 ├── User (ADMIN | AGENT | VIEWER)
 │    ├── owns Deals
 │    ├── assigned Activities
 │    └── member of Projects
 │
 ├── SUPPORT MODULE
 │    ├── Ticket → Project?, Contact?
 │    │    ├── ChatSession → ChatMessage[]
 │    │    └── Attachment[]
 │    ├── SystemConfig (JSON blob)
 │    ├── DatabaseConnection
 │    ├── KnowledgeEntry (with embedding[])
 │    └── EmailSettings
 │
 ├── CRM MODULE
 │    ├── Project → ProjectMember[]
 │    │    ├── Contact[]
 │    │    ├── Company[]
 │    │    ├── Deal[]
 │    │    ├── Activity[]
 │    │    └── Ticket[]
 │    ├── Company → Contact[], Deal[], Activity[]
 │    ├── Contact → Deal[], Activity[], Ticket[]
 │    ├── Deal → Activity[]
 │    └── Activity
 │
 └── MONITORING MODULE
      └── ErrorLog (with aiAnalysis, aiSuggestion)
```

### 4.2 Key Models

| Model | Records | Key Fields |
|-------|---------|------------|
| **Organization** | Tenant root | name, slug, plan (FREE/PRO/ENTERPRISE) |
| **User** | Auth + identity | email, passwordHash, role |
| **Ticket** | Support tickets | title, description, status, priority, analysis (JSON), resolution, projectId, contactId |
| **Project** | CRM grouping | name, status, color |
| **Contact** | People | firstName, lastName, email, phone, status (LEAD/ACTIVE/CUSTOMER/CHURNED) |
| **Company** | Accounts | name, domain, industry, size |
| **Deal** | Sales pipeline | title, value, currency, stage (LEAD→CLOSED_WON), probability |
| **Activity** | Tasks/events | type (CALL/EMAIL/MEETING/TASK/NOTE/FOLLOW_UP), subject, dueDate, status |
| **ErrorLog** | Error tracking | level, message, stack, source, aiAnalysis, aiSuggestion, emailSent |

### 4.3 Indexes

| Table | Index | Purpose |
|-------|-------|---------|
| ErrorLog | (organizationId, createdAt) | Paginated org log queries |
| ErrorLog | (level) | Filter by severity |
| ErrorLog | (analyzed) | Find unanalyzed errors |
| Deal | (stage) | Pipeline grouping |
| Activity | (dueDate) | Overdue detection |
| Contact | (companyId) | Company drill-down |
| All CRM | (organizationId) | Tenant isolation |
| All CRM | (projectId) | Project filtering |

---

## 5. API Reference

### 5.1 Authentication

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/auth/register` | Create org + admin user | No |
| POST | `/api/auth/login` | Login, returns JWT | No |
| GET | `/api/auth/me` | Get current user + org | Yes |
| POST | `/api/auth/invite` | Invite user to org | Admin |

**Token format:** `Authorization: Bearer <jwt>`
**Token payload:** `{ userId: string }`
**Expiry:** Configurable (default 7 days)

### 5.2 Support APIs

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/tickets` | List tickets (paginated, filterable) | Yes |
| POST | `/api/tickets` | Create + AI analyze ticket | Yes |
| GET | `/api/tickets/:id` | Get ticket with chat/attachments | Yes |
| PATCH | `/api/tickets/:id` | Update status/priority | Yes |
| POST | `/api/chat/sessions` | Create chat session | Yes |
| GET | `/api/chat/sessions` | List user's sessions | Yes |
| GET | `/api/chat/sessions/:id/messages` | Get messages | Yes |
| POST | `/api/chat/sessions/:id/messages` | Send message (REST) | Yes |
| GET | `/api/db-connections` | List DB connections | Yes |
| POST | `/api/db-connections` | Add + test DB connection | Admin |
| POST | `/api/db-connections/:id/query` | Execute safe SQL | Yes |
| POST | `/api/db-connections/:id/generate-sql` | AI SQL generation | Yes |
| GET/POST | `/api/system-config/*` | System config CRUD + knowledge base | Yes |

### 5.3 CRM APIs

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/projects` | List projects with counts | Yes |
| POST | `/api/projects` | Create project | Yes |
| GET | `/api/projects/:id` | Get project + pipeline summary | Yes |
| PATCH | `/api/projects/:id` | Update project | Yes |
| POST | `/api/projects/:id/members` | Add team member | Yes |
| DELETE | `/api/projects/:id/members/:userId` | Remove member | Yes |
| GET | `/api/contacts?projectId=&search=&status=` | List contacts (filterable) | Yes |
| POST | `/api/contacts` | Create contact | Yes |
| GET | `/api/contacts/:id` | Contact + deals/activities/tickets | Yes |
| PATCH | `/api/contacts/:id` | Update contact | Yes |
| GET | `/api/companies?projectId=&search=` | List companies | Yes |
| POST | `/api/companies` | Create company | Yes |
| GET | `/api/companies/:id` | Company + contacts/deals | Yes |
| GET | `/api/deals?projectId=&stage=&ownerId=` | List deals | Yes |
| GET | `/api/deals/pipeline?projectId=` | Pipeline board data | Yes |
| POST | `/api/deals` | Create deal | Yes |
| PATCH | `/api/deals/:id` | Update deal/move stage | Yes |
| GET | `/api/activities?projectId=&status=&type=` | List activities | Yes |
| POST | `/api/activities` | Create activity | Yes |
| PATCH | `/api/activities/:id` | Update/complete activity | Yes |

### 5.4 Admin / Monitoring APIs

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/error-logs?level=&analyzed=` | List error logs | Admin |
| GET | `/api/error-logs/stats` | Error statistics (24h, 7d, by level) | Admin |
| GET | `/api/error-logs/:id` | Single error log detail | Admin |
| POST | `/api/error-logs/:id/reanalyze` | Re-run Gemini analysis | Admin |
| POST | `/api/error-logs/trend-analysis` | AI trend analysis | Admin |
| GET | `/api/admin/users` | List org users | Admin |
| PATCH | `/api/admin/users/:id/role` | Change user role | Admin |
| GET | `/api/admin/email-settings` | Get email config | Admin |
| PUT | `/api/admin/email-settings` | Update email config | Admin |
| GET | `/api/admin/dashboard` | Dashboard stats | Admin |

### 5.5 WebSocket Events

**Client → Server:**

| Event | Payload | Description |
|-------|---------|-------------|
| `chat:message` | `{ sessionId, content }` | Send chat message |
| `ticket:analyze` | `{ ticketId, description }` | Trigger real-time ticket analysis |
| `sql:generate` | `{ request, schemaContext? }` | Generate SQL query |

**Server → Client:**

| Event | Payload | Description |
|-------|---------|-------------|
| `chat:typing` | `{ sessionId }` | AI is generating response |
| `chat:response` | `{ sessionId, message }` | AI response received |
| `chat:error` | `{ error }` | Chat error |
| `ticket:step` | `{ ticketId, step, message }` | Analysis progress |
| `ticket:analysis` | `{ ticketId, analysis }` | Analysis complete |
| `ticket:similarCases` | `{ ticketId, similarCases }` | RAG results |
| `ticket:resolution` | `{ ticketId, resolution }` | Resolution generated |
| `ticket:needsClarification` | `{ ticketId, questions }` | Low confidence |
| `sql:proposal` | `{ query, explanation, safe }` | Generated SQL |

---

## 6. AI Services Architecture

### 6.1 Gemini Integration

```
GeminiClient (gemini-2.5-flash)
 ├── LRU Response Cache (SHA-256 keyed, 60min TTL, 200 entries)
 ├── Exponential Backoff Retry (3 attempts, rate-limit aware)
 └── Used by:
      ├── TaskAnalyzer → ticket analysis (JSON output)
      ├── SqlQueryGenerator → natural language to SQL
      ├── ResolutionEngine → root cause + fix steps
      ├── GeminiLogAnalyzer → error root cause analysis
      └── Chat (conversation continuation)

GeminiEmbeddings (text-embedding-004)
 └── Used by:
      └── VectorStore → knowledge base embeddings
```

### 6.2 AI-Powered Ticket Pipeline

```
Ticket Input
    │
    ▼
TaskAnalyzer ──→ { issueType, confidence, entities, sqlNeeded }
    │
    ├─ confidence < 0.8 ──→ Ask clarification questions
    │
    ├─ Search knowledge base (cosine similarity)
    │
    ├─ if sqlNeeded ──→ SqlQueryGenerator ──→ SafetyGuard ──→ User approves ──→ Execute
    │
    └─ ResolutionEngine ──→ Root cause + Fix steps + Prevention
```

### 6.3 Error Analysis Pipeline

```
Application Error
    │
    ▼
ErrorLogger
    ├── 1. Winston (file: logs/error.log)
    ├── 2. PostgreSQL (ErrorLog table)
    ├── 3. GeminiLogAnalyzer (async)
    │       └── Returns: { rootCause, suggestion, severity, category }
    │       └── Updates: ErrorLog.aiAnalysis, ErrorLog.aiSuggestion
    └── 4. EmailService (if org has email settings configured)
            └── Sends HTML email with error + AI analysis to admin team
```

### 6.4 SQL Safety (Defense in Depth)

```
Query Input
    │
    ▼
Layer 1: Must start with SELECT or WITH
    │
Layer 2: Blocked keyword scan (25+ keywords: DELETE, UPDATE, DROP, EXEC, etc.)
    │
Layer 3: Dangerous pattern regex (injection, UNION attacks, SLEEP, WAITFOR, etc.)
    │
Layer 4: User approval required before execution
    │
Layer 5: Result masking (password, SSN, credit_card columns → ***MASKED***)
    │
    ▼
Safe execution with row limit (default 1000)
```

---

## 7. Security

### 7.1 Authentication & Authorization

- **Password hashing:** bcrypt with 12 salt rounds
- **JWT tokens:** Configurable secret + expiry
- **Role-based access:** `ADMIN`, `AGENT`, `VIEWER` enforced at route level
- **Tenant isolation:** All queries scoped by `organizationId`

### 7.2 API Security

- **Helmet:** Security headers (X-Content-Type-Options, X-Frame-Options, etc.)
- **CORS:** Configured origin whitelist
- **Rate limiting:** 200 requests per 15-minute window
- **Request size limit:** 10MB max JSON body
- **Input sanitization:** Sensitive fields redacted in error logs (password, token, apiKey)

### 7.3 Data Security

- **SQL injection prevention:** Multi-layer query validation (see 6.4)
- **Sensitive column masking:** Query results mask password/SSN/credit card columns
- **Database credentials:** Stored encrypted (passwordEnc field)
- **No inline secrets:** All secrets via environment variables

---

## 8. Multi-Tenancy Model

```
┌──────────────────────────────┐
│        Organization          │
│  (plan: FREE/PRO/ENTERPRISE) │
├──────────────────────────────┤
│                              │
│  All data is scoped by       │
│  organizationId foreign key  │
│                              │
│  ┌─────────┐  ┌─────────┐   │
│  │ Users   │  │ Projects│   │
│  │ Tickets │  │ Contacts│   │
│  │ Configs │  │ Companies│  │
│  │ Errors  │  │ Deals   │   │
│  │ KB/RAG  │  │ Activity│   │
│  └─────────┘  └─────────┘   │
│                              │
│  Email settings: per-org     │
│  DB connections: per-org     │
│  System configs: per-org     │
└──────────────────────────────┘
```

Every database query includes a `WHERE organizationId = ?` clause, ensuring complete data isolation between tenants.

---

## 9. Frontend Architecture

### 9.1 Page Map

```
/login                  → LoginPage (public)
/register               → RegisterPage (public)
/                       → DashboardPage (stats overview)
│
├── SUPPORT
│   ├── /tickets        → TicketsPage (list + create modal)
│   ├── /tickets/:id    → TicketDetailPage (analysis, resolution, chat)
│   └── /chat           → ChatPage (WebSocket real-time AI chat)
│
├── CRM
│   ├── /projects       → ProjectsPage (card grid)
│   ├── /projects/:id   → ProjectDetailPage (stats, pipeline, members)
│   ├── /contacts       → ContactsPage (table + detail slide-over)
│   ├── /companies      → CompaniesPage (card grid)
│   ├── /deals          → DealsPage (Kanban pipeline board)
│   └── /activities     → ActivitiesPage (task list with toggle)
│
└── ADMIN (admin-only)
    ├── /error-logs     → ErrorLogsPage (logs + AI analysis + trend)
    └── /settings       → SettingsPage (email config, team management)
```

### 9.2 State Management

- **Auth:** React Context (`useAuth` hook) — user, org, token, login/logout
- **API calls:** Centralized `api` service with JWT auto-injection
- **Real-time:** Socket.IO client singleton with token auth
- **Local state:** `useState` per page (no global store needed)

---

## 10. Deployment Architecture

### 10.1 Docker Compose (Development/Staging)

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   client    │    │   server    │    │  postgres   │
│  (nginx:80) │───▶│ (node:3001) │───▶│   (:5432)   │
│  React SPA  │    │ Express API │    │  PostgreSQL │
└─────────────┘    └─────────────┘    └─────────────┘
       │                  │
       │    /api/* ───────┘
       │    /socket.io/* ─┘
```

### 10.2 Production Considerations

| Concern | Recommendation |
|---------|----------------|
| Database | Managed PostgreSQL (AWS RDS, Azure SQL, Supabase) |
| Hosting | Container service (ECS, Cloud Run, Railway) |
| CDN | CloudFront/Cloudflare for static assets |
| SSL | Let's Encrypt or managed certificates |
| Secrets | AWS Secrets Manager / Azure Key Vault |
| Monitoring | Existing error logging + external APM |
| Scaling | Horizontal pod scaling for server, read replicas for DB |
| Backups | Automated daily DB backups |

---

## 11. File Structure

```
ai-support-saas/
├── docker-compose.yml
├── package.json                    # Root workspace scripts
├── .gitignore
│
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   ├── .env.example
│   │
│   ├── prisma/
│   │   ├── schema.prisma           # 20 models, full schema
│   │   └── seed.ts                 # Demo org + users + config
│   │
│   └── src/
│       ├── index.ts                # Express + Socket.IO entry
│       ├── config/
│       │   └── index.ts            # Environment config
│       ├── middleware/
│       │   ├── auth.ts             # JWT auth + role guard
│       │   └── errorHandler.ts     # Global error → Gemini analysis
│       ├── controllers/
│       │   └── socketController.ts # WebSocket event handlers
│       ├── routes/
│       │   ├── auth.ts             # Register, login, invite
│       │   ├── tickets.ts          # CRUD + AI analysis
│       │   ├── chat.ts             # Sessions + messages
│       │   ├── dbConnections.ts    # SQL connections + queries
│       │   ├── errorLogs.ts        # Error log management
│       │   ├── admin.ts            # Users, email, dashboard
│       │   ├── systemConfig.ts     # System config + RAG
│       │   ├── projects.ts         # CRM: Projects
│       │   ├── contacts.ts         # CRM: Contacts
│       │   ├── companies.ts        # CRM: Companies
│       │   ├── deals.ts            # CRM: Deals + pipeline
│       │   └── activities.ts       # CRM: Activities
│       ├── services/
│       │   ├── ai/
│       │   │   ├── GeminiClient.ts       # API + cache + retry
│       │   │   ├── GeminiEmbeddings.ts   # text-embedding-004
│       │   │   ├── GeminiLogAnalyzer.ts  # Error root-cause AI
│       │   │   ├── TaskAnalyzer.ts       # Ticket analysis
│       │   │   ├── SqlQueryGenerator.ts  # NL → SQL
│       │   │   └── ResolutionEngine.ts   # Resolution generation
│       │   ├── sql/
│       │   │   ├── SqlConnector.ts       # MSSQL connection pool
│       │   │   └── SqlSafetyGuard.ts     # Multi-layer validation
│       │   ├── rag/
│       │   │   └── VectorStore.ts        # Embedding search
│       │   ├── logging/
│       │   │   └── ErrorLogger.ts        # Error capture pipeline
│       │   └── email/
│       │       └── EmailService.ts       # SMTP alerts + digests
│       ├── types/                        # (extensible)
│       └── utils/
│           └── prisma.ts                 # Prisma client singleton
│
├── client/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── index.html
│   │
│   └── src/
│       ├── main.tsx                # React entry
│       ├── App.tsx                 # Router + routes
│       ├── styles/
│       │   └── index.css           # Tailwind + custom classes
│       ├── hooks/
│       │   └── useAuth.tsx         # Auth context + provider
│       ├── services/
│       │   ├── api.ts              # REST API client (50+ methods)
│       │   └── socket.ts           # Socket.IO client singleton
│       ├── components/
│       │   └── layout/
│       │       └── AppLayout.tsx   # Sidebar + main area
│       └── pages/
│           ├── LoginPage.tsx
│           ├── RegisterPage.tsx
│           ├── DashboardPage.tsx
│           ├── TicketsPage.tsx
│           ├── TicketDetailPage.tsx
│           ├── ChatPage.tsx
│           ├── ProjectsPage.tsx
│           ├── ProjectDetailPage.tsx
│           ├── ContactsPage.tsx
│           ├── CompaniesPage.tsx
│           ├── DealsPage.tsx
│           ├── ActivitiesPage.tsx
│           ├── ErrorLogsPage.tsx
│           └── SettingsPage.tsx
│
├── shared/                         # (future: shared types)
└── docs/
    ├── TECHNICAL_ARCHITECTURE.md   # This document
    └── STARTUP_GUIDE.md            # Setup & run guide
```

---

## 12. Data Flows

### 12.1 Ticket Creation Flow

```
User submits ticket (title + description)
    │
    ▼
POST /api/tickets
    │
    ├── 1. Save ticket to DB (status: OPEN)
    ├── 2. TaskAnalyzer.analyze() → Gemini extracts entities, confidence
    ├── 3. VectorStore.search() → find similar past cases
    ├── 4. Update ticket with analysis + suggested priority
    │
    ├── if confidence >= 0.8:
    │       ResolutionEngine.generateResolution()
    │       Update ticket (status: RESOLVED, resolution text)
    │
    └── if confidence < 0.8:
            Update ticket (status: WAITING_CLARIFICATION)
            Return clarification questions
```

### 12.2 Error Monitoring Flow

```
Application error occurs (any route, any service)
    │
    ▼
errorHandler middleware catches it
    │
    ▼
ErrorLogger.logError()
    ├── 1. Winston → logs/error.log (immediate)
    ├── 2. PostgreSQL → ErrorLog record (immediate)
    │
    └── 3. If ERROR or FATAL (async, non-blocking):
            ├── GeminiLogAnalyzer.analyzeError()
            │   └── Returns { rootCause, suggestion, severity, category }
            │   └── Updates ErrorLog with AI fields
            │
            └── EmailService.sendErrorAlert()
                └── HTML email to admin team with:
                    - Error details
                    - AI root cause analysis
                    - Suggested fix
```

### 12.3 Deal Pipeline Flow

```
GET /api/deals/pipeline?projectId=xxx
    │
    ▼
For each stage (LEAD → QUALIFIED → PROPOSAL → NEGOTIATION → WON → LOST):
    Query deals WHERE stage = X, org = Y, project = Z
    Calculate total value per stage
    │
    ▼
Returns: [{ stage, deals[], count, totalValue }]
    │
    ▼
Frontend renders Kanban board
    │
    ▼
Stage move: PATCH /api/deals/:id { stage: "QUALIFIED" }
    If CLOSED_WON or CLOSED_LOST → sets closedAt timestamp
```

---

## 13. Performance Considerations

| Area | Strategy |
|------|----------|
| **AI API calls** | LRU cache (200 entries, 60min TTL), exponential backoff retry |
| **Database queries** | Prisma query batching, strategic indexes, pagination |
| **Real-time chat** | WebSocket (no polling), conversation history limited to 20 messages |
| **Error analysis** | Async/non-blocking (doesn't slow down error response) |
| **Frontend** | Vite code splitting, Tailwind CSS purging, lazy loading |
| **SQL execution** | Connection pooling (2-50 connections), row limit (1000) |

---

## 14. How Error Logs Stream Into the CRM

### 14.1 Complete Flow — External App to CRM Dashboard

```
YOUR APPLICATION (Website / Mobile / Server)
│
│  Errors happen naturally or are caught
│
├── AUTO-CAPTURED (Web SDK)
│   <script src="crm.com/sdk.js?key=sk_live_xxx"></script>
│   SDK listens to window.onerror + unhandledrejection
│   Sends via navigator.sendBeacon (survives page unload)
│
├── MANUALLY SENT (Backend / Mobile)
│   POST /api/sdk/error
│   Headers: { x-api-key: sk_live_xxx }
│   Body: { message, stack, source, level, endpoint }
│
└── CRM INTERNAL ERRORS
    Express errorHandler middleware catches any crash
    Route-level try/catch blocks
│
▼
┌─────────────────────────────────────────────────────────┐
│  API KEY MIDDLEWARE (apiKeyAuth.ts)                       │
│                                                          │
│  1. Extract key from x-api-key header or ?_key= param    │
│  2. Lookup in DB: SELECT * FROM ApiKey WHERE key = ?      │
│  3. Validate: is key active? is origin allowed?           │
│  4. Extract: organizationId + projectId + permissions     │
│  5. Attach to request: req.apiKey = { org, project, ... } │
│  6. Increment usage counter (non-blocking)                │
│                                                          │
│  The API key IS the identity:                            │
│  ┌──────────────────────────────────────────┐            │
│  │ sk_live_abc123...                        │            │
│  │ ├── organizationId: "techviewai-org-uuid"      │            │
│  │ ├── projectId: "billing-project-uuid"    │            │
│  │ ├── permissions: ["errors","contacts"]   │            │
│  │ └── allowedOrigins: ["https://myapp.com"]│            │
│  └──────────────────────────────────────────┘            │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  SDK ERROR ROUTE (routes/sdk.ts)                         │
│                                                          │
│  POST /api/sdk/error                                     │
│  1. Check permission: requirePermission('errors')        │
│  2. Call ErrorLogger.logError({                          │
│       level, message, stack, source,                     │
│       organizationId: req.apiKey.organizationId,  ←──── from key │
│       projectId: req.apiKey.projectId,            ←──── from key │
│     })                                                   │
│  3. Also save as SdkEvent for analytics                  │
│  4. Return { ok: true, errorId }                         │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  ERROR LOGGER (services/logging/ErrorLogger.ts)          │
│                                                          │
│  STEP 1: WINSTON — Immediate file logging                │
│  ├── logs/error.log (ERROR+ only)                        │
│  ├── logs/combined.log (all levels)                      │
│  └── Console output (dev mode only)                      │
│  This happens SYNCHRONOUSLY — even if DB is down         │
│                                                          │
│  STEP 2: DATABASE — Immediate insert                     │
│  INSERT INTO "ErrorLog" (                                │
│    level, message, stack, source, category,              │
│    endpoint, userId, projectId, organizationId           │
│  )                                                       │
│  → Now visible on CRM Error Logs page                    │
│  → Filterable by project, category, level                │
│  → Searchable by AI Assistant                            │
│                                                          │
│  STEP 3: GEMINI AI — Async (non-blocking)                │
│  Only for ERROR and FATAL levels:                        │
│  ├── Sends error to Gemini 2.5 Flash                     │
│  ├── Prompt: "Analyze this error, give root cause + fix" │
│  ├── Returns: { rootCause, suggestion, severity }        │
│  └── Updates ErrorLog: aiAnalysis, aiSuggestion          │
│  This runs in background — doesn't delay the response    │
│                                                          │
│  STEP 4: EMAIL ALERT — Async (conditional)               │
│  Only if org has email configured AND level matches:     │
│  ├── ERROR → send if notifyOnError = true                │
│  ├── FATAL → send if notifyOnFatal = true                │
│  └── Sends HTML email to all adminEmails with:           │
│      - Error message + stack trace                       │
│      - AI root cause analysis                            │
│      - AI suggested fix                                  │
│      - Marks ErrorLog.emailSent = true                   │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  CRM DASHBOARD — Error Logs Page                         │
│                                                          │
│  Filters:                                                │
│  ├── Level: INFO | WARN | ERROR | FATAL                  │
│  ├── Category: database | api | auth | cors | timeout    │
│  │             code | network | email | memory           │
│  │             validation | frontend | disk               │
│  ├── Project: filter by which system generated it        │
│  └── Analyzed: show only AI-analyzed or pending          │
│                                                          │
│  Each error shows:                                       │
│  ├── Level badge (color-coded)                           │
│  ├── Category badge                                      │
│  ├── Project color dot + name                            │
│  ├── Expandable: stack trace, AI analysis, suggestion    │
│  ├── "Analyze with AI" button (for unanalyzed)           │
│  └── "Auto-Fix with Claude Code" button (purple)         │
│                                                          │
│  Admin actions:                                          │
│  ├── Re-analyze any error with Gemini                    │
│  ├── Run AI Trend Analysis across recent errors          │
│  └── Trigger Auto-Fix Pipeline                           │
└─────────────────────────────────────────────────────────┘
```

### 14.2 Error Categories

| Category | What Gets Logged | Typical Source |
|----------|-----------------|----------------|
| `database` | Connection failures, query timeouts, constraint violations, missing tables | SqlConnector, PrismaORM, PostgreSQL |
| `api` | Rate limits (429), webhook failures, slow responses, malformed responses | GeminiClient, RateLimiter, WebhookService |
| `auth` | JWT expired, invalid API keys, brute force attempts, failed logins | AuthMiddleware, ApiKeyAuth |
| `cors` | Blocked cross-origin requests from unauthorized domains | CorsMiddleware |
| `timeout` | Request timeouts, socket handshake failures, query timeouts | TimeoutMiddleware, SocketIO |
| `code` | TypeError, SyntaxError, RangeError, null reference, stack overflow | Any source file |
| `network` | ECONNREFUSED, ETIMEDOUT, DNS resolution failures | CacheService, PaymentService |
| `email` | SMTP auth failures, delivery throttling, connection errors | EmailService |
| `memory` | Heap out of memory, allocation failures | VectorStore, batch processors |
| `validation` | Missing required fields, invalid values, type mismatches | ValidationMiddleware |
| `frontend` | Uncaught JS errors, unhandled promise rejections (from SDK) | sdk-web, widget |
| `disk` | No space left on device, file write failures | WinstonLogger |

### 14.3 Multi-App Error Isolation

Each application connects with its own API key scoped to a project:

```
App 1: Billing Platform          App 2: Mobile App            App 3: Admin Portal
  │                                │                            │
  │ key=sk_live_aaa               │ key=sk_live_bbb            │ key=sk_live_ccc
  │ project=Billing               │ project=Mobile             │ project=Admin
  │                                │                            │
  ▼                                ▼                            ▼
┌──────────────────────────────────────────────────────────────────┐
│                        CRM of Techview                          │
│                                                                  │
│  ErrorLog table:                                                 │
│  ┌──────┬────────────────────┬────────────┬──────────┐          │
│  │Level │ Message            │ Project    │ Category │          │
│  ├──────┼────────────────────┼────────────┼──────────┤          │
│  │ERROR │ Redis ECONNREFUSED │ Billing    │ network  │          │
│  │FATAL │ OOM crash          │ Mobile     │ memory   │          │
│  │WARN  │ Slow API 4.8s      │ Admin      │ api      │          │
│  │ERROR │ JWT expired        │ (system)   │ auth     │          │
│  └──────┴────────────────────┴────────────┴──────────┘          │
│                                                                  │
│  Admin filters by project → sees only that system's errors      │
│  SUPER_ADMIN sees all | Project ADMIN sees only their projects  │
└──────────────────────────────────────────────────────────────────┘
```

### 14.4 JavaScript SDK Auto-Capture (sdk.js)

When loaded via `<script src="crm.com/sdk.js?key=xxx">`, the SDK automatically:

```javascript
// 1. Captures all uncaught JavaScript errors
window.addEventListener('error', function(event) {
  send('/error', {
    message: event.message,
    stack: event.error ? event.error.stack : 'at ' + event.filename + ':' + event.lineno,
    source: 'window.onerror',
    level: 'ERROR'
  });
});

// 2. Captures unhandled Promise rejections
window.addEventListener('unhandledrejection', function(event) {
  send('/error', {
    message: event.reason.message || String(event.reason),
    stack: event.reason.stack,
    source: 'unhandledrejection',
    level: 'ERROR'
  });
});

// 3. Tracks page views (including SPA navigation)
AiCRM.pageview();  // on load
history.pushState = intercepted; // on SPA route change
window.addEventListener('popstate', ...); // on back/forward

// 4. Uses navigator.sendBeacon for reliable delivery
// (survives page unload — errors are never lost)
```

**No code needed** — just add the script tag and errors flow automatically.

---

## 15. Auto-Fix Pipeline (Claude Code Integration)

### 15.1 Architecture

```
Error in CRM Error Logs
     │
     ▼
Admin clicks "Auto-Fix with Claude Code"
     │
     ▼
┌────────────────────────────────────┐
│  CRM Server (pipeline.ts)          │
│  1. Creates Pipeline record        │
│  2. Builds Claude Code prompt      │
│  3. Links to VPS Agent             │
│  4. Status: DETECTED → ANALYZING   │
└────────────────┬───────────────────┘
                 │
                 │  Agent polls every 30s
                 ▼
┌────────────────────────────────────┐
│  VPS Agent (agent.js on VPS)       │
│                                    │
│  POST /api/agent-webhook/heartbeat │
│  Headers: { x-agent-key: vps_xxx } │
│  Response: { pendingPipelines }    │
│                                    │
│  For each pending pipeline:        │
│  ├── ANALYZING → run claude CLI    │
│  │   claude --print                │
│  │     --dangerously-skip-perms    │
│  │     < prompt via stdin          │
│  │                                 │
│  │   Claude reads codebase,        │
│  │   analyzes error, proposes fix  │
│  │                                 │
│  ├── Report back to CRM:          │
│  │   POST /api/agent-webhook/report│
│  │   { claudeOutput, fixSummary }  │
│  │   Status: AWAITING_APPROVAL     │
│  │                                 │
│  ├── CRM sends email to admins     │
│  │                                 │
│  ├── APPROVED → run claude again   │
│  │   Claude applies the fix        │
│  │                                 │
│  ├── Git: branch → commit → push   │
│  │   (skipped if no git repo)      │
│  │                                 │
│  └── Deploy: build → restart       │
│      Status: DEPLOYED              │
└────────────────────────────────────┘
```

### 15.2 Pipeline Stages

```
DETECTED ─→ ANALYZING ─→ FIX_PROPOSED ─→ AWAITING_APPROVAL
                                              │
                              Admin approves   │   Admin rejects
                                    │          │        │
                                    ▼          │        ▼
                                 APPROVED      │    REJECTED
                                    │          │
                                    ▼          │
                                 FIXING        │
                                    │          │
                                    ▼          │
                                 COMMITTED     │
                                    │          │
                                    ▼          │
                                 DEPLOYING     │
                                    │          │
                                    ▼          │
                                 DEPLOYED      │
                                               │
                          (any stage)──→ FAILED
```

### 15.3 Agent Authentication

The VPS Agent uses a separate auth system (not JWT):

```
Agent Registration (CRM Admin):
  → Creates VpsAgent record with unique agentKey: vps_<48 hex chars>
  → agentKey is shown once and must be saved

Agent Communication:
  → All requests include: x-agent-key header
  → Server validates: SELECT * FROM VpsAgent WHERE agentKey = ?
  → No JWT needed — agent keys are long-lived server credentials

Endpoints (NO JWT auth):
  POST /api/agent-webhook/heartbeat  → agent polls for work
  POST /api/agent-webhook/report     → agent reports results
```

### 15.4 Claude Code Prompt Template

```
You are fixing a production error in the application.

ERROR DETAILS:
- Message: {errorLog.message}
- Source: {errorLog.source}
- Category: {errorLog.category}
- Stack Trace: {errorLog.stack}
- Endpoint: {errorLog.endpoint}

GEMINI ANALYSIS:
{errorLog.aiAnalysis}

GEMINI SUGGESTION:
{errorLog.aiSuggestion}

INSTRUCTIONS:
1. Find the root cause of this error in the codebase
2. Apply the minimal fix required — do not refactor unrelated code
3. If tests exist, run them to verify the fix
4. Explain what you changed and why

PROJECT PATH: {agent.projectPath}
```

### 15.5 Cost Model

| Component | Cost |
|-----------|------|
| **Gemini AI** (error analysis) | Free tier: 15 RPM, 1500 RPD |
| **Claude Code CLI** (code fix) | $0 — uses Max plan subscription |
| **VPS Agent** | Zero dependencies, runs on existing VPS |
| **CRM Server** | Self-hosted, no per-request fees |

---

## 16. Role-Based Access Control

### 16.1 Role Hierarchy

```
SUPER_ADMIN (sees everything)
     │
     ├── Can assign ADMINs to projects
     ├── Can promote/demote any role
     ├── Sees all projects, tickets, errors, deals
     │
     ▼
ADMIN (project-scoped)
     │
     ├── Manages only assigned projects
     ├── Sees tickets, errors, contacts for their projects
     ├── Can configure chatbot for their projects
     │
     ▼
AGENT (project-scoped)
     │
     ├── Works on assigned projects
     ├── Creates/updates tickets, chats with AI
     │
     ▼
VIEWER (project-scoped)
     │
     └── Read-only access to assigned projects
```

### 16.2 Data Scoping

```typescript
// SUPER_ADMIN: returns null (no filter — sees everything)
// ADMIN/AGENT/VIEWER: returns array of project IDs they're members of
const allowedIds = await getUserProjectIds(userId, role);

// Query building:
const where = { organizationId };
if (allowedIds !== null) {
  where.projectId = { in: allowedIds };
}
// SUPER_ADMIN: WHERE organizationId = X
// ADMIN: WHERE organizationId = X AND projectId IN (p1, p2)
```

---

## 17. Embeddable Chat Widget

### 17.1 Widget Architecture

```
Website loads:
<script src="crm.com/widget.js?key=sk_live_xxx"></script>
     │
     ▼
widget.js (served by CRM server, ~15KB)
     │
     ├── Extracts API key from script URL
     ├── Fetches chatbot config: GET /api/widget/config
     │   Returns: botName, welcomeMessage, primaryColor, etc.
     │
     ├── Injects CSS (scoped to #acrm-widget)
     ├── Builds DOM: bubble + panel + tabs + input
     │
     ├── On bubble click: start session
     │   POST /api/widget/session { email, name, visitorId }
     │
     ├── On message send:
     │   POST /api/widget/message { sessionId, content }
     │   ├── Saves user message to WidgetMessage
     │   ├── Builds AI prompt from ChatbotConfig.systemPrompt
     │   ├── Adds ChatbotConfig.knowledgeContext
     │   ├── Calls Gemini 2.5 Flash
     │   ├── Saves AI response to WidgetMessage
     │   └── Auto-creates Contact if email provided
     │
     └── On ticket submit:
         POST /api/widget/ticket { title, description, email }
         ├── Creates Ticket in CRM
         ├── Attaches chat transcript
         └── Links to Contact if found
```

### 17.2 Admin Configuration (per project)

| Setting | Controls |
|---------|----------|
| systemPrompt | AI personality, knowledge, boundaries |
| knowledgeContext | FAQs, pricing, product info fed to AI |
| botName | Display name in widget header |
| welcomeMessage | First message users see |
| primaryColor | Widget theme color |
| position | bottom-right or bottom-left |
| enableChat | Toggle AI chat on/off |
| enableTickets | Toggle ticket creation tab |
| requireEmail | Ask email before chat starts |
| autoReply | AI responds instantly vs manual mode |
| offlineMessage | Shown when autoReply is off |

---

## 18. Future Enhancements

| Feature | Description |
|---------|-------------|
| **Drag-and-drop deals** | HTML5 drag API for pipeline board |
| **File uploads** | S3/Azure Blob for ticket attachments |
| **Webhook integrations** | Slack, Teams, custom webhook on events |
| **Audit trail** | Log all CRM changes with user + timestamp |
| **Custom fields** | User-defined fields on contacts, companies, deals |
| **Reports & analytics** | Charts for pipeline, tickets, error trends |
| **Multi-DB support** | PostgreSQL, MySQL, Oracle connectors |
| **SSO** | SAML/OIDC enterprise login |
| **Mobile app** | React Native companion |
| **PR creation** | Auto-create GitHub/GitLab PR instead of direct merge |
| **Rollback** | Auto-revert if deployed fix causes new errors |
| **Slack notifications** | Pipeline status updates in Slack channels |
