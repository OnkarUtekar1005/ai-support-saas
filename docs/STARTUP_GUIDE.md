# AI Support + CRM SaaS — Startup Guide

Step-by-step instructions to set up, run, and deploy the application.

---

## Prerequisites

Before you begin, make sure you have installed:

| Tool | Version | Download |
|------|---------|----------|
| **Node.js** | 20.x or later | https://nodejs.org |
| **npm** | 10.x or later | Comes with Node.js |
| **PostgreSQL** | 16.x | https://www.postgresql.org/download/ |
| **Docker** (optional) | 24.x+ | https://www.docker.com/products/docker-desktop |
| **Git** | Any | https://git-scm.com |

You will also need:

- **Google Gemini API Key** — Get one from https://aistudio.google.com/apikey
- **SMTP credentials** (optional, for email alerts) — Gmail App Password or any SMTP provider

---

## Quick Start (5 Minutes)

### Step 1: Clone and Navigate

```bash
cd "D:/Onkar/Office work/india/ai-support-saas"
```

### Step 2: Set Up Environment Variables

```bash
cp server/.env.example server/.env
```

Edit `server/.env` with your values:

```env
# Required
PORT=3001
NODE_ENV=development
DATABASE_URL="postgresql://postgres:password@localhost:5432/ai_support_saas?schema=public"
JWT_SECRET=pick-a-strong-random-secret-at-least-32-chars
GEMINI_API_KEY=your-gemini-api-key-from-google-ai-studio

# Optional (for email alerts)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-gmail-app-password
ADMIN_EMAIL=admin@yourcompany.com

# Frontend URL
CLIENT_URL=http://localhost:5173
```

### Step 3: Start PostgreSQL

**Option A — Using Docker (recommended):**

```bash
docker-compose up postgres -d
```

This starts PostgreSQL on port 5432 with:
- Database: `ai_support_saas`
- User: `postgres`
- Password: `postgres`

If using Docker, your `DATABASE_URL` should be:
```
postgresql://postgres:postgres@localhost:5432/ai_support_saas?schema=public
```

**Option B — Using local PostgreSQL:**

Create the database manually:
```bash
psql -U postgres -c "CREATE DATABASE ai_support_saas;"
```

Update the `DATABASE_URL` in `.env` to match your local PostgreSQL credentials.

### Step 4: Install Dependencies

```bash
npm run install:all
```

This installs dependencies for the root, server, and client.

### Step 5: Initialize Database

```bash
cd server

# Generate Prisma client
npx prisma generate

# Run migrations (creates all tables)
npx prisma migrate dev --name init

# Seed demo data
npx prisma db seed

# Install orchestrator DB triggers (for auto-fix pipeline)
npm run setup:triggers

cd ..
```

### Step 6: Start the Application

```bash
npm run dev
```

This starts both servers concurrently:
- **Backend:** http://localhost:3001 (includes orchestrator agent)
- **Frontend:** http://localhost:5173

The orchestrator auto-starts with the server and listens for errors via PostgreSQL LISTEN/NOTIFY.

### Step 7: Open and Login

Open http://localhost:5173 in your browser.

**Demo Credentials:**

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@demo.com` | `admin123` |
| Agent | `agent@demo.com` | `agent123` |

---

## Detailed Setup

### Getting a Gemini API Key

1. Go to https://aistudio.google.com/apikey
2. Sign in with your Google account
3. Click **"Create API Key"**
4. Select or create a Google Cloud project
5. Copy the generated key
6. Paste it as `GEMINI_API_KEY` in your `.env` file

The free tier provides:
- 15 requests per minute (RPM)
- 1 million tokens per minute (TPM)
- 1,500 requests per day (RPD)

This is sufficient for development and small-scale production.

### Setting Up Gmail SMTP (for Email Alerts)

1. Go to https://myaccount.google.com/security
2. Enable **2-Step Verification** (required)
3. Go to https://myaccount.google.com/apppasswords
4. Select **"Mail"** and your device
5. Click **"Generate"**
6. Copy the 16-character password
7. Use it as `SMTP_PASS` in your `.env`:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=abcd efgh ijkl mnop
```

### Configuring Email Alerts in the App

1. Login as Admin
2. Go to **Settings** → **Email Alerts** tab
3. Enter your SMTP settings
4. Add admin email addresses to receive alerts
5. Toggle notification preferences:
   - **Notify on ERROR** — recommended ON
   - **Notify on FATAL** — recommended ON
   - **Daily digest** — optional summary email
6. Click **Save Settings**

---

## Running Individual Services

### Backend Only

```bash
cd server
npm run dev
```

Server starts at http://localhost:3001

### Frontend Only

```bash
cd client
npm run dev
```

App starts at http://localhost:5173 (proxies API calls to :3001)

### Database Management

```bash
# View current schema in browser
cd server && npx prisma studio

# Create a new migration after schema changes
cd server && npx prisma migrate dev --name describe_your_change

# Reset database (WARNING: deletes all data)
cd server && npx prisma migrate reset

# Re-seed demo data
cd server && npx prisma db seed
```

---

## Docker Deployment (Full Stack)

### Development with Docker Compose

```bash
# Start everything (PostgreSQL + Server + Client)
docker-compose up -d

# View logs
docker-compose logs -f server

# Stop everything
docker-compose down
```

**Services:**
- Frontend: http://localhost:5173
- Backend: http://localhost:3001
- PostgreSQL: localhost:5432

### Production Docker Build

Create a `.env` file at the project root with production values:

```env
JWT_SECRET=your-production-secret-minimum-32-characters
GEMINI_API_KEY=your-production-gemini-key
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_USER=alerts@yourcompany.com
SMTP_PASS=your-smtp-password
ADMIN_EMAIL=team@yourcompany.com
CLIENT_URL=https://your-domain.com
```

```bash
# Build and start production containers
docker-compose -f docker-compose.yml up -d --build

# Run database migrations
docker-compose exec server npx prisma migrate deploy

# Seed initial data (first time only)
docker-compose exec server npx prisma db seed
```

---

## Application Walkthrough

### Dashboard (`/`)

The main dashboard shows:
- **Total tickets** and resolved count
- **Errors in last 24 hours**
- **Team member count**
- **Error level breakdown** (7-day view)
- **Recent tickets** with status badges

### Support Module

#### Tickets (`/tickets`)
- Click **"New Ticket"** to create a ticket
- The AI automatically analyzes the ticket:
  - Extracts entities (error messages, modules, systems)
  - Assigns confidence score and priority
  - Searches knowledge base for similar cases
  - Generates a resolution if confidence >= 80%
- Filter by status (Open, In Progress, Resolved, etc.) and priority

#### AI Chat (`/chat`)
- Click **"New Chat"** to start a conversation
- Chat with the AI support engineer in real-time
- Messages are sent via WebSocket for instant responses
- Previous chat sessions are listed in the sidebar

### CRM Module

#### Projects (`/projects`)
- Create projects to organize your CRM by client, product, or team
- Each project shows counts: contacts, deals, activities, members
- Click a project to see its pipeline summary and team

#### Contacts (`/contacts`)
- Add contacts with name, email, phone, job title, company
- Assign contacts to a project and company
- Track status: Lead → Active → Customer (or Churned)
- Click a contact to see their deals, activities, and support tickets

#### Companies (`/companies`)
- Track client organizations with industry, size, domain
- Companies link to contacts and deals
- Filter by project

#### Deals / Pipeline (`/deals`)
- **Kanban board view** with 6 stages:
  - LEAD → QUALIFIED → PROPOSAL → NEGOTIATION → CLOSED WON / CLOSED LOST
- Create deals with value, currency, probability, expected close date
- Move deals between stages with arrow buttons or Won/Lost quick actions
- Filter by project
- Pipeline total and won total displayed at the top

#### Activities (`/activities`)
- Track tasks, calls, emails, meetings, notes, follow-ups
- Set due dates and assignees
- Toggle completion with a single click
- Overdue items highlighted in red
- Filter by project, status, type

### Admin Module (Admin Role Only)

#### Error Logs (`/error-logs`)
- View all application errors with level badges (INFO/WARN/ERROR/FATAL)
- Expand any error to see:
  - **Stack trace** (dark terminal view)
  - **AI Root Cause Analysis** (Gemini-generated)
  - **Suggested Fix** (Gemini-generated)
- **"Analyze with AI"** button for unanalyzed errors
- **"AI Trend Analysis"** button — analyzes patterns across recent errors
- Filter by level and analyzed/unanalyzed
- Stats: total errors, last 24h, last 7 days, unanalyzed count

#### Settings (`/settings`)
- **Email Alerts tab:**
  - Configure SMTP (host, port, user, password)
  - Add admin email recipients
  - Toggle ERROR/FATAL notifications
  - Enable/disable daily error digest
- **Team tab:**
  - View all org members
  - Change user roles (Admin/Agent/Viewer)
  - Invite new team members

---

## Registering a New Organization

1. Open http://localhost:5173/register
2. Fill in:
   - **Organization Name** — your company or team name
   - **Your Name** — your display name
   - **Email** — your login email
   - **Password** — minimum 8 characters
3. Click **"Create Account"**
4. You're automatically logged in as the Admin of your new organization
5. Invite team members from **Settings → Team**

---

## API Health Check

Verify the server is running:

```bash
curl http://localhost:3001/api/health
```

Expected response:
```json
{ "status": "ok", "timestamp": "2026-03-22T10:00:00.000Z" }
```

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3001` | Backend server port |
| `NODE_ENV` | No | `development` | Environment mode |
| `DATABASE_URL` | **Yes** | — | PostgreSQL connection string |
| `JWT_SECRET` | **Yes** | — | Secret for signing JWT tokens |
| `JWT_EXPIRES_IN` | No | `7d` | Token expiration period |
| `GEMINI_API_KEY` | **Yes** | — | Google Gemini API key |
| `SMTP_HOST` | No | `smtp.gmail.com` | SMTP server host |
| `SMTP_PORT` | No | `587` | SMTP server port |
| `SMTP_USER` | No | — | SMTP username/email |
| `SMTP_PASS` | No | — | SMTP password/app password |
| `ADMIN_EMAIL` | No | — | Default admin email for alerts |
| `CLIENT_URL` | No | `http://localhost:5173` | Frontend URL (for CORS) |
| `MAX_WORKERS` | No | `5` | Max concurrent Claude Code processes |
| `MAX_PER_PROJECT` | No | `2` | Max concurrent fixes per project |
| `GITHUB_TOKEN` | No | — | GitHub PAT for creating PRs |
| `CLAUDE_COMMAND` | No | `claude` | Claude Code CLI command |
| `WORKTREE_BASE_DIR` | No | `/tmp/orchestrator-fixes` | Temp dir for git worktrees |

---

## Common Issues & Troubleshooting

### "Cannot connect to database"
- Ensure PostgreSQL is running: `docker-compose ps` or check your local PostgreSQL service
- Verify `DATABASE_URL` in `.env` matches your PostgreSQL host/port/user/password
- Make sure the database `ai_support_saas` exists

### "Prisma migration failed"
```bash
# Reset and retry
cd server
npx prisma migrate reset
npx prisma migrate dev --name init
npx prisma db seed
```

### "GEMINI_API_KEY not working"
- Verify the key at https://aistudio.google.com/apikey
- Ensure no extra spaces or quotes in `.env`
- Check if you've exceeded the free tier rate limit (15 RPM)

### "Email alerts not sending"
- Test SMTP credentials with a direct tool first
- For Gmail: ensure 2FA is enabled and you're using an App Password (not your main password)
- Check the **Settings → Email Alerts** page — verify admin emails are saved
- Check server logs: `docker-compose logs server | grep -i email`

### "Port already in use"
```bash
# Find and kill process on port 3001
npx kill-port 3001

# Or use a different port
PORT=3002 npm run dev:server
```

### "node_modules issues"
```bash
# Clean reinstall
rm -rf node_modules server/node_modules client/node_modules
npm run install:all
```

---

## Development Tips

### Adding a New API Route

1. Create `server/src/routes/yourRoute.ts`
2. Add CRUD handlers with `authenticate` middleware
3. Register in `server/src/index.ts`:
   ```typescript
   import { yourRoutes } from './routes/yourRoute';
   app.use('/api/your-route', yourRoutes);
   ```
4. Add API methods in `client/src/services/api.ts`

### Adding a New Page

1. Create `client/src/pages/YourPage.tsx`
2. Add route in `client/src/App.tsx`
3. Add navigation item in `client/src/components/layout/AppLayout.tsx`

### Modifying the Database Schema

1. Edit `server/prisma/schema.prisma`
2. Run migration:
   ```bash
   cd server && npx prisma migrate dev --name describe_change
   ```
3. Prisma client is auto-regenerated

### Viewing Database Contents

```bash
cd server && npx prisma studio
```

Opens a visual database browser at http://localhost:5555

---

## Production Checklist

Before deploying to production:

- [ ] Set `NODE_ENV=production`
- [ ] Use a strong, random `JWT_SECRET` (32+ characters)
- [ ] Use a managed PostgreSQL service with backups enabled
- [ ] Set `CLIENT_URL` to your actual frontend domain
- [ ] Configure SMTP with a production email service (SendGrid, SES, Mailgun)
- [ ] Set up SSL/TLS certificates
- [ ] Configure rate limiting appropriate for your traffic
- [ ] Remove demo seed data (`npx prisma migrate reset` then fresh `migrate deploy`)
- [ ] Set up database connection pooling for high traffic
- [ ] Configure logging to a centralized service (CloudWatch, Datadog)
- [ ] Set up health check monitoring on `/api/health`
- [ ] Review and restrict CORS origins
- [ ] Encrypt database credential storage (replace plaintext `passwordEnc`)
- [ ] Install Claude Code CLI on server (`npm i -g @anthropic-ai/claude-code && claude login`)
- [ ] Run `npm run setup:triggers` on production database
- [ ] Configure `AutoFixConfig` for each project via `/api/orchestrator/config`
- [ ] Set `GITHUB_TOKEN` for PR creation
- [ ] Set `WORKTREE_BASE_DIR` to a path with enough disk space
