# Techview CRM — Complete Technical Guide

A step-by-step guide for setting up, configuring, and using every feature of Techview CRM. Written for non-technical users.

---

## Table of Contents

1. [What You Need Before Starting](#1-what-you-need-before-starting)
2. [Installation (First Time Setup)](#2-installation-first-time-setup)
3. [Starting the Application](#3-starting-the-application)
4. [Logging In](#4-logging-in)
5. [Understanding the Dashboard](#5-understanding-the-dashboard)
6. [Projects — Organizing Your Work](#6-projects--organizing-your-work)
7. [Support Tickets](#7-support-tickets)
8. [CRM Module (Contacts, Companies, Deals, Activities)](#8-crm-module)
9. [AI Chat Assistant](#9-ai-chat-assistant)
10. [Error Monitoring](#10-error-monitoring)
11. [Setting Up the Technical Agent (Auto-Fix)](#11-setting-up-the-technical-agent-auto-fix)
12. [Setting Up the Functional Agent (Knowledge Base)](#12-setting-up-the-functional-agent-knowledge-base)
13. [Running the Orchestrator Agent](#13-running-the-orchestrator-agent)
14. [Using Auto-Fix on Errors](#14-using-auto-fix-on-errors)
15. [Using the Functional Agent on Tickets](#15-using-the-functional-agent-on-tickets)
16. [Knowledge Base Management](#16-knowledge-base-management)
17. [Team & User Management](#17-team--user-management)
18. [Email Alert Configuration](#18-email-alert-configuration)
19. [Integrations & API Keys](#19-integrations--api-keys)
20. [Embeddable Chatbot Widget](#20-embeddable-chatbot-widget)
21. [Database Connections](#21-database-connections)
22. [Auto-Fix Pipeline Dashboard](#22-auto-fix-pipeline-dashboard)
23. [Environment Variables Reference](#23-environment-variables-reference)
24. [Troubleshooting](#24-troubleshooting)

---

## 1. What You Need Before Starting

Before you begin, make sure you have these installed on your computer:

| Software | Version | What It Is | Download Link |
|----------|---------|------------|---------------|
| **Node.js** | 20 or newer | Runs the application | https://nodejs.org |
| **PostgreSQL** | 16 or newer | The database | https://www.postgresql.org/download/ |
| **Git** | Any version | Version control | https://git-scm.com |
| **Docker** | 24 or newer (optional) | Container platform | https://www.docker.com/products/docker-desktop |

You will also need:

- **Google Gemini API Key** (free) — This powers the AI features
  1. Go to https://aistudio.google.com/apikey
  2. Sign in with your Google account
  3. Click "Create API Key"
  4. Copy the key — you will paste it during setup

- **GitHub Account** (optional) — Only needed if you want the auto-fix agent to create Pull Requests

---

## 2. Installation (First Time Setup)

### Step 1: Open a Terminal

- **Windows**: Press `Win + R`, type `cmd`, press Enter
- **Mac**: Press `Cmd + Space`, type `Terminal`, press Enter

### Step 2: Go to the Project Folder

```bash
cd "D:/Onkar/Office work/india/ai-support-saas"
```

### Step 3: Create Your Settings File

```bash
cp server/.env.example server/.env
```

Now open `server/.env` in any text editor (Notepad, VS Code, etc.) and fill in:

```
PORT=3001
NODE_ENV=development
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/ai_support_saas?schema=public"
JWT_SECRET=pick-any-long-random-text-at-least-32-characters-long
GEMINI_API_KEY=paste-your-gemini-api-key-here
CLIENT_URL=http://localhost:5173
```

> **Tip**: For `JWT_SECRET`, just type any long random text. Example: `my-super-secret-key-for-techview-crm-2024`

### Step 4: Start the Database

**Option A — Using Docker (easier):**
```bash
docker-compose up postgres -d
```

**Option B — Using local PostgreSQL:**
```bash
psql -U postgres -c "CREATE DATABASE ai_support_saas;"
```

### Step 5: Install Everything

```bash
npm run install:all
```

This downloads all required code libraries. It may take 2-3 minutes.

### Step 6: Set Up the Database Tables

```bash
cd server
npx prisma generate
npx prisma migrate dev --name init
npx prisma db seed
npm run setup:triggers
cd ..
```

What each command does:
- `prisma generate` — Prepares the database tools
- `prisma migrate dev` — Creates all the database tables
- `prisma db seed` — Fills in demo data so you can explore
- `setup:triggers` — Installs database triggers needed for the auto-fix agent

### Step 7: Verify It Worked

You should see output ending with:
```
SEED COMPLETE
Login: admin@acme.com / admin123
```

---

## 3. Starting the Application

Every time you want to use the application, run this command:

```bash
npm run dev
```

This starts two things:
- **Backend server** at http://localhost:3001
- **Frontend app** at http://localhost:5173

Wait until you see:
```
AI Support SaaS server running on port 3001
```

Then open your browser and go to: **http://localhost:5173**

### Stopping the Application

Press `Ctrl + C` in the terminal to stop.

---

## 4. Logging In

Open http://localhost:5173 in your browser.

**Demo Accounts:**

| Role | Email | Password | What They Can Do |
|------|-------|----------|------------------|
| Super Admin | `admin@acme.com` | `admin123` | Everything — full access to all features |
| Admin | `priya@acme.com` | `agent123` | Manage assigned projects |
| Agent | `rahul@acme.com` | `agent123` | Work on assigned projects |
| Viewer | `viewer@acme.com` | `viewer123` | Read-only access |

**To create your own organization:**
1. Go to http://localhost:5173/register
2. Fill in: Organization Name, Your Name, Email, Password
3. Click "Create Account"
4. You are now the Super Admin of your organization

---

## 5. Understanding the Dashboard

After logging in, you see the **Dashboard** (`/`):

- **Total Tickets** — Number of support tickets in the system
- **Resolved** — How many tickets the AI has solved
- **Errors (24h)** — Application errors detected in the last 24 hours
- **Team Members** — Number of users in your organization
- **Recent Tickets** — Latest support tickets with their status
- **Error Levels** — Bar chart showing errors by severity (FATAL, ERROR, WARN, INFO)
- **Quick Actions** — Shortcuts to create tickets, open AI chat, view pipeline, etc.

---

## 6. Projects — Organizing Your Work

Projects are the core organizational unit. Everything (tickets, contacts, deals, errors, agents) is grouped by project.

### Creating a Project

1. Go to **Projects** in the sidebar
2. Click **"New Project"**
3. Fill in:
   - **Project Name** — e.g., "Billing System", "Mobile App"
   - **Description** — What this project is about
   - **Color** — Pick a color to identify the project
4. Click **"Create Project"**

### Inside a Project

Click on any project to open it. You will see a left sidebar with tabs:

| Tab | What It Shows |
|-----|---------------|
| **Overview** | Project stats (tickets, contacts, deals, members), deal pipeline summary, team members |
| **Tickets** | Support tickets linked to this project |
| **Contacts** | People associated with this project |
| **Deals** | Sales opportunities for this project |
| **Activities** | Tasks, calls, meetings, notes |
| **Error Logs** | Application errors from this project (with Auto-Fix button) |
| **Settings** | Edit project name, description, color, status |

Click on any item in the left sidebar to see its details on the right.

---

## 7. Support Tickets

### Creating a Ticket

1. Go to **Tickets** in the sidebar
2. Click **"New Ticket"**
3. Fill in:
   - **Title** — Short summary of the issue
   - **Description** — Detailed description
   - **Priority** — LOW, MEDIUM, HIGH, or CRITICAL
4. Click **"Create & Analyze"**

### What Happens After Creation

The AI automatically:
1. **Classifies the issue** as TECHNICAL or FUNCTIONAL
2. **Extracts key information** (error messages, modules, systems affected)
3. **Assigns a confidence score** (0-100%)
4. **Searches for similar past issues** in the knowledge base
5. If confidence is 80%+, **generates an automatic resolution**

### Ticket Badges

Each ticket shows colored badges:
- **Status**: OPEN (gray), IN PROGRESS (blue), RESOLVED (green), CLOSED (gray)
- **Priority**: LOW (gray), MEDIUM (yellow), HIGH (orange), CRITICAL (red)
- **Category**: TECHNICAL (purple), FUNCTIONAL (teal), UNKNOWN (gray)

### Viewing a Ticket

Click on a ticket to see:
- Full description
- AI resolution (if generated)
- AI analysis (issue type, summary, errors, modules)
- **Auto-Fix button** (for TECHNICAL tickets) — sends to the orchestrator agent
- **Resolve with Knowledge Base button** (for FUNCTIONAL tickets) — uses the functional agent

---

## 8. CRM Module

### Contacts

Go to **Contacts** in the sidebar.

- **Add Contact** — Name, email, phone, job title, company, project, source
- **Search & Filter** — Search by name, filter by project
- **Click a contact** — Opens a slide-over panel with full details, deals, and activities
- **Status**: ACTIVE, LEAD, CUSTOMER, INACTIVE, CHURNED

### Companies

Go to **Companies** in the sidebar.

- **Add Company** — Name, domain, industry, size, phone, project
- Shows contact count and deal count per company
- Filter by project

### Deals (Sales Pipeline)

Go to **Deals** in the sidebar.

- **Kanban board** with 6 stages:
  - LEAD → QUALIFIED → PROPOSAL → NEGOTIATION → CLOSED WON / CLOSED LOST
- **Move deals** between stages using arrow buttons
- **Quick actions**: Mark as Won or Lost
- **Pipeline value** shown at the top
- **Create deals** with value, currency, probability, expected close date, contact, company

### Activities

Go to **Activities** in the sidebar.

- **Types**: TASK, CALL, EMAIL, MEETING, NOTE, FOLLOW_UP
- **Toggle completion** — Click the circle to mark as done
- **Overdue items** highlighted in red
- **Grouped** by Active vs Completed
- Filter by project and status

---

## 9. AI Chat Assistant

Go to **AI Assistant** in the sidebar.

1. Click **"New Chat"** to start a conversation
2. Type your question or describe your issue
3. The AI responds in real-time
4. Previous chat sessions are saved in the left panel

The AI assistant can:
- Answer technical questions about your systems
- Help diagnose issues
- Suggest solutions based on the knowledge base
- Create tickets from chat conversations

---

## 10. Error Monitoring

Go to **Error Logs** in the sidebar (Admin only).

### What You See

- **Stats row**: Total errors, last 24 hours, last 7 days, unanalyzed count
- **Error list**: Each error shows level, message, source, category, timestamp
- **Filters**: By level (INFO/WARN/ERROR/FATAL), category, project, analyzed status

### Expanding an Error

Click any error to expand it and see:
- **Stack trace** (dark terminal-style view)
- **AI Analysis** — Root cause determined by Gemini AI
- **AI Suggestion** — Recommended fix
- **"Analyze with AI"** button — For errors not yet analyzed
- **"Auto-Fix with Claude Code"** button — Sends to the auto-fix pipeline

### AI Trend Analysis

Click **"AI Trend Analysis"** to see:
- Detected error patterns
- Systemic issues
- Recommendations
- Overall risk level

---

## 11. Setting Up the Technical Agent (Auto-Fix)

The Technical Agent uses Claude Code to automatically fix code bugs. Here is how to set it up:

### Step 1: Go to Agent Config

1. In the sidebar, go to **Agent Config** (under Admin)
2. Select your project from the dropdown

### Step 2: Configure the Technical Agent Tab

Fill in these fields:

| Field | What to Enter | Example |
|-------|---------------|---------|
| **Enabled** | Toggle ON to activate | ON |
| **Git Repository URL** | Your GitHub/GitLab repo URL | `https://github.com/yourname/yourproject` |
| **Project Path** | Where the code lives on your machine | `/home/user/projects/my-app` or `D:/Projects/my-app` |
| **Target Branch** | The branch to create fix branches from | `main` |
| **Test Command** | How to run your tests | `npm test` |
| **Language** | Your project's programming language | JavaScript |
| **Framework** | Your project's framework | Express |
| **Build Command** | How to build your project | `npm run build` |
| **Custom Instructions** | Extra context for the AI agent | "This is an Express.js API. Auth middleware is in src/middleware/auth.ts. Do not modify migration files." |

### Step 3: Click "Save Technical Config"

### Step 4: Set Up GitHub Token (Optional, for PR creation)

If you want the agent to create Pull Requests:

1. Go to GitHub → Settings → Developer Settings → Personal Access Tokens → Fine-grained tokens
2. Create a token with "Contents" (read/write) and "Pull Requests" (read/write) permissions
3. Add to your `server/.env` file:
   ```
   GITHUB_TOKEN=your-github-token-here
   ```
4. Restart the server

---

## 12. Setting Up the Functional Agent (Knowledge Base)

The Functional Agent resolves process/workflow issues by searching your knowledge base documents. It helps when users follow wrong steps or misunderstand features.

### Step 1: Go to Agent Config

1. In the sidebar, go to **Agent Config**
2. Select your project
3. Click the **"Functional Agent"** tab

### Step 2: Configure the Functional Agent

| Field | What to Enter | Example |
|-------|---------------|---------|
| **Enabled** | Toggle ON | ON |
| **System Prompt** | Instructions specific to your project. Tell the agent about your product, processes, and common issues. | See example below |
| **Confidence Threshold** | Minimum confidence (0-1) to consider a resolution valid. 0.7 means 70%. | `0.7` |
| **Auto-Resolve Tickets** | If ON, tickets with confidence above the threshold are automatically resolved | OFF (recommended at first) |

**Example System Prompt:**
```
You are a support agent for the Acme Billing System.

Key processes:
- Invoice creation requires an active subscription
- Refunds must be requested within 30 days
- Payment method changes take 24 hours to activate
- API rate limit is 100 requests per minute

Common issues:
- "Payment failed" usually means the card expired
- "Invoice not generated" means the subscription is paused
- "Access denied" means the user role is Viewer, not Agent

Always check if the user has followed the correct steps before suggesting a fix.
```

### Step 3: Click "Save Functional Config"

### Step 4: Upload Knowledge Base Documents

Go to **Knowledge Base** in the sidebar:

1. Select your project from the dropdown
2. **Drag and drop** a file onto the upload area, or click to browse
3. Supported formats: **PDF, DOCX (Word), TXT, Markdown**
4. Wait for the status to change from "processing" to **"indexed"**
5. Upload as many documents as needed

**What to upload:**
- Standard Operating Procedures (SOPs)
- User guides / manuals
- FAQ documents
- Process flowcharts (as text)
- Training materials
- Product documentation
- Known issues and workarounds

The system automatically:
1. Extracts text from your document
2. Splits it into small chunks
3. Creates AI embeddings (vector representations)
4. Stores them in the knowledge base linked to your project

---

## 13. Running the Orchestrator Agent

The Orchestrator Agent is a separate process that watches for errors and manages auto-fix jobs. It does NOT start automatically — you run it when you need it.

### Starting the Orchestrator

Open a **new terminal window** (keep your main app running in the other one) and run:

```bash
cd "D:/Onkar/Office work/india/ai-support-saas/server"
npm run orchestrator
```

You should see:
```
═══════════════════════════════════════════
  Orchestrator Agent — Standalone Mode
  Listening for errors and pipeline events...
═══════════════════════════════════════════
```

### What the Orchestrator Does

While running, the orchestrator:
1. **Watches for new errors** — Logs them to the terminal in real-time
2. **Watches for auto-fix requests** — When you click "Auto-Fix" in the UI, the orchestrator picks it up
3. **Runs Claude Code** — Analyzes the error and proposes a fix
4. **Watches for approvals** — When you approve a fix, it applies the changes
5. **Creates commits and PRs** — Pushes fixes to your Git repository

### Stopping the Orchestrator

Press `Ctrl + C` in the orchestrator terminal.

> **Important**: The orchestrator needs Claude Code CLI installed. Install it with:
> ```bash
> npm install -g @anthropic-ai/claude-code
> ```

---

## 14. Using Auto-Fix on Errors

### From the Error Logs Page

1. Go to **Error Logs**
2. Click on an error to expand it
3. Make sure the error has an AI Analysis (click "Analyze with AI" if not)
4. Click **"Auto-Fix with Claude Code"**
5. You will be redirected to the **Pipeline** page

### From Inside a Project

1. Open a project
2. Click the **Error Logs** tab
3. Click on an error
4. Click the **"Auto-Fix"** button

### From a Technical Ticket

1. Open a ticket classified as **TECHNICAL**
2. Click **"Auto-Fix with Technical Agent"**

### Monitoring the Fix

Go to **Auto-Fix** in the sidebar to see:
1. **ANALYZING** — Claude Code is reading the code and finding the root cause
2. **FIX PROPOSED** — Claude has proposed a fix. Review the:
   - Proposed changes
   - Files that will be modified
   - Claude's explanation
3. Click **"Approve & Deploy"** to apply the fix, or **"Reject"** if you disagree
4. **FIXING** → **TESTING** → **COMMITTED** → **PR CREATED** — The fix is applied, tested, committed, and a Pull Request is created

---

## 15. Using the Functional Agent on Tickets

### Automatic Resolution

When a ticket is created and classified as **FUNCTIONAL**:
- If the functional agent is enabled and `autoResolveTickets` is ON
- The agent automatically searches the knowledge base and generates a resolution

### Manual Resolution

1. Open a ticket classified as **FUNCTIONAL**
2. Click **"Resolve with Knowledge Base"**
3. Wait for the agent to process (usually 5-15 seconds)
4. The resolution panel appears showing:
   - **Root Cause** — Why this issue occurred
   - **Steps Analysis** — What the user did wrong vs the correct process
   - **Solution** — Step-by-step instructions to fix the issue
   - **Confidence** — How confident the agent is (0-100%)
5. Give feedback with the thumbs up/down buttons

The agent **learns from feedback** — resolutions marked as "helpful" are used as examples for future similar issues.

---

## 16. Knowledge Base Management

### Uploading Documents

1. Go to **Knowledge Base** in the sidebar
2. Select the project
3. Drag and drop files or click to upload
4. Supported: PDF, DOCX (Word), TXT, Markdown (.md)
5. Maximum file size: 20 MB

### Document Statuses

| Status | Meaning |
|--------|---------|
| **Pending** (gray) | Uploaded, waiting to be processed |
| **Processing** (blue) | Being read and indexed |
| **Indexed** (green) | Ready to use — chunks created and embedded |
| **Failed** (red) | Something went wrong — check the error message |

### Deleting Documents

Click the trash icon next to any document to delete it. This also removes all associated knowledge base entries.

### Tips for Best Results

- Upload **clear, well-structured documents** — headings, numbered steps, bullet points
- Include **common problems and their solutions** in your docs
- Include **step-by-step procedures** that users should follow
- Keep documents **up to date** — delete and re-upload when processes change
- Upload **multiple smaller documents** rather than one giant file
- Use **descriptive file names** like "Invoice-Creation-SOP.pdf" not "doc1.pdf"

---

## 17. Team & User Management

Go to **Settings** in the sidebar (Admin only).

### Roles

| Role | Access Level |
|------|-------------|
| **SUPER_ADMIN** | Full access to all projects and settings |
| **ADMIN** | Manages assigned projects only |
| **AGENT** | Works on assigned projects |
| **VIEWER** | Read-only access |

### Inviting Team Members

1. Go to Settings → Team & Roles tab
2. Scroll down to "Invite Team Member"
3. Fill in: Name, Email, Password, Role
4. Click **"Invite"**

### Assigning Projects to Users

1. In the team member list, click **"Projects"** next to a user
2. Select a project from the dropdown
3. Click **"Add"**
4. Users can only see data for their assigned projects

> **Note**: SUPER_ADMIN users automatically have access to all projects.

---

## 18. Email Alert Configuration

Go to **Settings** → **Email Alerts** tab.

### SMTP Setup

Fill in your email server details:

| Field | What to Enter | Gmail Example |
|-------|---------------|---------------|
| SMTP Host | Your email server address | `smtp.gmail.com` |
| SMTP Port | Email server port | `587` |
| SMTP User | Your email address | `alerts@yourcompany.com` |
| SMTP Password | Email password or app password | Your Gmail App Password |

**For Gmail users:**
1. Go to https://myaccount.google.com/security
2. Enable 2-Step Verification
3. Go to https://myaccount.google.com/apppasswords
4. Generate an App Password
5. Use that 16-character password as SMTP Password

### Admin Emails

Add email addresses that should receive error alerts. Click "+ Add email" for multiple recipients.

### Notification Preferences

- **Notify on ERROR** — Recommended: ON
- **Notify on FATAL** — Recommended: ON
- **Daily error digest** — Optional: sends a summary email every morning

Click **"Save Settings"** when done.

---

## 19. Integrations & API Keys

Go to **Integrations** in the sidebar (Admin only).

### Creating an API Key

1. Click **"New API Key"**
2. Fill in:
   - **Name** — e.g., "Production Website"
   - **Platform** — Web, iOS, Android, or Server
   - **Allowed Origins** — Your website URL (for CORS)
   - **Permissions** — What the key can do (contacts, tickets, errors, events)
3. Click **"Create"**
4. **Copy the key immediately** — it won't be shown again

### Using the SDK

After creating a key, you get code snippets to integrate with your app:
- **JavaScript** — For web apps
- **React** — For React apps
- **API** — For any backend

The SDK can:
- Send error logs to Techview CRM
- Create tickets programmatically
- Identify contacts
- Track custom events

---

## 20. Embeddable Chatbot Widget

Go to **Chatbot** in the sidebar (Admin only).

### Configuration

Select a project and configure:
- **Bot Name** — Displayed to your users
- **Welcome Message** — First message users see
- **System Prompt** — AI personality and knowledge context
- **Colors** — Match your brand
- **Features** — Enable/disable chat, tickets, file upload

### Embedding on Your Website

Go to the **Embed Code** tab and copy the script tag into your website's HTML:

```html
<script src="http://localhost:3001/widget.js?key=YOUR_API_KEY"></script>
```

---

## 21. Database Connections

Go to **Databases** in the sidebar (Admin only).

### Adding a Connection

1. Click **"Add Connection"**
2. Fill in: Name, Host, Port, Database, Username, Password, Type (MSSQL/PostgreSQL/MySQL)
3. Click **"Connect"**

### Running Queries

1. Select a connection
2. Type a SQL query in the editor
3. Click **"Execute"** or press Ctrl+Enter
4. Results appear in a table below

You can also use **"Generate SQL"** to describe what you want in plain English, and the AI generates the SQL query for you.

---

## 22. Auto-Fix Pipeline Dashboard

Go to **Auto-Fix** in the sidebar (Admin only).

### Pipeline List

Shows all auto-fix jobs with:
- Status badge and progress bar
- Error message
- Project name
- Timestamp

### Pipeline Details

Click any pipeline to see:
- **Error details** — Original error and stack trace
- **Gemini Analysis** — AI root cause analysis
- **Claude Output** — What the agent found and proposed
- **Files Changed** — List of modified files
- **Git Info** — Branch name, commit hash, PR URL
- **Timeline** — Full event log

### VPS Agents

The second tab shows registered VPS deployment agents:
- Agent name, host, project
- Online/offline status
- Last heartbeat

---

## 23. Environment Variables Reference

All configuration is in `server/.env`:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3001` | Backend server port |
| `NODE_ENV` | No | `development` | Environment mode |
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string |
| `JWT_SECRET` | **Yes** | — | Secret for user authentication (32+ chars) |
| `GEMINI_API_KEY` | **Yes** | — | Google Gemini AI key |
| `CLIENT_URL` | No | `http://localhost:5173` | Frontend URL |
| `SMTP_HOST` | No | `smtp.gmail.com` | Email server |
| `SMTP_PORT` | No | `587` | Email port |
| `SMTP_USER` | No | — | Email username |
| `SMTP_PASS` | No | — | Email password |
| `ADMIN_EMAIL` | No | — | Default alert recipient |
| `MAX_WORKERS` | No | `5` | Max concurrent auto-fix jobs |
| `MAX_PER_PROJECT` | No | `2` | Max concurrent fixes per project |
| `GITHUB_TOKEN` | No | — | GitHub token for PR creation |
| `CLAUDE_COMMAND` | No | `claude` | Claude Code CLI command |
| `WORKTREE_BASE_DIR` | No | `/tmp/orchestrator-fixes` | Temp directory for git worktrees |

---

## 24. Troubleshooting

### "Cannot connect to database"

- Make sure PostgreSQL is running: `docker-compose ps` or check your local PostgreSQL service
- Check that `DATABASE_URL` in `server/.env` has the correct host, port, username, password
- Make sure the database `ai_support_saas` exists

### "Login fails with 401"

- Re-seed the database: `cd server && npx prisma db seed`
- Use the correct credentials: `admin@acme.com` / `admin123`

### "Orchestrator not picking up auto-fix"

1. Make sure you ran `npm run setup:triggers` (only needed once)
2. Make sure the orchestrator is running in a separate terminal: `cd server && npm run orchestrator`
3. Make sure you have `AutoFixConfig` set for the project (Agent Config page)
4. Make sure the `projectPath` is set in the config

### "Functional agent not resolving tickets"

1. Check that the Functional Agent is **enabled** in Agent Config
2. Check that you have uploaded **knowledge base documents** for the project
3. Check that documents show status **"indexed"** (not "pending" or "failed")
4. Try lowering the `confidenceThreshold` from 0.7 to 0.5

### "Document upload fails"

- Maximum file size is 20 MB
- Supported formats: PDF, DOCX, TXT, MD
- Make sure the `server/uploads/` directory exists and is writable

### "Port already in use"

```bash
# Kill the process on port 3001
npx kill-port 3001

# Or start on a different port
PORT=3002 npm run dev:server
```

### "Email alerts not sending"

- Test your SMTP credentials directly first
- For Gmail: use an App Password (not your regular password)
- Check Settings → Email Alerts → make sure admin emails are saved
- Check server logs for email-related errors

### "Application is slow"

- Make sure you have the Gemini API key set (AI features won't work without it)
- The free Gemini tier has rate limits: 15 requests/minute
- Clear old error logs if the database is large

### Reset Everything (Fresh Start)

```bash
cd server
npx prisma migrate reset
npx prisma migrate dev --name init
npx prisma db seed
npm run setup:triggers
```

> **Warning**: This deletes ALL data and starts fresh.

---

## Quick Reference Card

| Action | Where |
|--------|-------|
| Start the app | `npm run dev` (from project root) |
| Start the orchestrator | `npm run orchestrator` (from server/) |
| Login | http://localhost:5173 → `admin@acme.com` / `admin123` |
| Create a project | Sidebar → Projects → New Project |
| Create a ticket | Sidebar → Tickets → New Ticket |
| Configure Technical Agent | Sidebar → Agent Config → select project → Technical tab |
| Configure Functional Agent | Sidebar → Agent Config → select project → Functional tab |
| Upload knowledge docs | Sidebar → Knowledge Base → select project → upload |
| Trigger auto-fix | Error Logs → expand error → Auto-Fix button |
| Use functional agent | Open FUNCTIONAL ticket → Resolve with Knowledge Base |
| Manage team | Sidebar → Settings → Team & Roles |
| Configure email alerts | Sidebar → Settings → Email Alerts |
| View auto-fix status | Sidebar → Auto-Fix |
