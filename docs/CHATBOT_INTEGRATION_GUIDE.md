# CRM of Techview — Chatbot Integration Guide

Connect the AI chatbot to any website, web app, or mobile application.

---

## Overview

The CRM of Techview provides an embeddable AI chatbot widget that you can add to any application with a single line of code. The chatbot:

- Responds to users with AI (powered by Google Gemini)
- Creates contacts in your CRM automatically
- Lets users submit support tickets
- Logs errors from your application
- Is fully configurable per project from the admin panel

```
Your App                      CRM of Techview
┌──────────────┐             ┌──────────────────┐
│              │  widget.js  │                  │
│   Website    │────────────>│  Chatbot Config  │
│   Web App    │  API Key    │  (per project)   │
│   Mobile App │<────────────│                  │
│              │  AI Reply   │  Gemini AI       │
└──────────────┘             │  Contact Auto-   │
                             │  create          │
                             │  Ticket Creation │
                             │  Error Logging   │
                             └──────────────────┘
```

---

## Prerequisites

1. CRM of Techview running (locally or deployed)
2. A **Project** created in the CRM
3. An **API Key** scoped to that project
4. **Chatbot configured** for the project (optional — defaults are auto-created)

---

## Step 1: Create a Project

1. Login to CRM as Admin
2. Go to **CRM > Projects**
3. Click **New Project**
4. Enter name (e.g. "My Website") and save

---

## Step 2: Configure the Chatbot

1. Go to **Admin > Chatbot**
2. Select your project from the dropdown
3. Configure:

| Setting | Description | Example |
|---------|-------------|---------|
| **Bot Name** | Displayed in widget header | `Techview Support` |
| **Welcome Message** | First message the user sees | `Hi! How can I help you?` |
| **System Prompt** | Controls AI personality and knowledge | See examples below |
| **Knowledge Context** | FAQs, product info, pricing fed to AI | Your product docs |
| **Primary Color** | Widget theme color | `#2563eb` (blue) |
| **Position** | Widget placement | `bottom-right` or `bottom-left` |
| **Enable Chat** | Toggle AI chat | On |
| **Enable Tickets** | Toggle ticket creation tab | On |
| **Require Email** | Ask email before chat starts | Off for anonymous, On for lead capture |
| **Auto-Reply** | AI responds instantly | On |
| **Offline Message** | Shown when auto-reply is off | `We'll get back to you soon.` |

4. Click **Save Configuration**

### System Prompt Examples

**E-Commerce Support:**
```
You are a friendly customer support assistant for ShopNow, an online clothing store.
You can help with: order tracking, returns, sizing questions, and payment issues.
Our return policy: 30 days, free returns for orders over $50.
Shipping: Free over $75, otherwise $5.99. Delivery in 3-5 business days.
If you can't resolve the issue, suggest creating a support ticket.
```

**SaaS Product Support:**
```
You are a technical support assistant for CloudSync, a file synchronization platform.
You can help with: sync errors, account setup, billing questions, and API integration.
Be technical but clear. Include code examples when relevant.
Plans: Free (5GB), Pro ($9.99/mo, 100GB), Enterprise (custom pricing).
Known issues: Large file sync may timeout — suggest breaking into smaller batches.
```

**Internal IT Helpdesk:**
```
You are an IT helpdesk assistant for the internal team.
Help with: password resets, VPN issues, software installation, hardware requests.
For password resets, direct them to https://reset.company.com
For hardware requests, ask them to create a support ticket with specifications.
Always ask for their employee ID first.
```

---

## Step 3: Create an API Key

1. Go to **Admin > Integrations**
2. Click **New API Key**
3. Fill in:
   - **Name**: e.g. `Production Website`
   - **Platform**: Select `Web`, `iOS`, `Android`, or `Server`
   - **Project**: Select the project you configured the chatbot for
   - **Permissions**: Keep all checked
4. Click **Create API Key**
5. **Copy the key** (shown only once): `sk_live_abc123...`

---

## Step 4: Add to Your Application

### Website / Web App (HTML)

Add before `</body>`:

```html
<!-- CRM of Techview — Chat Widget -->
<script src="https://YOUR_CRM_URL/widget.js?key=sk_live_YOUR_API_KEY"></script>
```

That's it. The chat bubble appears automatically.

**For local development:**
```html
<script src="http://localhost:3001/widget.js?key=sk_live_YOUR_API_KEY"></script>
```

### React / Next.js

```tsx
// In your layout or App component
import { useEffect } from 'react';

function App() {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://YOUR_CRM_URL/widget.js?key=sk_live_YOUR_API_KEY';
    script.async = true;
    document.body.appendChild(script);

    return () => { document.body.removeChild(script); };
  }, []);

  return <div>Your App</div>;
}
```

### Vue.js

```vue
<!-- App.vue -->
<script setup>
import { onMounted } from 'vue';

onMounted(() => {
  const script = document.createElement('script');
  script.src = 'https://YOUR_CRM_URL/widget.js?key=sk_live_YOUR_API_KEY';
  script.async = true;
  document.body.appendChild(script);
});
</script>
```

### Angular

```typescript
// app.component.ts
export class AppComponent implements OnInit {
  ngOnInit() {
    const script = document.createElement('script');
    script.src = 'https://YOUR_CRM_URL/widget.js?key=sk_live_YOUR_API_KEY';
    script.async = true;
    document.body.appendChild(script);
  }
}
```

### WordPress

Add to your theme's `footer.php` before `</body>`, or use a plugin like "Insert Headers and Footers":

```html
<script src="https://YOUR_CRM_URL/widget.js?key=sk_live_YOUR_API_KEY"></script>
```

### Shopify

Go to **Online Store > Themes > Edit Code > theme.liquid**, add before `</body>`:

```html
<script src="https://YOUR_CRM_URL/widget.js?key=sk_live_YOUR_API_KEY"></script>
```

---

## Step 5: Control the Widget (Optional)

After the widget loads, a global `AiCRMWidget` object is available:

```javascript
// Identify the logged-in user (creates/updates contact in CRM)
AiCRMWidget.identify('user@example.com', 'John Doe');

// Open the chat programmatically
AiCRMWidget.open();

// Close the chat
AiCRMWidget.close();

// Send a message on behalf of the user
AiCRMWidget.sendMessage('I need help with my order');
```

### Identify Users After Login

The most important integration — call `identify` when a user logs in so the CRM knows who they are:

```javascript
// After your login succeeds
async function onLoginSuccess(user) {
  // Your existing login logic...

  // Tell CRM who this user is
  if (window.AiCRMWidget) {
    AiCRMWidget.identify(user.email, user.name);
  }
}
```

This automatically:
- Creates or updates the contact in the CRM
- Links their chat session to their contact record
- Associates any tickets they create with their contact

---

## Mobile App Integration (iOS / Android / React Native / Flutter)

For mobile apps, use the REST API directly instead of the JavaScript widget.

### API Endpoints

All endpoints require the `x-api-key` header.

**Base URL:** `https://YOUR_CRM_URL/api/widget`

#### 1. Get Chatbot Config

```
GET /api/widget/config
Headers: { x-api-key: sk_live_YOUR_KEY }

Response:
{
  "botName": "Techview Support",
  "welcomeMessage": "Hi! How can I help?",
  "primaryColor": "#2563eb",
  "enableChat": true,
  "enableTickets": true,
  "requireEmail": false
}
```

#### 2. Start a Chat Session

```
POST /api/widget/session
Headers: { x-api-key: sk_live_YOUR_KEY, Content-Type: application/json }
Body: {
  "email": "user@example.com",      // optional
  "name": "John Doe",               // optional
  "visitorId": "unique-device-id",   // for anonymous tracking
  "pageUrl": "myapp://home"          // current screen
}

Response:
{
  "sessionId": "uuid-here",
  "messages": [{ "role": "assistant", "content": "Hi! How can I help?" }]
}
```

#### 3. Send Message & Get AI Response

```
POST /api/widget/message
Headers: { x-api-key: sk_live_YOUR_KEY, Content-Type: application/json }
Body: {
  "sessionId": "uuid-from-step-2",
  "content": "I can't login to my account"
}

Response:
{
  "userMessage": { "id": "...", "role": "user", "content": "..." },
  "aiMessage": { "id": "...", "role": "assistant", "content": "I can help with that..." }
}
```

#### 4. Create a Support Ticket

```
POST /api/widget/ticket
Headers: { x-api-key: sk_live_YOUR_KEY, Content-Type: application/json }
Body: {
  "title": "Cannot login after password reset",
  "description": "Detailed description of the issue...",
  "email": "user@example.com",
  "name": "John Doe",
  "sessionId": "uuid"   // optional — attaches chat transcript
}

Response:
{ "ok": true, "ticketId": "uuid" }
```

#### 5. Load Chat History

```
GET /api/widget/messages/{sessionId}
Headers: { x-api-key: sk_live_YOUR_KEY }

Response:
[
  { "id": "...", "role": "assistant", "content": "Hi! How can I help?" },
  { "id": "...", "role": "user", "content": "I have a billing question" },
  { "id": "...", "role": "assistant", "content": "Sure, I can help with billing..." }
]
```

### React Native Example

```javascript
const CRM_URL = 'https://YOUR_CRM_URL/api/widget';
const API_KEY = 'sk_live_YOUR_KEY';

const headers = {
  'Content-Type': 'application/json',
  'x-api-key': API_KEY,
};

// Start session
const startChat = async () => {
  const res = await fetch(`${CRM_URL}/session`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email: user.email,
      name: user.name,
      visitorId: deviceId,
    }),
  });
  const data = await res.json();
  setSessionId(data.sessionId);
  setMessages(data.messages);
};

// Send message
const sendMessage = async (text) => {
  const res = await fetch(`${CRM_URL}/message`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ sessionId, content: text }),
  });
  const data = await res.json();
  setMessages(prev => [...prev, data.userMessage, data.aiMessage]);
};
```

---

## Also Available: SDK for Error Tracking & Events

In addition to the chat widget, add the SDK to automatically capture:
- JavaScript errors (auto-captured)
- Page views (auto-captured for web)
- Custom events
- Contact identification

```html
<!-- Add BOTH for full integration -->
<script src="https://YOUR_CRM_URL/sdk.js?key=sk_live_YOUR_KEY"></script>
<script src="https://YOUR_CRM_URL/widget.js?key=sk_live_YOUR_KEY"></script>
```

SDK methods:
```javascript
AiCRM.identify({ email: 'user@example.com', firstName: 'John' });
AiCRM.track('purchase_completed', { amount: 99.99, plan: 'pro' });
AiCRM.error('Custom error message', { source: 'checkout', level: 'ERROR' });
AiCRM.ticket({ title: 'Bug', description: 'Details...' });
```

---

## Admin: Viewing Conversations

All widget conversations are visible in the CRM:

1. Go to **Admin > Chatbot**
2. Select the project
3. Click **Conversations** tab
4. View all chat sessions with visitor info, messages, and timestamps

Tickets created from the widget appear in **Tickets** with the chat transcript attached.

Contacts identified through the widget appear in **CRM > Contacts** with source `chatbot` or `sdk-web`.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Widget doesn't appear | Check browser console for errors. Ensure API key is correct and has a project assigned. |
| "API key must be scoped to a project" | Go to Integrations, edit the API key, and assign a Project. |
| Chat shows no response | Check if Gemini API key is valid in `server/.env`. Check for 429 rate limit errors. |
| CSP errors in console | If using a browser extension (MetaMask, etc.), try incognito mode. The CRM server has CSP disabled. |
| CORS errors | Ensure the CRM server allows your origin. Add your domain to the API key's Allowed Origins. |
| Widget loads but can't connect | Ensure the CRM server is reachable from the browser. Check the URL in the script tag. |

---

## Security Notes

- API keys are scoped per project — one key cannot access another project's data
- Only SELECT queries are allowed on database connections (no DELETE, UPDATE, DROP)
- Sensitive database columns (password, SSN, credit_card) are auto-masked
- API keys can be deactivated instantly from the admin panel
- Allowed Origins restrict which domains can use a web API key
- Permissions control what each key can do (contacts, tickets, errors, events)
