# CRM to Project — First-Time Setup Guide

This guide walks through every step required to connect your CRM data (contacts, companies, team members, activities) to a project from scratch. Follow these steps in order the first time you set up a new project.

---

## Who Should Use This Guide

Anyone setting up a new client project for the first time — project managers, account managers, or admins. No technical knowledge is required. You just need a login to the platform.

---

## What "Connecting CRM to a Project" Means

In this platform, a **Project** is the central hub. All CRM records — contacts, companies, activities, tickets, invoices, and costs — can be linked to a project. This means:

- You can see all communications and tasks for a client in one place
- Invoices auto-record payments against the project's finance dashboard
- AI can use all the context (contacts, tickets, costs) when you ask it questions about the project
- Team members can only see and contribute to projects they have been added to

---

## Before You Start — Checklist

- [ ] You are logged in as a **Super Admin** or **Admin** (only admins can create projects)
- [ ] You have the client's basic info ready: name, email, company name
- [ ] You know which team members need access to this project

---

## Step 1 — Create the Client's Company (if it doesn't exist)

If the client belongs to a company that is not yet in your CRM, add it first.

1. Go to **CRM → Companies** in the left sidebar
2. Click **New Company**
3. Fill in:
   - **Company Name** — required (e.g. "Acme Corp")
   - **Industry** — optional (e.g. "SaaS", "Retail")
   - **Website / Phone / Address** — as available
   - **Notes** — any background context
4. Click **Save**

> You can link the company to a project later (Step 6). Skip this step if the client is an individual.

---

## Step 2 — Create the Client Contact

1. Go to **CRM → Contacts** in the left sidebar
2. Click **New Contact**
3. Fill in:
   - **First Name** and **Last Name** — required
   - **Email** — required (used for invoice "Bill To" auto-fill)
   - **Phone**, **Job Title** — optional
   - **Company** — select the company you created in Step 1 (this links the contact to that company)
   - **Status** — set to `CUSTOMER` for an existing client, `LEAD` for a prospect
   - **Notes** — any context about this person
4. Click **Save**
5. **Copy the Contact's ID** — open the contact and copy the UUID from the URL bar (you will need it in Step 4). It looks like: `3f7a1b2c-...`

---

## Step 3 — Create the Project

1. Go to **Projects** in the left sidebar
2. Click **New Project**
3. Fill in:
   - **Project Name** — required (e.g. "Acme Corp — Portal v2")
   - **Description** — what the project is about
   - **Budget** — total contract value in your chosen currency
   - **Currency** — select the billing currency (USD, INR, GBP, etc.)
   - **Deadline** — project end date
   - **Color** — pick a colour to visually identify this project
4. Click **Create Project**

You will be taken straight to the new project's detail page.

---

## Step 4 — Link the Client Contact to the Project

This sets the primary client contact for the project. Once linked, their name and email auto-fill whenever you create an invoice for this project.

1. Inside the project, click the **Settings** tab
2. Scroll to the **Client Contact ID** field
3. Paste the contact UUID you copied in Step 2, Step 5
4. Click **Save Changes**

You will see a green banner appear at the top of the project overview:

> **Client: [First Name] [Last Name]** — with their company address if available

> **Tip:** The client contact is also used in the Finance tab to auto-generate the "Bill To" block on invoices.

---

## Step 5 — Add Team Members to the Project

Team members must be added before they can see or contribute to the project.

1. Inside the project, click the **Settings** tab
2. Scroll to the **Team Members** section
3. Click **Add Member**
4. Search for the user by name or email
5. Select their **Role**:
   - **Owner** — full control, can edit project settings and delete the project
   - **Manager** — can manage tickets, costs, and members
   - **Member** — can view and contribute (tickets, activities, updates)
6. Click **Add**
7. Repeat for each team member

> **Note:** Super Admins automatically have access to all projects and do not need to be added manually.

### If a Team Member Requests Access Themselves

If a team member tries to open a project they are not a member of, they will see a **Request Access** button. When they submit the request:

1. You will receive a notification in the platform
2. Go to **Settings → Access Requests** tab
3. Review the request and click **Approve** or **Decline**
4. If approved, the user is immediately added as a Member

---

## Step 6 — Link the Company to the Project (optional but recommended)

Linking a company to the project means all that company's contacts and activities show up in the project's Contacts and Activities tabs.

**Option A — When creating the company (Step 1):**  
In the New Company form, there is a **Project** dropdown. Select the project directly.

**Option B — After the project is created:**
1. Go to **CRM → Companies**
2. Open the client's company
3. Click **Edit**
4. In the **Project** field, select this project
5. Click **Save**

---

## Step 7 — Add More Contacts to the Project

You can associate multiple contacts with a project (e.g. a technical lead, a finance contact, a secondary stakeholder).

1. Go to **CRM → Contacts**
2. Open the contact you want to link
3. Click **Edit**
4. In the **Project** field, select this project
5. Click **Save**

These contacts will appear in the project's **Contacts** tab. The contact set in Step 4 is the *primary* client contact; these are all associated contacts.

---

## Step 8 — Log the First Activity

Activities are calls, emails, meetings, demos, and follow-ups. Logging them here keeps a full history of all client touchpoints in the project.

1. Go to **CRM → Activities**
2. Click **New Activity**
3. Fill in:
   - **Type** — Call, Email, Meeting, Demo, Follow-up, etc.
   - **Subject** — brief label (e.g. "Kickoff call")
   - **Description** — what was discussed or decided
   - **Contact** — select the client contact from Step 2
   - **Company** — select the client's company
   - **Project** — select this project (**important** — this is what makes it appear in the project's Activities tab)
   - **Assignee** — the team member responsible for this activity
   - **Due Date** — when this needs to happen or was completed
4. Click **Save**

Activities will now appear inside the project under the **Activities** tab.

---

## Step 9 — Create the First Invoice or Purchase Order

1. Go to **Invoices** in the left sidebar (or open the project and click the **Invoices** tab)
2. Click **New Invoice / PO / WO**
3. Fill in:
   - **Type** — Invoice (you are billing the client), Purchase Order (you are ordering from a vendor), or Work Order
   - **Project** — select this project (the client contact auto-fills from Step 4)
   - **Bill To / Vendor Details** — auto-filled if a client contact is linked; edit if needed. You can also click **Fill from contact** or **Fill from company** to pull in details quickly
   - **Line Items** — add each deliverable or service with quantity and unit price
   - **Tax Rate** — enter if applicable (percentage)
   - **Currency** — should match the project currency
   - **Due Date** — when payment is expected
   - **Notes** — payment terms or special instructions
4. Click **Create Invoice**

The invoice is created in **Draft** status. To send it to the client:

5. Open the invoice and change the status to **Sent**

When the client pays:

6. Click **Mark Paid** — the platform automatically records a `PAYMENT_RECEIVED` cost entry against the project's finance dashboard

---

## Step 10 — Create the First Support Ticket (if applicable)

If the project involves ongoing support or bug tracking:

1. Go to **Tickets** in the left sidebar
2. Click **New Ticket**
3. Fill in:
   - **Project** — select this project (required)
   - **Title** — brief description of the issue
   - **Description** — full details including steps to reproduce, screenshots info, expected vs actual behaviour
   - **Priority** — LOW, MEDIUM, HIGH, or CRITICAL
4. Click **Create & Analyze**

The AI will immediately analyse the ticket and suggest a resolution. The ticket will appear in the project's **Tickets** tab and in the Tickets page grouped under this project.

---

## Step 11 — Add Project Costs (Budget Tracking)

Track what the project is costing internally — developer time, tools, subscriptions, etc.

1. Open the project and click the **Finance** tab
2. Click **Add Cost**
3. Fill in:
   - **Name** — what this cost is (e.g. "AWS hosting — April")
   - **Type** — Base Cost, Extra Feature, Expense, or Payment Received
   - **Amount** — in the project's currency
   - **Date** — when it was incurred
4. Click **Save**

The Finance tab shows a live breakdown:
- **Contract Value** — total budget set in Step 3
- **Costs Incurred** — sum of all cost entries
- **Payments Received** — auto-populated when invoices are marked as Paid
- **Outstanding** — what the client still owes

---

## Step 12 — Generate an AI Quote (for new proposals)

If you need to generate a price estimate based on project requirements:

1. Go to **Dashboard → Finance tab**
2. Click **AI Quote Generator**
3. Fill in:
   - **Project Description** — describe what needs to be built or done
   - **Country / Market** — where the client is based (affects hourly rates)
   - **Complexity** — Simple, Medium, or Complex
   - **Tech Stack** — technologies involved
   - **Timeline** — weeks or months
4. Click **Generate Quote**

The AI returns a structured quote with phases, line items, risk factors, contingency budget, and recommendations. You can use this as the basis for your invoice line items.

---

## Part B — Connecting the Auto-Fix Pipeline

The Auto-Fix Pipeline lets the platform automatically detect errors from your live application, analyze them with AI, propose a code fix, and (after your approval) apply the fix to your codebase on the VPS. This section walks through the one-time setup required to connect it to a project.

**How the full flow works:**

```
Your live app throws an error
    → SDK sends it to CRM
    → Gemini AI deduplicates and analyses it
    → AutoTrigger checks if it meets the severity threshold
    → Pipeline created (status: DETECTING)
    → VPS Agent picks it up, runs Claude Code to plan the fix
    → Status: AWAITING_APPROVAL → Admin gets notified
    → Admin approves in CRM
    → Agent applies fix, commits, creates git branch / PR
    → Runs build + tests → Deploys if configured
    → Status: DEPLOYED
```

---

### Step B1 — Generate an API Key for the Project

The API key is how your external application authenticates with the CRM when sending errors. Each project has its own key.

1. Open the project and click the **Settings** tab
2. Scroll to the **API Keys** section
3. Click **Generate API Key**
4. Give it a name (e.g. "Production Server") and set the **Platform** (web, node, python, mobile, etc.)
5. Set **Permissions** — check `errors` (required for auto-fix). Also check `contacts` and `events` if you want the SDK's full CRM integration.
6. Click **Create**
7. **Copy the full key immediately** — it is shown only once. It starts with `proj_` and looks like `proj_abc123...xyz`

> Store this key in your application's environment variables (never commit it to git).

---

### Step B2 — Instrument Your Application to Send Errors

Add the error SDK to your application. The SDK sends errors to `POST /api/sdk/error` using your API key.

**Node.js / Express example:**

```javascript
// In your global error handler or uncaughtException listener
const CRM_URL = process.env.CRM_URL;   // e.g. https://your-crm.com
const API_KEY = process.env.CRM_API_KEY;  // the proj_... key from Step B1

async function sendError(err, context = {}) {
  try {
    await fetch(`${CRM_URL}/api/sdk/error`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({
        message: err.message,
        stack: err.stack,
        level: 'ERROR',            // ERROR or FATAL
        source: 'express-server',
        language: 'javascript',
        framework: 'express',
        environment: process.env.NODE_ENV || 'production',
        hostname: require('os').hostname(),
        endpoint: context.url,
        userId: context.userId,
      }),
    });
  } catch (_) {}  // never let error reporting crash the app
}

// Hook into your existing error handler:
app.use((err, req, res, next) => {
  sendError(err, { url: req.originalUrl, userId: req.user?.id });
  res.status(500).json({ error: 'Internal server error' });
});

process.on('uncaughtException', (err) => sendError(err));
process.on('unhandledRejection', (reason) => sendError(reason));
```

**Python / Django / Flask example:**

```python
import requests, traceback, os

CRM_URL = os.environ['CRM_URL']
API_KEY = os.environ['CRM_API_KEY']

def send_error(exc, endpoint=None, user_id=None):
    try:
        requests.post(f'{CRM_URL}/api/sdk/error', json={
            'message': str(exc),
            'stack': traceback.format_exc(),
            'level': 'ERROR',
            'language': 'python',
            'framework': 'django',   # or flask, fastapi, etc.
            'environment': os.environ.get('ENVIRONMENT', 'production'),
            'endpoint': endpoint,
            'userId': user_id,
        }, headers={'x-api-key': API_KEY}, timeout=5)
    except Exception:
        pass
```

**Spring Boot (Java) example:**

Add the dependency — no extra library needed, Spring Boot includes `java.net.http.HttpClient` in Java 11+.

**1. Add environment variables to your `application.properties` (or `application.yml`):**

```properties
# application.properties
crm.url=${CRM_URL:http://localhost:3001}
crm.api-key=${CRM_API_KEY:}
crm.enabled=${CRM_ENABLED:true}
```

**2. Create the error reporter service (`CrmErrorReporter.java`):**

```java
package com.yourapp.crm;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Arrays;
import java.util.stream.Collectors;

@Component
public class CrmErrorReporter {

    private static final Logger log = LoggerFactory.getLogger(CrmErrorReporter.class);

    @Value("${crm.url}")
    private String crmUrl;

    @Value("${crm.api-key}")
    private String apiKey;

    @Value("${crm.enabled:true}")
    private boolean enabled;

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    public void report(Throwable ex, String endpoint, String userId) {
        if (!enabled || apiKey == null || apiKey.isBlank()) return;

        // Run in a background thread — never block the request thread
        Thread.ofVirtual().start(() -> {
            try {
                String stack = Arrays.stream(ex.getStackTrace())
                        .map(StackTraceElement::toString)
                        .limit(25)  // top 25 frames is enough
                        .collect(Collectors.joining("\n  at "));

                String body = String.format("""
                        {
                          "message": %s,
                          "stack": %s,
                          "level": "ERROR",
                          "language": "java",
                          "framework": "spring-boot",
                          "environment": "%s",
                          "hostname": "%s",
                          "endpoint": %s,
                          "userId": %s,
                          "category": "%s"
                        }
                        """,
                        jsonString(ex.getMessage()),
                        jsonString("  at " + stack),
                        System.getenv().getOrDefault("SPRING_PROFILES_ACTIVE", "production"),
                        getHostname(),
                        endpoint != null ? jsonString(endpoint) : "null",
                        userId != null ? jsonString(userId) : "null",
                        ex.getClass().getSimpleName()
                );

                HttpRequest request = HttpRequest.newBuilder()
                        .uri(URI.create(crmUrl + "/api/sdk/error"))
                        .timeout(Duration.ofSeconds(5))
                        .header("Content-Type", "application/json")
                        .header("x-api-key", apiKey)
                        .POST(HttpRequest.BodyPublishers.ofString(body))
                        .build();

                httpClient.send(request, HttpResponse.BodyHandlers.discarding());
            } catch (Exception reportingError) {
                // Silently swallow — error reporting must never crash the app
                log.debug("CRM error reporting failed: {}", reportingError.getMessage());
            }
        });
    }

    // Convenience overload — no endpoint or userId context
    public void report(Throwable ex) {
        report(ex, null, null);
    }

    private String jsonString(String value) {
        if (value == null) return "null";
        return "\"" + value.replace("\\", "\\\\")
                           .replace("\"", "\\\"")
                           .replace("\n", "\\n")
                           .replace("\r", "")
                           .replace("\t", "\\t") + "\"";
    }

    private String getHostname() {
        try { return java.net.InetAddress.getLocalHost().getHostName(); }
        catch (Exception e) { return "unknown"; }
    }
}
```

**3. Create the global exception handler (`GlobalExceptionHandler.java`):**

This catches all unhandled exceptions thrown from any `@RestController` or `@Controller`.

```java
package com.yourapp.crm;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.security.Principal;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private final CrmErrorReporter crmErrorReporter;

    public GlobalExceptionHandler(CrmErrorReporter crmErrorReporter) {
        this.crmErrorReporter = crmErrorReporter;
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleAll(
            Exception ex,
            HttpServletRequest request,
            Principal principal) {

        // Report to CRM (runs in background thread)
        crmErrorReporter.report(
            ex,
            request.getMethod() + " " + request.getRequestURI(),
            principal != null ? principal.getName() : null
        );

        // Return a generic 500 to the client
        return ResponseEntity
                .status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", "Internal server error"));
    }
}
```

**4. Catch Spring Boot startup failures and scheduled task errors:**

```java
package com.yourapp;

import com.yourapp.crm.CrmErrorReporter;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.ApplicationContext;

@SpringBootApplication
public class MyApplication {

    public static void main(String[] args) {
        try {
            ApplicationContext ctx = SpringApplication.run(MyApplication.class, args);
            // Register a JVM shutdown hook for uncaught thread exceptions
            Thread.setDefaultUncaughtExceptionHandler((thread, ex) -> {
                CrmErrorReporter reporter = ctx.getBean(CrmErrorReporter.class);
                reporter.report(ex);
            });
        } catch (Exception startupEx) {
            // App failed to start — log to CRM synchronously (no Spring context yet)
            sendStartupError(startupEx, args);
            throw startupEx;
        }
    }

    private static void sendStartupError(Exception ex, String[] args) {
        String crmUrl = System.getenv("CRM_URL");
        String apiKey = System.getenv("CRM_API_KEY");
        if (crmUrl == null || apiKey == null) return;
        try {
            var body = "{\"message\":\"" + ex.getMessage().replace("\"","'") + "\","
                     + "\"level\":\"FATAL\",\"language\":\"java\",\"framework\":\"spring-boot\","
                     + "\"category\":\"StartupFailure\"}";
            var req = java.net.http.HttpRequest.newBuilder()
                    .uri(java.net.URI.create(crmUrl + "/api/sdk/error"))
                    .header("Content-Type","application/json")
                    .header("x-api-key", apiKey)
                    .POST(java.net.http.HttpRequest.BodyPublishers.ofString(body))
                    .build();
            java.net.http.HttpClient.newHttpClient().send(req,
                    java.net.http.HttpResponse.BodyHandlers.discarding());
        } catch (Exception ignored) {}
    }
}
```

**5. (Optional) Catch errors inside `@Scheduled` tasks:**

```java
@Scheduled(fixedDelay = 60000)
public void myScheduledJob() {
    try {
        // ... your job logic
    } catch (Exception ex) {
        crmErrorReporter.report(ex, "scheduled/myScheduledJob", null);
        throw ex; // re-throw so Spring logs it too
    }
}
```

**6. Set the environment variables before starting your app:**

```bash
# In your deployment script, Docker Compose, or systemd service file:
export CRM_URL=https://your-crm-domain.com
export CRM_API_KEY=proj_abc123...
export CRM_ENABLED=true

java -jar myapp.jar
```

Or in `docker-compose.yml`:

```yaml
environment:
  - CRM_URL=https://your-crm-domain.com
  - CRM_API_KEY=proj_abc123...
  - SPRING_PROFILES_ACTIVE=production
```

**What this captures:**

| Scenario | Captured by |
|---|---|
| Any unhandled exception in a REST endpoint | `GlobalExceptionHandler` |
| JVM-level uncaught thread exceptions | `Thread.setDefaultUncaughtExceptionHandler` |
| App startup failure (bean init, DB connection, etc.) | `sendStartupError` in `main()` |
| Scheduled task failures | Manual `try/catch` in `@Scheduled` |

---

**Batch errors (if your app queues them):**

```javascript
await fetch(`${CRM_URL}/api/sdk/errors/batch`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
  body: JSON.stringify({
    errors: [
      { message: 'Error 1', stack: '...', level: 'ERROR' },
      { message: 'Error 2', stack: '...', level: 'FATAL' },
    ]
  }),
});
```

**What errors trigger auto-fix?** Only `ERROR` and `FATAL` level errors that match a critical pattern:

| Auto-fixed | Skipped |
|---|---|
| HTTP 5xx, 503 | HTTP 4xx (400, 401, 403, 404) |
| `UnhandledPromiseRejection`, `UncaughtException` | `ValidationError`, auth errors |
| `TypeError: Cannot read properties of undefined` | Rate limiting errors |
| `ECONNREFUSED`, DB connection errors | Warnings and `DeprecationWarning` |
| `PrismaError`, `SequelizeConnectionError` | Unknown / noise |
| `Cannot find module`, heap OOM | — |

---

### Step B3 — Configure Auto-Fix Settings in the Project

1. Open the project and click the **Settings** tab
2. Scroll to the **Auto-Fix Configuration** section
3. Fill in:
   - **Enabled** — toggle to ON
   - **Auto-Trigger Level** — minimum severity to auto-create a pipeline:
     - `high` (default) — only trigger on serious runtime errors
     - `critical` — trigger only on fatal/crash-level errors
     - `medium` — broader coverage (more pipelines, more token usage)
   - **Max Concurrent** — how many fix pipelines can run at the same time (default: 2)
   - **Cooldown (minutes)** — wait time before triggering another fix for the same error pattern (default: 30 mins)

4. Fill in the **Codebase** section:
   - **Project Path** — full path to your code on the VPS (e.g. `/home/deploy/myapp`). This is where the agent will read and edit files.
   - **Language** — javascript, typescript, python, java, go, ruby, php, etc. Leave blank to auto-detect.
   - **Framework** — express, django, spring-boot, gin, rails, laravel, etc.
   - **Entry Point** — main file (e.g. `src/index.ts`, `app/main.py`)
   - **Source Directory** — where your source code lives (e.g. `src/`, `app/`)
   - **Test Directory** — where tests are (e.g. `__tests__/`, `tests/`)

5. Fill in the **Commands** section:
   - **Build Command** — how to build (e.g. `npm run build`, `mvn package`)
   - **Install Command** — how to install dependencies (e.g. `npm install`, `pip install -r requirements.txt`)
   - **Test Command** — how to run tests (e.g. `npm test`, `pytest`)
   - **Restart Command** — how to restart the app after deploy (e.g. `pm2 restart all`, `systemctl restart myapp`)
   - **Start Command** — how to start it fresh if needed (e.g. `npm start`)

6. Fill in the **Git** section:
   - **Git Provider** — github, gitlab, or bitbucket
   - **Repository URL** — e.g. `https://github.com/yourorg/yourrepo`
   - **Target Branch** — the branch the fix PR merges into (usually `main` or `develop`)
   - **Git Token** — a Personal Access Token (PAT) with repo write access. Needed to push branches and create PRs. Generate one in GitHub → Settings → Developer Settings → Personal Access Tokens.
   - **Create PR** — toggle ON to have the agent create a pull request automatically (recommended). Toggle OFF to push directly to the target branch.

7. Optional — **Custom Prompt Prefix**: extra context that is added to every Claude prompt for this project (e.g. "This app uses custom error codes. Never modify the `legacy/` folder."). Useful if your codebase has conventions Claude would not know.

8. Optional — **Exclude Paths**: comma-separated list of paths the agent must never modify (e.g. `migrations/, vendor/, node_modules/`).

9. Click **Save Settings**

---

### Step B4 — Register the VPS Agent in the CRM

The VPS Agent is a small Node.js process that runs on your server. It polls the CRM every 30 seconds for approved pipelines and then uses Claude Code CLI to apply fixes.

**In the CRM:**

1. Go to **Pipeline** in the left sidebar
2. Click **Register Agent**
3. Fill in:
   - **Name** — a label for this agent (e.g. "Production VPS", "AWS EC2 — ap-south-1")
   - **Host** — the server hostname or IP (e.g. `api.yourapp.com` or `10.0.0.5`). This is just for display — the agent connects outbound, you do not need to open inbound ports.
4. Click **Register**
5. **Copy the Agent Key** — shown only once. It looks like `vps_abc123...`

---

### Step B5 — Deploy the VPS Agent on Your Server

SSH into your VPS and run these steps:

**1. Copy the agent files:**
```bash
# Option A: clone directly from your repo if the agent is inside it
git clone https://github.com/yourorg/yourcrm.git /opt/techview-agent
cd /opt/techview-agent/vps-agent

# Option B: manually copy the vps-agent/ folder to the server
scp -r ./vps-agent user@yourserver:/opt/techview-agent
```

**2. Install dependencies:**
```bash
cd /opt/techview-agent
npm install
```

**3. Install and log in to Claude Code CLI:**
```bash
npm install -g @anthropic-ai/claude-code
claude login
# Follow the browser login prompt
```

**4. Set environment variables:**
```bash
export CRM_URL=https://your-crm-domain.com   # Your CRM server URL (no trailing slash)
export AGENT_KEY=vps_abc123...               # The agent key from Step B4
export PROJECT_PATH=/home/deploy/myapp       # Path to your app's code
```

**5. Test that it runs:**
```bash
node agent.js
# You should see: "[Agent] Starting ... polling every 30s"
# In the CRM → Pipeline, the agent should show as Online
```

**6. Run as a persistent service with PM2 (recommended for production):**
```bash
npm install -g pm2

pm2 start agent.js --name techview-agent \
  --env CRM_URL=https://your-crm-domain.com \
  --env AGENT_KEY=vps_abc123... \
  --env PROJECT_PATH=/home/deploy/myapp

pm2 save                      # persist across reboots
pm2 startup                   # auto-start on server restart
```

**Optional environment variables:**
| Variable | Default | Purpose |
|---|---|---|
| `POLL_INTERVAL` | `30000` | How often (ms) to check for new pipelines |
| `ANALYSIS_MODEL` | `claude-haiku-4-5-20251001` | Model used for analysis step (cheaper) |
| `FIX_MODEL` | Claude default | Model used for the actual fix |
| `MAX_STACK_LINES` | `25` | Stack trace lines sent to Claude |

---

### Step B6 — Verify the Full Pipeline End-to-End

**Trigger a test error from your application:**

Send a test payload directly:
```bash
curl -X POST https://your-crm-domain.com/api/sdk/error \
  -H 'Content-Type: application/json' \
  -H 'x-api-key: proj_abc123...' \
  -d '{
    "message": "TypeError: Cannot read properties of undefined (reading '\''id'\'')",
    "stack": "TypeError: Cannot read properties of undefined\n  at processOrder (/home/deploy/myapp/src/orders.js:42:18)",
    "level": "ERROR",
    "language": "javascript",
    "framework": "express",
    "environment": "production"
  }'
```

**What you should see:**

1. Go to **Pipeline** in the CRM sidebar
2. A new pipeline appears with status **DETECTING** or **ANALYZING**
3. Within ~30 seconds the VPS agent picks it up and runs Claude Code for analysis
4. Status changes to **AWAITING_APPROVAL**
5. You receive an in-platform notification

**Review and approve:**

6. Click on the pipeline to see Claude's analysis: which file, which line, what the fix is
7. If the fix looks correct, click **Approve**
8. The agent picks up the approved pipeline within 30 seconds
9. It creates a branch `fix/auto-<pipeline-id>`, applies the fix, runs your test command
10. If tests pass → pushes branch → creates a PR on GitHub/GitLab
11. Status changes to **DEPLOYED** (if auto-deploy is on) or **PR_CREATED**

**If something goes wrong:**

- Click **Reject** to dismiss the pipeline (it will not be retried unless you click Retry)
- Click **Retry** on a FAILED pipeline to have the agent try again
- Check pipeline logs by opening the pipeline — all steps are logged with timestamps

---

### Step B7 — Tune the Auto-Fix Behaviour (optional)

**Adjust which errors trigger auto-fix:**  
In the project's Auto-Fix settings, change **Auto-Trigger Level** from `high` to `critical` if you want to be more conservative (fewer pipelines, only true crashes). Change to `medium` for broader coverage.

**Prevent the agent from editing certain files:**  
Add paths to **Exclude Paths** in the project settings (e.g. `migrations/, config/production.json, vendor/`).

**Give the agent project-specific knowledge:**  
Use the **Custom Prompt Prefix** field. Example:
```
This is a multi-tenant SaaS. Tenant isolation is done via organizationId.
Never remove organizationId checks from queries.
The src/legacy/ folder must not be modified — it is used by an external partner.
```

**Change the cooldown to prevent fix spam:**  
The default 30-minute cooldown prevents multiple pipelines for the same recurring error. Increase it (e.g. 60 or 120 minutes) for high-volume applications.

---

## Quick Reference — What Links Where



| CRM Record           | How to Link to a Project                                              |
|----------------------|-----------------------------------------------------------------------|
| Client Contact       | Project Settings tab → Client Contact ID field                        |
| Other Contacts       | Edit Contact → Project dropdown                                       |
| Company              | Edit Company → Project dropdown                                       |
| Activity             | New/Edit Activity → Project dropdown (required to appear in project)  |
| Ticket               | New Ticket → Project selector (required)                              |
| Invoice / PO / WO    | New Invoice → Project selector (required)                             |
| Team Member          | Project Settings tab → Add Member                                     |
| Cost Entry           | Project → Finance tab → Add Cost                                      |
| Error Ingestion      | SDK API key (Step B1) → `POST /api/sdk/error` with `x-api-key` header |
| Auto-Fix Config      | Project Settings tab → Auto-Fix Configuration section                 |
| VPS Agent            | Pipeline page → Register Agent → deploy vps-agent on server          |

---

## Troubleshooting

**The client contact does not auto-fill on invoices**  
→ Make sure Step 4 is done: the contact UUID must be saved in the project's Settings tab.

**A team member cannot see the project**  
→ They need to be added as a Member (Step 5), or they can request access from the Projects page.

**Activities or contacts are not appearing in the project tabs**  
→ The contact or activity was not linked to this project. Edit the record and set the Project field.

**The Finance tab does not show for a team member**  
→ Finance data is only visible to project members and Super Admins. Confirm the user was added in Step 5.

**Invoice "Mark Paid" does not update the Finance dashboard**  
→ The invoice must have a Project selected. An invoice not linked to a project cannot auto-record a payment against it.

**Errors from my app are not appearing in the CRM**  
→ Check that the `x-api-key` header is set correctly and uses the `proj_...` key from Step B1. Also confirm the CRM URL has no trailing slash. Test with the curl command from Step B6.

**Errors appear but no pipeline is created automatically**  
→ Two possible causes: (a) Auto-Fix is not enabled for the project — check Settings → Auto-Fix Configuration → Enabled toggle. (b) The error level is below the Auto-Trigger Level threshold — try setting the level to `medium` temporarily to confirm errors are coming through.

**VPS Agent shows as Offline in the CRM**  
→ The agent reports its status only when it polls. Check that `node agent.js` (or PM2 process) is running on the server. Run `pm2 status techview-agent` to confirm.

**Pipeline stays in ANALYZING for more than 2 minutes**  
→ The VPS agent may be down or the Claude Code CLI is not logged in. SSH into the server, check `pm2 logs techview-agent`, and re-run `claude login` if needed.

**Pipeline fails at the TEST_FAILED stage**  
→ The auto-generated fix broke a test. Open the pipeline to see the test output. Click Retry to have the agent try again with the error context from the failed tests. If it keeps failing, Reject and fix manually.

**Agent cannot push the git branch (permission error)**  
→ The Git Token in the project's Auto-Fix settings does not have `repo` write scope. Regenerate the PAT on GitHub/GitLab with `repo` scope and update it in the project settings.
