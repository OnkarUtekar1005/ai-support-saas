# Techview CRM — Functional Guide

How the system works, how data flows, and how each component interacts.

---

## System Architecture

```
+-------------------+     +-------------------+     +-------------------+
|   Frontend (React)|     |  Backend (Express) |     |  PostgreSQL DB    |
|   localhost:5173   | --> |  localhost:3001    | --> |  localhost:5432   |
|                   |     |                   |     |                   |
|  - Dashboard      |     |  - REST API       |     |  - Users          |
|  - Projects       |     |  - Auth (JWT)     |     |  - Projects       |
|  - Tickets        |     |  - AI Services    |     |  - Tickets        |
|  - CRM Pages      |     |  - Notification   |     |  - Error Logs     |
|  - Agent Config   |     |  - Document Proc  |     |  - Pipelines      |
|  - Knowledge Base |     |  - Socket.IO      |     |  - Knowledge Base |
+-------------------+     +-------------------+     +-------------------+
                                   |
                          +--------+--------+
                          |                 |
                   +------v------+   +------v------+
                   | Google       |   | Orchestrator |
                   | Gemini AI    |   | Agent (CLI)  |
                   |              |   |              |
                   | - Analysis   |   | - pg LISTEN  |
                   | - Embeddings |   | - Claude Code|
                   | - Resolution |   | - Git/PR     |
                   +--------------+   +--------------+
```

---

## User Roles & Access Control

### Role Hierarchy

```
SUPER_ADMIN  →  sees ALL projects, ALL data, manages ALL users
    |
  ADMIN      →  sees ONLY assigned projects, manages project settings
    |
  AGENT      →  sees ONLY assigned projects, works on tickets/tasks
    |
  VIEWER     →  sees ONLY assigned projects, READ-ONLY access
```

### What Each Role Can Do

| Action | SUPER_ADMIN | ADMIN | AGENT | VIEWER |
|--------|:-----------:|:-----:|:-----:|:------:|
| See all projects | Yes | No | No | No |
| See assigned projects | Yes | Yes | Yes | Yes |
| Create projects | Yes | Yes | No | No |
| Manage team/roles | Yes | No | No | No |
| Assign users to projects | Yes | No | No | No |
| Create tickets | Yes | Yes | Yes | No |
| Auto-fix errors | Yes | Yes | No | No |
| Configure agents | Yes | Yes | No | No |
| Upload KB documents | Yes | Yes | No | No |
| View error logs | Yes | Yes | No | No |
| View CRM data | Yes | Yes | Yes | Yes |
| Manage deals | Yes | Yes | Yes | No |

### Project Scoping Rules

1. When a user logs in, the system checks their `ProjectMember` records
2. ALL data queries filter by the user's assigned project IDs
3. SUPER_ADMIN bypasses this filter (sees everything)
4. A user assigned to Projects A and B will ONLY see:
   - Tickets from Project A and B
   - Error logs from Project A and B
   - Contacts, companies, deals, activities from Project A and B
5. A user can be a member of multiple projects

---

## Data Flow: Ticket Lifecycle

```
User creates ticket
        |
        v
+------------------+
| AI Classification |  ← Gemini analyzes the description
| (TaskAnalyzer)   |
+------------------+
        |
        v
  +-----------+     +-----------+
  | TECHNICAL |     | FUNCTIONAL|
  +-----------+     +-----------+
        |                 |
        v                 v
  Auto-Fix          Knowledge Base
  Pipeline          Agent resolves
  (Claude Code)     using uploaded docs
        |                 |
        v                 v
  PR Created        Resolution shown
  on GitHub         to CRM user
        |                 |
        v                 v
  Admin reviews     User gives feedback
  and approves      (helpful/not helpful)
        |                 |
        v                 v
  Fix deployed      Agent learns from
  to production     past solutions
```

### Step-by-Step: Technical Ticket

1. **User creates ticket** with title and description
2. **Gemini AI** classifies it as `TECHNICAL` (code bug, crash, API error)
3. Ticket gets `issueCategory: TECHNICAL` badge
4. If `assignOnCreate` is enabled, ticket is auto-assigned to a team member
5. Assignee receives a **notification** ("New ticket assigned to you")
6. Admin/assignee clicks **"Auto-Fix with Technical Agent"**
7. A **Pipeline** record is created with status `DETECTED`
8. The **Orchestrator Agent** (running in terminal) picks it up via pg NOTIFY
9. Claude Code **analyzes** the error and proposes a fix
10. Pipeline status changes to `FIX_PROPOSED`
11. Admin **reviews** the proposed fix on the Pipeline page
12. Admin clicks **"Approve"** → fix is applied in a git worktree
13. Code is tested, committed, and a **Pull Request** is created
14. PR URL appears in the CRM for review

### Step-by-Step: Functional Ticket

1. **User creates ticket** describing a process issue
2. **Gemini AI** classifies it as `FUNCTIONAL` (wrong steps, confusion)
3. Ticket gets `issueCategory: FUNCTIONAL` badge
4. User or agent clicks **"Resolve with Knowledge Base"**
5. **Functional Agent** activates:
   a. Searches project's knowledge base (uploaded PDFs, docs)
   b. Finds similar past resolutions
   c. Builds context and calls Gemini
6. Resolution appears with:
   - **Root Cause** — why this happened
   - **Steps Analysis** — what the user did wrong
   - **Solution** — step-by-step fix
   - **Confidence** — how sure the AI is
7. User gives **thumbs up/down feedback**
8. Future similar issues benefit from this resolution (RAG learning)

---

## Data Flow: Error Monitoring & Auto-Fix

```
External App (via SDK)
        |
        v
  POST /api/sdk/error
        |
        v
+----------------------+
| ErrorIngestionService |  ← In-memory processing
| (fingerprint, dedup) |
+----------------------+
        |
        v
  Gemini AI Analysis
  (root cause, severity)
        |
        v
  Error appears in CRM
  (Error Logs page + Project → Error Logs tab)
        |
        v
  Admin clicks "Auto-Fix"
        |
        v
+-------------------+
| Pipeline created  |  ← status: DETECTED
| (pg NOTIFY fires) |
+-------------------+
        |
        v
+-------------------+
| Orchestrator CLI  |  ← picks up via pg LISTEN
| (npm run          |
|  orchestrator)    |
+-------------------+
        |
        v
  Claude Code spawned
  (analysis phase)
        |
        v
  Fix proposed → Admin approves → Fix applied → Tests run → PR created
```

---

## Data Flow: Notifications

```
Event occurs (ticket created, assigned, status changed, PR ready)
        |
        v
+---------------------+
| NotificationService |
+---------------------+
        |
    +---+---+
    |       |
    v       v
 Single   Project
 notify   broadcast
    |       |
    v       v
 Notification record(s) created in DB
        |
        v
 Frontend polls unread count
 Bell icon shows badge
        |
        v
 User clicks bell → sees dropdown
 Clicks notification → navigates to relevant page
```

### Notification Types

| Type | When It Fires | Who Gets It |
|------|---------------|-------------|
| `TASK_ASSIGNED` | Ticket assigned to someone | The assignee |
| `STATUS_UPDATE` | Ticket status changes | Assignee + creator |
| `REMINDER` | Task overdue or due soon | The assignee |
| `PR_REVIEW` | Auto-fix PR created | Project admins |
| `ERROR_ALERT` | Critical error detected | Project members |

---

## Data Flow: Knowledge Base

```
Admin uploads PDF/DOCX/TXT
        |
        v
+-------------------+
| DocumentProcessor |
+-------------------+
        |
        v
  Extract text from file
  (pdf-parse / mammoth)
        |
        v
  Split into ~500-word chunks
  with 50-word overlap
        |
        v
  For each chunk:
    Embed with Gemini (text-embedding-004)
    Store as KnowledgeEntry
        |
        v
  Document status: "indexed"
  Chunks linked to project
        |
        v
  When Functional Agent resolves a ticket:
    1. Embed the query
    2. Cosine similarity search on project's chunks
    3. Top 5 most relevant chunks used as context
    4. Gemini generates resolution using this context
```

---

## Project Detail Page — Tab Structure

When you open a project, you see horizontal tabs:

| Tab | Content | Full Width |
|-----|---------|:----------:|
| **Overview** | Stat cards (tickets, contacts, deals, members, errors) + deal pipeline + team list | Yes |
| **Tickets** | Full table: title, priority, status, assignee, category, date. Click → ticket detail page | Yes |
| **Contacts** | Full table: name, email, company, status. Click → slide-over detail | Yes |
| **Deals** | List/mini-kanban: title, value, stage, contact | Yes |
| **Activities** | List grouped by Active/Done: subject, type, due date, assignee | Yes |
| **Error Logs** | Expandable list: click to see stack trace, AI analysis, auto-fix button | Yes |
| **Settings** | Modal: edit name, description, color, status | Modal |

All data is scoped to the current project.

---

## Task Assignment Flow

```
New ticket created
        |
        v
  Is assignOnCreate enabled? (ReminderConfig)
        |
    +---+---+
   Yes      No
    |        |
    v        v
  Auto-assign     Manual assign
  (round-robin    (admin picks
   from project    from dropdown)
   members)
        |
        v
  Notification sent to assignee
  "You've been assigned: [ticket title]"
        |
        v
  Ticket appears in assignee's "My Tasks" page
  Grouped by project
        |
        v
  Assignee works on ticket → changes status
        |
        v
  Status change triggers notification
  to assignee + original creator
```

---

## Agent Configuration

Each project can have 3 types of agent configuration:

### 1. Technical Agent (Auto-Fix)

**Purpose**: Automatically fix code bugs using Claude Code

**Configuration** (Agent Config page → Technical tab):
- `enabled` — ON/OFF
- `gitRepoUrl` — GitHub repository
- `projectPath` — Local code path
- `targetBranch` — Branch to fork from (main)
- `testCommand` — How to run tests
- `language` / `framework` — Tech stack
- `customPromptPrefix` — Extra instructions for Claude

**How it works**: Error detected → Claude analyzes → proposes fix → admin approves → fix committed → PR created

### 2. Functional Agent (Knowledge Base)

**Purpose**: Resolve process/workflow issues using uploaded documentation

**Configuration** (Agent Config page → Functional tab):
- `enabled` — ON/OFF
- `systemPrompt` — Domain-specific instructions
- `confidenceThreshold` — Minimum confidence to consider valid
- `autoResolveTickets` — Auto-resolve above threshold

**How it works**: Functional ticket → search KB → find similar past resolutions → generate solution → show to user

### 3. Reminder Agent

**Purpose**: Send notifications for overdue tasks, due-soon items, status updates

**Configuration** (Agent Config page → Reminders tab):
- `enabled` — ON/OFF
- `overdueReminder` — Notify when task is overdue
- `dueSoonHours` — Notify X hours before due
- `statusUpdateFreq` — Daily/weekly status digest
- `assignOnCreate` — Auto-assign tickets on creation

---

## "My Tasks" Page

Every user (all roles) has a "My Tasks" page that shows:

1. **All tickets assigned to them** across all their projects
2. **Grouped by project** — each project has its own section
3. **Overdue items** highlighted in red
4. **Quick navigation** — click any ticket to go to its detail page

This is the user's personal work queue.

---

## API Security Model

```
Every API request
        |
        v
  JWT Token in Authorization header
        |
        v
  authenticate middleware
  (validates token, loads user)
        |
        v
  requireRole middleware (optional)
  (checks ADMIN, SUPER_ADMIN, etc.)
        |
        v
  getUserProjectIds(userId, role)
        |
    +---+---+
    |       |
 SUPER    Others
 ADMIN      |
    |       v
    v    Returns [projectId1, projectId2, ...]
  Returns
  null       |
  (no        v
  filter)  Query adds: WHERE projectId IN (...)
        |
        v
  Only scoped data returned
```

---

## Database Entity Relationships

```
Organization (tenant)
  ├── Users
  │     └── ProjectMember (many-to-many with Projects)
  ├── Projects
  │     ├── Tickets (assigned to Users)
  │     ├── Contacts
  │     ├── Companies
  │     ├── Deals
  │     ├── Activities
  │     ├── ErrorLogs
  │     ├── Pipelines (auto-fix jobs)
  │     ├── KnowledgeEntries (from uploaded docs)
  │     ├── ProjectDocuments
  │     ├── AutoFixConfig
  │     ├── FunctionalAgentConfig
  │     └── ReminderConfig
  ├── Notifications (per user)
  └── EmailSettings
```

---

## Key Principles

1. **Everything is project-scoped** — tickets, errors, contacts, deals, docs
2. **Users only see their projects** — enforced at API level, not just UI
3. **AI does the heavy lifting** — classification, analysis, resolution
4. **Human approves** — auto-fix requires admin approval before applying
5. **Agents learn** — functional agent improves from feedback
6. **Notifications keep everyone in sync** — assignments, status changes, alerts
7. **Orchestrator is separate** — runs independently, picks up work via database events
