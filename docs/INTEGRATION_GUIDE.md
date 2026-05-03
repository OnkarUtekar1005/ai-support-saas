# Techview CRM — Project Integration Guide

How to connect any project (in any language) to Techview CRM so that errors are automatically reported, analyzed by AI, and can be auto-fixed.

---

## Table of Contents

1. [How It Works](#how-it-works)
2. [What Is and Isn't Caught](#what-is-and-isnt-caught)
3. [Step 1: Create API Key in CRM](#step-1-create-api-key-in-crm)
4. [Step 2: Add the Integration Code](#step-2-add-the-integration-code)
5. [Step 3: Set the API Key](#step-3-set-the-api-key)
6. [Step 4: Test It](#step-4-test-it)
7. [Language-Specific Guides](#language-specific-guides)
   - [Node.js / Express (Backend)](#nodejs--express-backend)
   - [Node.js / NestJS (Backend)](#nodejs--nestjs-backend)
   - [Python / Django (Backend)](#python--django-backend)
   - [Python / Flask (Backend)](#python--flask-backend)
   - [Python / FastAPI (Backend)](#python--fastapi-backend)
   - [Java / Spring Boot (Backend)](#java--spring-boot-backend)
   - [C# / .NET (Backend)](#c--net-backend)
   - [Go (Backend)](#go-backend)
   - [PHP / Laravel (Backend)](#php--laravel-backend)
   - [Ruby / Rails (Backend)](#ruby--rails-backend)
   - [React / Next.js (Frontend)](#react--nextjs-frontend)
   - [Vue.js (Frontend)](#vuejs-frontend)
   - [Angular (Frontend)](#angular-frontend)
   - [Vanilla JavaScript (Frontend)](#vanilla-javascript-frontend)
   - [Any Language — Universal HTTP Call](#any-language--universal-http-call)
8. [Catching More Errors (Closing the Gaps)](#catching-more-errors-closing-the-gaps)
9. [What Gets Sent to CRM](#what-gets-sent-to-crm)
10. [FAQ](#faq)

---

## How It Works

```
Your App (any language)
    |
    |  Error happens
    |
    v
Error handler sends HTTP POST
to Techview CRM API
    |
    v
CRM receives the error
    |
    v
AI analyzes it (root cause + fix suggestion)
    |
    v
Shows up in CRM Error Logs
    |
    v
Admin clicks "Auto-Fix" → Claude Code fixes it
```

**You only need to do ONE thing**: Add a small piece of code that sends errors to the CRM via HTTP POST. That's it. No SDK to install, no library dependencies — just a simple HTTP call.

---

## What Is and Isn't Caught

The basic integration (error middleware + crash handlers) covers roughly **80% of real production errors**. Here is exactly what is and isn't included.

### Backend

| Scenario | Caught? | How |
|---|:---:|---|
| Unhandled error bubbles to error middleware | ✅ | `errorHandler` middleware |
| App crash — synchronous throw at top level | ✅ | `uncaughtException` |
| Unhandled promise rejection | ✅ | `unhandledRejection` |
| Database errors that aren't caught | ✅ | Bubbles to middleware |
| OOM / missing module / startup failure | ✅ | `uncaughtException` |
| Error caught in `try/catch` that sends a 5xx | ✅ | Middleware catches the re-thrown error |
| Error caught in `try/catch` that is **swallowed** | ❌ | Never reaches middleware — must call reporter manually |
| 4xx errors (validation, auth, not found) | ❌ | Intentional — only 5xx errors are auto-fixed |
| Errors in background jobs / cron tasks | ❌ | Not in HTTP pipeline — must call reporter manually |
| Silent failures (returns null instead of throwing) | ❌ | No exception raised |

### Frontend

| Scenario | Caught? | How |
|---|:---:|---|
| React component render crash | ✅ | `ErrorBoundary.componentDidCatch` |
| Uncaught JS runtime error | ✅ | `window.addEventListener('error', ...)` |
| Unhandled rejected promise | ✅ | `window.addEventListener('unhandledrejection', ...)` |
| `fetch()` / `axios` error caught and swallowed | ❌ | Must call reporter manually inside the catch |
| Errors inside Web Workers | ❌ | Separate context — add listener inside the worker |
| Failed resource loads (images, script 404) | ❌ | Not a JS exception |
| `console.error()` calls | ❌ | Not an exception |

> **For the missed scenarios** see [Catching More Errors](#catching-more-errors-closing-the-gaps) at the bottom of this guide.

---

## Step 1: Create API Key in CRM

1. Login to CRM as admin (`admin@techviewai.com` / `admin123`)
2. Go to **Integrations** in the sidebar
3. Click **"New API Key"**
4. Fill in:
   - **Name**: Your project name (e.g., "Grasp Backend")
   - **Project**: Select the project you created
   - **Permissions**: Check **"errors"** (and "tickets" if you want)
5. Click **"Create"**
6. **Copy the API key** (starts with `sk_live_...`) — you'll need it in the next step

---

## Step 2: Add the Integration Code

Find your language below and copy-paste the code into the right file.

> **Important**: The code is designed to NEVER break your app. If the CRM is down or unreachable, errors are silently ignored. Your app continues working normally.

---

## Step 3: Set the API Key

Every integration uses 2 values:

| Variable | Value |
|----------|-------|
| `CRM_URL` | `http://localhost:3001/api/sdk/error` (or your production CRM URL) |
| `CRM_API_KEY` | The key you copied in Step 1 |

You can either:
- **Hardcode them** (for quick testing)
- **Use environment variables** (recommended for production)

---

## Step 4: Test It

After adding the code:
1. Trigger an error in your app (e.g., visit a broken endpoint)
2. Open the CRM → go to your project → **Error Logs** tab
3. The error should appear within seconds
4. Click it to see AI analysis

---

## Language-Specific Guides

---

### Node.js / Express (Backend)

**File to edit**: Your main error handler file (usually `middleware/error.js` or `app.js`)

**Where to paste**: At the top of the file, add the reporter function. Then call it inside your error handler.

```javascript
// ─── Paste this at the TOP of your error handler file ───

const CRM_URL = process.env.CRM_URL || 'http://localhost:3001/api/sdk/error';
const CRM_API_KEY = process.env.CRM_API_KEY || 'PASTE_YOUR_KEY_HERE';

function reportToCRM(err, req) {
  if (!CRM_API_KEY || CRM_API_KEY === 'PASTE_YOUR_KEY_HERE') return;
  fetch(CRM_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': CRM_API_KEY },
    body: JSON.stringify({
      level: 'ERROR',
      message: err.message,
      stack: err.stack,
      source: req ? req.path : 'unknown',
      category: 'api',
      endpoint: req ? `${req.method} ${req.originalUrl}` : undefined,
      environment: process.env.NODE_ENV || 'development',
    }),
  }).catch(() => {});
}
```

**Then add this ONE LINE inside your existing error handler:**

```javascript
function errorHandler(err, req, res, next) {
  reportToCRM(err, req);  // ← ADD THIS LINE

  // ... rest of your existing error handler code ...
}
```

**Also (optional) — catch crashes in your main `index.js` or `server.js`:**

```javascript
// Paste at the bottom of index.js / server.js
process.on('uncaughtException', (err) => {
  reportToCRM(err, null);
  console.error('Uncaught Exception:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  reportToCRM(reason instanceof Error ? reason : new Error(String(reason)), null);
  console.error('Unhandled Rejection:', reason);
});
```

**Environment variable** — add to your `.env` file:
```
CRM_URL=http://localhost:3001/api/sdk/error
CRM_API_KEY=sk_live_your_key_here
```

---

### Node.js / NestJS (Backend)

**File to create**: `src/filters/crm-error.filter.ts`

```typescript
import { ExceptionFilter, Catch, ArgumentsHost, HttpException } from '@nestjs/common';

const CRM_URL = process.env.CRM_URL || 'http://localhost:3001/api/sdk/error';
const CRM_API_KEY = process.env.CRM_API_KEY || 'PASTE_YOUR_KEY_HERE';

@Catch()
export class CrmErrorFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest();
    const response = ctx.getResponse();

    // Report to CRM
    if (CRM_API_KEY && CRM_API_KEY !== 'PASTE_YOUR_KEY_HERE') {
      fetch(CRM_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': CRM_API_KEY },
        body: JSON.stringify({
          level: 'ERROR',
          message: exception.message || 'Unknown error',
          stack: exception.stack,
          source: request.url,
          category: 'api',
          endpoint: `${request.method} ${request.url}`,
          environment: process.env.NODE_ENV || 'development',
        }),
      }).catch(() => {});
    }

    // Normal error response
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    response.status(status).json({
      statusCode: status,
      message: exception.message,
    });
  }
}
```

**Register in `main.ts`:**
```typescript
import { CrmErrorFilter } from './filters/crm-error.filter';

app.useGlobalFilters(new CrmErrorFilter());
```

---

### Python / Django (Backend)

**File to edit**: `settings.py` or create `middleware/crm_reporter.py`

**Option A — Django Middleware (recommended):**

Create file `yourapp/middleware/crm_reporter.py`:
```python
import json
import traceback
import threading
import urllib.request
import os

CRM_URL = os.getenv('CRM_URL', 'http://localhost:3001/api/sdk/error')
CRM_API_KEY = os.getenv('CRM_API_KEY', '')

def _send_to_crm(data):
    """Send error to CRM in background thread (non-blocking)"""
    try:
        if not CRM_API_KEY:
            return
        req = urllib.request.Request(
            CRM_URL,
            data=json.dumps(data).encode('utf-8'),
            headers={'Content-Type': 'application/json', 'x-api-key': CRM_API_KEY},
            method='POST'
        )
        urllib.request.urlopen(req, timeout=5)
    except Exception:
        pass  # Never let CRM failure affect the app

class CRMErrorReporterMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        return response

    def process_exception(self, request, exception):
        data = {
            'level': 'ERROR',
            'message': str(exception),
            'stack': traceback.format_exc(),
            'source': request.path,
            'category': 'api',
            'endpoint': f'{request.method} {request.path}',
            'environment': os.getenv('DJANGO_ENV', 'development'),
        }
        threading.Thread(target=_send_to_crm, args=(data,), daemon=True).start()
        return None  # Let Django handle the error normally
```

**Add to `settings.py`:**
```python
MIDDLEWARE = [
    # ... your existing middleware ...
    'yourapp.middleware.crm_reporter.CRMErrorReporterMiddleware',  # ADD THIS
]
```

**Environment variable** — add to `.env`:
```
CRM_URL=http://localhost:3001/api/sdk/error
CRM_API_KEY=sk_live_your_key_here
```

---

### Python / Flask (Backend)

**File to edit**: Your main `app.py` or wherever you create the Flask app

```python
import json
import traceback
import threading
import urllib.request
import os

CRM_URL = os.getenv('CRM_URL', 'http://localhost:3001/api/sdk/error')
CRM_API_KEY = os.getenv('CRM_API_KEY', '')

def report_to_crm(error, request=None):
    """Send error to CRM (non-blocking)"""
    def _send():
        try:
            if not CRM_API_KEY:
                return
            data = {
                'level': 'ERROR',
                'message': str(error),
                'stack': traceback.format_exc(),
                'source': request.path if request else 'unknown',
                'category': 'api',
                'endpoint': f'{request.method} {request.path}' if request else None,
                'environment': os.getenv('FLASK_ENV', 'development'),
            }
            req = urllib.request.Request(
                CRM_URL,
                data=json.dumps(data).encode('utf-8'),
                headers={'Content-Type': 'application/json', 'x-api-key': CRM_API_KEY},
                method='POST'
            )
            urllib.request.urlopen(req, timeout=5)
        except Exception:
            pass
    threading.Thread(target=_send, daemon=True).start()

# ─── Add this to your Flask app ───

@app.errorhandler(Exception)
def handle_error(error):
    report_to_crm(error, request)
    return {'error': str(error)}, getattr(error, 'code', 500)
```

---

### Python / FastAPI (Backend)

**File to edit**: Your main `main.py`

```python
import json
import traceback
import threading
import urllib.request
import os
from fastapi import Request
from fastapi.responses import JSONResponse

CRM_URL = os.getenv('CRM_URL', 'http://localhost:3001/api/sdk/error')
CRM_API_KEY = os.getenv('CRM_API_KEY', '')

def report_to_crm(error, path='unknown', method='GET'):
    def _send():
        try:
            if not CRM_API_KEY:
                return
            data = {
                'level': 'ERROR',
                'message': str(error),
                'stack': traceback.format_exc(),
                'source': path,
                'category': 'api',
                'endpoint': f'{method} {path}',
                'environment': os.getenv('ENV', 'development'),
            }
            req = urllib.request.Request(
                CRM_URL,
                data=json.dumps(data).encode('utf-8'),
                headers={'Content-Type': 'application/json', 'x-api-key': CRM_API_KEY},
                method='POST'
            )
            urllib.request.urlopen(req, timeout=5)
        except Exception:
            pass
    threading.Thread(target=_send, daemon=True).start()

# ─── Add this to your FastAPI app ───

@app.exception_handler(Exception)
async def global_error_handler(request: Request, exc: Exception):
    report_to_crm(exc, request.url.path, request.method)
    return JSONResponse(status_code=500, content={'error': str(exc)})
```

---

### Java / Spring Boot (Backend)

**File to create**: `src/main/java/com/yourapp/config/CrmErrorReporter.java`

```java
package com.yourapp.config;

import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.http.ResponseEntity;
import jakarta.servlet.http.HttpServletRequest;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.URI;
import java.io.PrintWriter;
import java.io.StringWriter;

@ControllerAdvice
public class CrmErrorReporter {

    private static final String CRM_URL = System.getenv("CRM_URL") != null
        ? System.getenv("CRM_URL") : "http://localhost:3001/api/sdk/error";
    private static final String CRM_API_KEY = System.getenv("CRM_API_KEY") != null
        ? System.getenv("CRM_API_KEY") : "";

    @ExceptionHandler(Exception.class)
    public ResponseEntity<?> handleError(Exception ex, HttpServletRequest request) {
        // Report to CRM (async, non-blocking)
        if (!CRM_API_KEY.isEmpty()) {
            Thread.startVirtualThread(() -> {
                try {
                    StringWriter sw = new StringWriter();
                    ex.printStackTrace(new PrintWriter(sw));

                    String json = String.format(
                        "{\"level\":\"ERROR\",\"message\":\"%s\",\"stack\":\"%s\",\"source\":\"%s\",\"category\":\"api\",\"endpoint\":\"%s %s\"}",
                        escapeJson(ex.getMessage()),
                        escapeJson(sw.toString()),
                        escapeJson(request.getRequestURI()),
                        request.getMethod(),
                        escapeJson(request.getRequestURI())
                    );

                    HttpClient.newHttpClient().send(
                        HttpRequest.newBuilder()
                            .uri(URI.create(CRM_URL))
                            .header("Content-Type", "application/json")
                            .header("x-api-key", CRM_API_KEY)
                            .POST(HttpRequest.BodyPublishers.ofString(json))
                            .build(),
                        HttpResponse.BodyHandlers.ofString()
                    );
                } catch (Exception ignored) {}
            });
        }

        return ResponseEntity.status(500).body(java.util.Map.of("error", ex.getMessage()));
    }

    private String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r");
    }
}
```

**Environment variable** — add to `application.properties` or set as env var:
```
CRM_URL=http://localhost:3001/api/sdk/error
CRM_API_KEY=sk_live_your_key_here
```

---

### C# / .NET (Backend)

**File to create**: `Middleware/CrmErrorMiddleware.cs`

```csharp
using System.Text;
using System.Text.Json;

public class CrmErrorMiddleware
{
    private readonly RequestDelegate _next;
    private static readonly HttpClient _http = new();
    private static readonly string CrmUrl = Environment.GetEnvironmentVariable("CRM_URL") ?? "http://localhost:3001/api/sdk/error";
    private static readonly string CrmApiKey = Environment.GetEnvironmentVariable("CRM_API_KEY") ?? "";

    public CrmErrorMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            // Report to CRM (fire and forget)
            if (!string.IsNullOrEmpty(CrmApiKey))
            {
                _ = Task.Run(async () =>
                {
                    try
                    {
                        var data = JsonSerializer.Serialize(new
                        {
                            level = "ERROR",
                            message = ex.Message,
                            stack = ex.StackTrace,
                            source = context.Request.Path.Value,
                            category = "api",
                            endpoint = $"{context.Request.Method} {context.Request.Path}",
                            environment = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? "Development"
                        });
                        var request = new HttpRequestMessage(HttpMethod.Post, CrmUrl);
                        request.Headers.Add("x-api-key", CrmApiKey);
                        request.Content = new StringContent(data, Encoding.UTF8, "application/json");
                        await _http.SendAsync(request);
                    }
                    catch { }
                });
            }

            throw; // Re-throw to let normal error handling work
        }
    }
}
```

**Register in `Program.cs`:**
```csharp
app.UseMiddleware<CrmErrorMiddleware>();  // ADD before other middleware
```

---

### Go (Backend)

**File to create or edit**: `middleware/crm.go`

```go
package middleware

import (
	"bytes"
	"encoding/json"
	"net/http"
	"os"
	"runtime/debug"
)

var crmURL = getEnv("CRM_URL", "http://localhost:3001/api/sdk/error")
var crmAPIKey = getEnv("CRM_API_KEY", "")

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func ReportToCRM(err error, r *http.Request) {
	if crmAPIKey == "" {
		return
	}
	go func() {
		defer func() { recover() }()

		source := "unknown"
		endpoint := ""
		if r != nil {
			source = r.URL.Path
			endpoint = r.Method + " " + r.URL.Path
		}

		data, _ := json.Marshal(map[string]string{
			"level":    "ERROR",
			"message":  err.Error(),
			"stack":    string(debug.Stack()),
			"source":   source,
			"category": "api",
			"endpoint": endpoint,
		})

		req, _ := http.NewRequest("POST", crmURL, bytes.NewBuffer(data))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("x-api-key", crmAPIKey)
		http.DefaultClient.Do(req)
	}()
}
```

**Use in your handler:**
```go
func myHandler(w http.ResponseWriter, r *http.Request) {
    defer func() {
        if err := recover(); err != nil {
            middleware.ReportToCRM(fmt.Errorf("%v", err), r)
            http.Error(w, "Internal Server Error", 500)
        }
    }()
    // ... your code ...
}
```

---

### PHP / Laravel (Backend)

**File to edit**: `app/Exceptions/Handler.php`

```php
<?php
// Add this method to your existing Handler class

public function register(): void
{
    $this->reportable(function (\Throwable $e) {
        $this->reportToCRM($e);
    });
}

private function reportToCRM(\Throwable $e): void
{
    $apiKey = env('CRM_API_KEY', '');
    $url = env('CRM_URL', 'http://localhost:3001/api/sdk/error');

    if (empty($apiKey)) return;

    // Non-blocking (fire and forget)
    try {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 5,
            CURLOPT_HTTPHEADER => [
                'Content-Type: application/json',
                'x-api-key: ' . $apiKey,
            ],
            CURLOPT_POSTFIELDS => json_encode([
                'level' => 'ERROR',
                'message' => $e->getMessage(),
                'stack' => $e->getTraceAsString(),
                'source' => request()->path() ?? 'unknown',
                'category' => 'api',
                'endpoint' => request()->method() . ' ' . request()->path(),
                'environment' => app()->environment(),
            ]),
        ]);
        curl_exec($ch);
        curl_close($ch);
    } catch (\Exception $ignored) {}
}
```

**Add to `.env`:**
```
CRM_URL=http://localhost:3001/api/sdk/error
CRM_API_KEY=sk_live_your_key_here
```

---

### Ruby / Rails (Backend)

**File to create**: `config/initializers/crm_reporter.rb`

```ruby
require 'net/http'
require 'json'

module CrmReporter
  CRM_URL = ENV.fetch('CRM_URL', 'http://localhost:3001/api/sdk/error')
  CRM_API_KEY = ENV.fetch('CRM_API_KEY', '')

  def self.report(exception, request = nil)
    return if CRM_API_KEY.empty?

    Thread.new do
      begin
        uri = URI(CRM_URL)
        http = Net::HTTP.new(uri.host, uri.port)
        http.open_timeout = 5
        http.read_timeout = 5

        req = Net::HTTP::Post.new(uri.path, {
          'Content-Type' => 'application/json',
          'x-api-key' => CRM_API_KEY
        })
        req.body = {
          level: 'ERROR',
          message: exception.message,
          stack: exception.backtrace&.join("\n"),
          source: request&.path || 'unknown',
          category: 'api',
          endpoint: request ? "#{request.method} #{request.path}" : nil,
          environment: Rails.env
        }.to_json

        http.request(req)
      rescue StandardError
        # Never let CRM failure affect the app
      end
    end
  end
end
```

**File to edit**: `app/controllers/application_controller.rb`

```ruby
class ApplicationController < ActionController::API
  rescue_from StandardError, with: :handle_error

  private

  def handle_error(exception)
    CrmReporter.report(exception, request)
    render json: { error: exception.message }, status: :internal_server_error
  end
end
```

---

### React / Next.js (Frontend)

**File to create**: `src/lib/crm-reporter.js` (or `.ts`)

```javascript
const CRM_URL = process.env.NEXT_PUBLIC_CRM_URL || 'http://localhost:3001/api/sdk/error';
const CRM_API_KEY = process.env.NEXT_PUBLIC_CRM_API_KEY || '';

export function reportError(error, context = {}) {
  if (!CRM_API_KEY) return;
  fetch(CRM_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': CRM_API_KEY },
    body: JSON.stringify({
      level: 'ERROR',
      message: error.message || String(error),
      stack: error.stack,
      source: context.component || window.location.pathname,
      category: 'frontend',
      endpoint: window.location.href,
      environment: process.env.NODE_ENV,
    }),
  }).catch(() => {});
}
```

**Add global error boundary** — `src/components/ErrorBoundary.jsx`:

```jsx
import { Component } from 'react';
import { reportError } from '../lib/crm-reporter';

export class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    reportError(error, { component: errorInfo.componentStack });
  }

  render() {
    if (this.state.hasError) {
      return <div>Something went wrong. Please refresh the page.</div>;
    }
    return this.props.children;
  }
}
```

**Wrap your app** in `_app.jsx` or `layout.tsx`:
```jsx
<ErrorBoundary>
  <App />
</ErrorBoundary>
```

**Also catch unhandled errors** — add to your entry file:
```javascript
window.addEventListener('error', (event) => {
  reportError(event.error || new Error(event.message));
});
window.addEventListener('unhandledrejection', (event) => {
  reportError(event.reason instanceof Error ? event.reason : new Error(String(event.reason)));
});
```

---

### Vue.js (Frontend)

**File to create**: `src/plugins/crm-reporter.js`

```javascript
const CRM_URL = import.meta.env.VITE_CRM_URL || 'http://localhost:3001/api/sdk/error';
const CRM_API_KEY = import.meta.env.VITE_CRM_API_KEY || '';

export function reportError(error, context = {}) {
  if (!CRM_API_KEY) return;
  fetch(CRM_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': CRM_API_KEY },
    body: JSON.stringify({
      level: 'ERROR',
      message: error.message || String(error),
      stack: error.stack,
      source: context.component || window.location.pathname,
      category: 'frontend',
      endpoint: window.location.href,
    }),
  }).catch(() => {});
}
```

**Add to `main.js`:**
```javascript
import { reportError } from './plugins/crm-reporter';

app.config.errorHandler = (err, vm, info) => {
  reportError(err, { component: info });
  console.error(err);
};

window.addEventListener('error', (e) => reportError(e.error || new Error(e.message)));
window.addEventListener('unhandledrejection', (e) => reportError(e.reason instanceof Error ? e.reason : new Error(String(e.reason))));
```

---

### Angular (Frontend)

**File to create**: `src/app/services/crm-reporter.service.ts`

```typescript
import { ErrorHandler, Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

const CRM_URL = environment.crmUrl || 'http://localhost:3001/api/sdk/error';
const CRM_API_KEY = environment.crmApiKey || '';

@Injectable()
export class CrmErrorHandler implements ErrorHandler {
  handleError(error: any): void {
    console.error(error);
    if (!CRM_API_KEY) return;
    fetch(CRM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': CRM_API_KEY },
      body: JSON.stringify({
        level: 'ERROR',
        message: error.message || String(error),
        stack: error.stack,
        source: window.location.pathname,
        category: 'frontend',
        endpoint: window.location.href,
      }),
    }).catch(() => {});
  }
}
```

**Register in `app.module.ts`:**
```typescript
providers: [
  { provide: ErrorHandler, useClass: CrmErrorHandler },
]
```

---

### Vanilla JavaScript (Frontend)

**Paste this in your HTML `<head>` or at the top of your main JS file:**

```html
<script>
(function() {
  var CRM_URL = 'http://localhost:3001/api/sdk/error';
  var CRM_API_KEY = 'PASTE_YOUR_KEY_HERE';

  function reportError(msg, stack, source) {
    if (!CRM_API_KEY || CRM_API_KEY === 'PASTE_YOUR_KEY_HERE') return;
    fetch(CRM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': CRM_API_KEY },
      body: JSON.stringify({
        level: 'ERROR', message: msg, stack: stack,
        source: source || window.location.pathname,
        category: 'frontend', endpoint: window.location.href,
      }),
    }).catch(function() {});
  }

  window.addEventListener('error', function(e) {
    reportError(e.message, e.error ? e.error.stack : '', e.filename);
  });
  window.addEventListener('unhandledrejection', function(e) {
    var err = e.reason;
    reportError(err && err.message ? err.message : String(err), err && err.stack ? err.stack : '');
  });
})();
</script>
```

---

### Any Language — Universal HTTP Call

If your language isn't listed above, you just need to make an HTTP POST request. Here's the universal format:

```
POST http://localhost:3001/api/sdk/error
Headers:
  Content-Type: application/json
  x-api-key: YOUR_API_KEY

Body (JSON):
{
  "level": "ERROR",                          (required: INFO, WARN, ERROR, or FATAL)
  "message": "the error message",            (required)
  "stack": "the stack trace",                (optional but recommended)
  "source": "file or module name",           (optional)
  "category": "api",                         (optional: api, database, auth, frontend, etc.)
  "endpoint": "GET /api/users",              (optional)
  "environment": "production",               (optional)
  "language": "rust",                        (optional: helps AI analysis)
  "framework": "actix-web",                  (optional: helps AI analysis)
  "metadata": { "any": "extra data" }        (optional)
}
```

**cURL example (test from terminal):**
```bash
curl -X POST http://localhost:3001/api/sdk/error \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{"level":"ERROR","message":"Test error from curl","source":"test","category":"api"}'
```

---

## Catching More Errors (Closing the Gaps)

These patterns cover the scenarios that the basic integration misses. Add only what applies to your project.

---

### Backend — errors inside try/catch blocks

If you catch an error and return a 5xx response, call the reporter explicitly before responding:

```javascript
// Node.js / Express
router.post('/process', async (req, res) => {
  try {
    await processOrder(req.body);
    res.json({ ok: true });
  } catch (err) {
    reportToCRM(err, req);          // ← add this line
    res.status(500).json({ error: 'Processing failed' });
  }
});
```

```python
# Python / Flask or FastAPI
@app.post('/process')
def process():
    try:
        do_something()
        return {'ok': True}
    except Exception as e:
        report_to_crm(e, request)   # ← add this line
        return {'error': str(e)}, 500
```

---

### Backend — background jobs and cron tasks

Jobs run outside the HTTP pipeline so the error middleware never sees them. Wrap the job body:

```javascript
// Node.js — any recurring job
async function runNightlySync() {
  try {
    await syncData();
  } catch (err) {
    reportCrashToCRM('ERROR', err);   // call the crash reporter directly
    // optionally re-throw or alert
  }
}
```

```python
# Python — celery task / APScheduler / cron
@celery.task
def send_emails():
    try:
        do_send()
    except Exception as e:
        report_to_crm(e)              # call the reporter directly
        raise                         # re-raise so Celery marks it as failed
```

---

### Backend — database / external service silent failures

If a call returns an unexpected value instead of throwing, report it manually:

```javascript
const user = await db.findUser(id);
if (!user) {
  reportToCRM(new Error(`User not found: ${id}`), req);
  return res.status(404).json({ error: 'Not found' });
}
```

---

### Frontend — fetch / axios errors

Catch network errors and report them before handling:

```javascript
// fetch
async function loadDashboard() {
  try {
    const res = await fetch('/api/dashboard');
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.url}`);
    return await res.json();
  } catch (err) {
    reportError(err, { context: 'loadDashboard' });   // ← add this
    throw err;
  }
}

// axios — global interceptor (add once in main.js / App.tsx)
axios.interceptors.response.use(
  res => res,
  err => {
    reportError(err, { context: err.config?.url });
    return Promise.reject(err);
  }
);
```

---

### Frontend — errors inside Web Workers

Add a listener inside the worker file itself:

```javascript
// worker.js
self.addEventListener('error', (e) => {
  fetch('http://localhost:3001/api/sdk/error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': 'YOUR_KEY' },
    body: JSON.stringify({
      level: 'ERROR',
      message: e.message,
      source: 'web-worker',
      category: 'frontend',
    }),
  }).catch(() => {});
});
```

---

### Frontend — failed resource loads (images, scripts)

```javascript
// Add once in your main entry file
window.addEventListener('error', (e) => {
  // e.target is the element that failed, not a JS error
  if (e.target && e.target !== window) {
    const el = e.target;
    reportError(new Error(`Resource failed to load: ${el.src || el.href}`), {
      context: `${el.tagName} load failure`,
    });
  }
}, true);  // ← capture phase required to catch resource errors
```

---

## What Gets Sent to CRM

| Field | What It Is | Required |
|-------|-----------|:--------:|
| `level` | Severity: INFO, WARN, ERROR, FATAL | Yes |
| `message` | The error message text | Yes |
| `stack` | Full stack trace | No (but helps auto-fix) |
| `source` | File, module, or URL path | No |
| `category` | Type: api, database, auth, frontend, network, etc. | No |
| `endpoint` | API endpoint (e.g., "POST /api/users") | No |
| `environment` | production, staging, development | No |
| `language` | Programming language | No (auto-detected) |
| `framework` | Framework name | No (auto-detected) |
| `metadata` | Any extra JSON data | No |

> **Privacy**: Only error information is sent. No user passwords, tokens, or sensitive data. The `source` field contains the file/URL path, not file contents.

---

## FAQ

**Q: Will this slow down my app?**
A: No. All CRM calls are non-blocking (async/background thread). Your app never waits for the CRM response.

**Q: What if the CRM is down?**
A: Nothing happens. All reporters have `catch(() => {})` — errors are silently ignored. Your app works normally.

**Q: Can I use this in production?**
A: Yes. Replace `localhost:3001` with your production CRM URL. Use environment variables for the API key.

**Q: Do I need to install any packages?**
A: No. Every integration uses built-in HTTP libraries (fetch, urllib, net/http, curl). No external dependencies.

**Q: Can I report frontend AND backend errors?**
A: Yes. Create separate API keys for frontend and backend, or use the same key. Both will appear in the CRM under the same project.

**Q: How do I stop reporting?**
A: Remove the `CRM_API_KEY` from your environment variables, or set it to empty. The reporter checks for the key and does nothing if it's missing.
