# Techview CRM — User Accounts & Access Levels

---

## Demo Accounts

| # | Name | Email | Password | Role | Projects |
|---|------|-------|----------|------|----------|
| 1 | Onkar Patil | `admin@techviewai.com` admin@acme.com | `admin123` | SUPER_ADMIN | All projects (automatic) |
| 2 | Priya Sharma | `priya@techviewai.com` | `agent123` | ADMIN | APAC Billing (Manager), CRM Migration (Member) |
| 3 | Rahul Mehta | `rahul@techviewai.com` | `agent123` | AGENT | APAC Billing (Member), Mobile App v3 (Owner) |
| 4 | Demo Viewer | `viewer@techviewai.com` | `viewer123` | VIEWER | None (no data access) |

**Organization**: TechviewAI Corp (PRO plan)

---

## Role Definitions

### SUPER_ADMIN (Onkar Patil)

The highest level of access. Sees everything, can do everything.

**Can see:**
- All 3 projects and all data inside them
- All tickets, contacts, companies, deals, activities
- All error logs from all projects
- All team members and their assignments
- All notifications

**Can do:**
- Create/edit/delete projects
- Invite and manage users
- Assign users to projects
- Change user roles (promote/demote)
- Configure agents (Technical, Functional, Reminders)
- Upload knowledge base documents
- Trigger auto-fix on errors
- Approve/reject auto-fix pipelines
- Configure chatbot widget
- Manage API keys and integrations
- Set up database connections
- Configure email alerts

**Sidebar menu:**
- Dashboard, My Tasks
- Tickets, AI Assistant
- Projects, Contacts, Companies, Deals, Activities
- Agent Config, Knowledge Base, Chatbot, Integrations, Auto-Fix, Databases, Error Logs, Settings

---

### ADMIN (Priya Sharma)

Project-level administrator. Can manage settings but only for assigned projects.

**Can see:**
- Only assigned projects: "APAC Billing Platform" and "Enterprise CRM Migration"
- Tickets, contacts, companies, deals, activities ONLY from those 2 projects
- Error logs ONLY from those 2 projects
- Cannot see "Mobile App v3" or any of its data

**Can do:**
- Create tickets and assign them
- Create/edit contacts, companies, deals, activities
- Configure agents for their projects
- Upload knowledge base documents for their projects
- Trigger auto-fix on errors in their projects
- Approve/reject pipelines for their projects
- View team members (but cannot change roles or invite)

**Cannot do:**
- See or access "Mobile App v3" project
- Invite new users or change roles
- Access settings page (team management)

**Sidebar menu:**
- Dashboard, My Tasks
- Tickets, AI Assistant
- Projects, Contacts, Companies, Deals, Activities
- Agent Config, Knowledge Base, Chatbot, Integrations, Auto-Fix, Databases, Error Logs, Settings (admin items visible)

---

### AGENT (Rahul Mehta)

Day-to-day worker. Can create and work on items in assigned projects.

**Can see:**
- Only assigned projects: "APAC Billing Platform" and "Mobile App v3"
- Tickets, contacts, companies, deals, activities ONLY from those 2 projects
- Cannot see "Enterprise CRM Migration" or any of its data
- "My Tasks" page shows tickets assigned to them

**Can do:**
- Create tickets
- Update ticket status
- Create/edit contacts, companies, deals
- Create/edit activities (tasks, calls, meetings)
- Use AI Chat Assistant
- Resolve functional tickets with knowledge base

**Cannot do:**
- See "Enterprise CRM Migration" project
- Access admin pages (Agent Config, Error Logs, Settings, etc.)
- Configure agents or upload documents
- Trigger auto-fix
- Manage team members

**Sidebar menu:**
- Dashboard, My Tasks
- Tickets, AI Assistant
- Projects, Contacts, Companies, Deals, Activities
- (No admin section visible)

---

### VIEWER (Demo Viewer)

Read-only access. Can only view data, cannot create or modify anything.

**Can see:**
- Only assigned projects (currently: NONE assigned)
- With no project assignments, sees empty lists everywhere
- If assigned to a project, would see its data in read-only mode

**Can do:**
- View dashboards and reports
- View tickets, contacts, companies (read-only)
- Use AI Chat Assistant

**Cannot do:**
- Create or edit any records
- Access admin pages
- Trigger any actions

**Sidebar menu:**
- Dashboard, My Tasks
- Tickets, AI Assistant
- Projects, Contacts, Companies, Deals, Activities
- (No admin section visible)

---

## Project Assignments

### APAC Billing Platform (Blue)

| User | Project Role | System Role |
|------|-------------|-------------|
| Onkar Patil | Owner | SUPER_ADMIN |
| Priya Sharma | Manager | ADMIN |
| Rahul Mehta | Member | AGENT |

### Enterprise CRM Migration (Green)

| User | Project Role | System Role |
|------|-------------|-------------|
| Onkar Patil | Owner | SUPER_ADMIN |
| Priya Sharma | Member | ADMIN |

### Mobile App v3 (Yellow)

| User | Project Role | System Role |
|------|-------------|-------------|
| Rahul Mehta | Owner | AGENT |
| Onkar Patil | Manager | SUPER_ADMIN |

---

## Access Matrix

| Feature | SUPER_ADMIN | ADMIN | AGENT | VIEWER |
|---------|:-----------:|:-----:|:-----:|:------:|
| **Dashboard** | Full org stats | Scoped to projects | Scoped to projects | Scoped to projects |
| **My Tasks** | All assigned tickets | All assigned tickets | All assigned tickets | N/A |
| **Projects** | See all | See assigned only | See assigned only | See assigned only |
| **Project Detail** | Any project | Assigned only | Assigned only | Assigned only |
| **Tickets** | All | From assigned projects | From assigned projects | From assigned projects |
| **Create Ticket** | Yes | Yes | Yes | No |
| **Assign Ticket** | To anyone | To project members | To project members | No |
| **Contacts** | All | From assigned projects | From assigned projects | View only |
| **Companies** | All | From assigned projects | From assigned projects | View only |
| **Deals** | All | From assigned projects | From assigned projects | View only |
| **Activities** | All | From assigned projects | From assigned projects | View only |
| **Error Logs** | All | From assigned projects | Hidden | Hidden |
| **Auto-Fix** | Trigger + Approve | Trigger + Approve | Hidden | Hidden |
| **Agent Config** | All projects | Assigned projects | Hidden | Hidden |
| **Knowledge Base** | All projects | Assigned projects | Hidden | Hidden |
| **Chatbot Config** | All projects | Assigned projects | Hidden | Hidden |
| **Integrations** | Yes | Yes | Hidden | Hidden |
| **Databases** | Yes | Yes | Hidden | Hidden |
| **Settings (Team)** | Full control | View only | Hidden | Hidden |
| **Settings (Email)** | Full control | View only | Hidden | Hidden |
| **Notifications** | Receives all | Receives for projects | Receives for tasks | None |

---

## How to Test Differentiation

### Test 1: Project Visibility
1. Login as `rahul@techviewai.com` / `agent123`
2. Go to Projects → should see ONLY "APAC Billing" and "Mobile App v3"
3. "Enterprise CRM Migration" should NOT appear

### Test 2: Ticket Scoping
1. Login as `priya@techviewai.com` / `agent123`
2. Go to Tickets → should see tickets from "APAC Billing" and "CRM Migration" only
3. No tickets from "Mobile App v3" should appear

### Test 3: Admin Menu Hidden
1. Login as `rahul@techviewai.com` / `agent123`
2. Sidebar should NOT show: Agent Config, Knowledge Base, Error Logs, Settings
3. These are admin-only features

### Test 4: Viewer Read-Only
1. Login as `viewer@techviewai.com` / `viewer123`
2. No "New Ticket", "Add Contact", etc. buttons should appear
3. All pages should be view-only
4. Projects list should be empty (no assignments)

### Test 5: Super Admin Full Access
1. Login as `admin@techviewai.com` / `admin123`
2. See all 3 projects
3. See all tickets, errors, contacts from all projects
4. All admin features available

---

## Adding New Users

Only SUPER_ADMIN can add users:

1. Login as `admin@techviewai.com`
2. Go to **Settings** → **Team & Roles**
3. Scroll to "Invite Team Member"
4. Fill in: Name, Email, Password, Role
5. Click **Invite**
6. Then assign projects to the new user using the "Projects" button

---

## Changing User Roles

1. Login as SUPER_ADMIN
2. Go to **Settings** → **Team & Roles**
3. Find the user in the list
4. Use the role dropdown to change their role
5. Changes take effect immediately
