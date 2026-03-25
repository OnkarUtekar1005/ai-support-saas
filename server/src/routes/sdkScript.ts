import { Router, Request, Response } from 'express';

export const sdkScriptRoutes = Router();

/**
 * Serve the JavaScript SDK as a script tag.
 * Usage: <script src="http://localhost:3001/sdk.js?key=sk_live_xxx"></script>
 */
sdkScriptRoutes.get('/sdk.js', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(SDK_SCRIPT);
});

const SDK_SCRIPT = `
/**
 * AI Support + CRM — JavaScript SDK
 * Drop this into any website, web app, or hybrid mobile app.
 *
 * Usage:
 *   <script src="YOUR_CRM_URL/sdk.js?key=sk_live_xxx"></script>
 *   <script>
 *     AiCRM.identify({ email: 'user@example.com', firstName: 'John' });
 *     AiCRM.track('button_clicked', { button: 'signup' });
 *   </script>
 */
(function(window) {
  'use strict';

  // Extract API key and host from script tag
  var scripts = document.getElementsByTagName('script');
  var currentScript = scripts[scripts.length - 1];
  var scriptSrc = currentScript.src;
  var urlParams = new URL(scriptSrc).searchParams;
  var API_KEY = urlParams.get('key') || '';
  var BASE_URL = new URL(scriptSrc).origin + '/api/sdk';

  // Session ID (persists for this page session)
  var SESSION_ID = 'sess_' + Math.random().toString(36).substr(2, 12) + Date.now().toString(36);

  // Stored user info
  var _user = { email: null, userId: null };

  // ─── Core send function ───
  function send(endpoint, data) {
    var payload = Object.assign({}, data, {
      sessionId: SESSION_ID,
      userId: _user.userId,
      email: _user.email,
      pageUrl: window.location.href,
      timestamp: new Date().toISOString()
    });

    // Use sendBeacon for reliability (survives page unload)
    if (navigator.sendBeacon) {
      var blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      var url = BASE_URL + endpoint + '?_key=' + API_KEY;
      navigator.sendBeacon(url, blob);
    } else {
      // Fallback to fetch
      fetch(BASE_URL + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(function() {});
    }
  }

  // ─── Public API ───
  var AiCRM = {

    /**
     * Identify a user/contact.
     * AiCRM.identify({ email: 'john@example.com', firstName: 'John', lastName: 'Doe', phone: '+91...' })
     */
    identify: function(props) {
      if (!props || !props.email) {
        console.warn('[AiCRM] identify() requires an email');
        return;
      }
      _user.email = props.email;
      _user.userId = props.userId || null;
      send('/identify', props);
    },

    /**
     * Track a custom event.
     * AiCRM.track('purchase_completed', { amount: 99.99, plan: 'pro' })
     */
    track: function(eventName, properties) {
      send('/track', { event: eventName, properties: properties || {} });
    },

    /**
     * Log an error.
     * AiCRM.error('Payment failed', { stack: error.stack, source: 'checkout' })
     */
    error: function(message, details) {
      send('/error', Object.assign({ message: message }, details || {}));
    },

    /**
     * Create a support ticket.
     * AiCRM.ticket({ title: 'Bug report', description: 'Something broke', priority: 'HIGH' })
     */
    ticket: function(props) {
      if (!props || !props.title || !props.description) {
        console.warn('[AiCRM] ticket() requires title and description');
        return;
      }
      send('/ticket', props);
    },

    /**
     * Track a page view (called automatically if autoTrack is not disabled).
     */
    pageview: function() {
      send('/pageview', {
        url: window.location.href,
        title: document.title,
        referrer: document.referrer
      });
    },

    /**
     * Set user context without sending an identify call.
     */
    setUser: function(email, userId) {
      _user.email = email;
      _user.userId = userId || null;
    },

    /** Get current session ID */
    getSessionId: function() { return SESSION_ID; }
  };

  // ─── Auto-capture unhandled errors ───
  window.addEventListener('error', function(event) {
    AiCRM.error(event.message, {
      stack: event.error ? event.error.stack : 'at ' + event.filename + ':' + event.lineno + ':' + event.colno,
      source: 'window.onerror',
      level: 'ERROR'
    });
  });

  window.addEventListener('unhandledrejection', function(event) {
    var message = event.reason ? (event.reason.message || String(event.reason)) : 'Unhandled Promise Rejection';
    AiCRM.error(message, {
      stack: event.reason && event.reason.stack ? event.reason.stack : undefined,
      source: 'unhandledrejection',
      level: 'ERROR'
    });
  });

  // ─── Auto page view tracking ───
  AiCRM.pageview();

  // Track SPA navigation (pushState)
  var origPushState = history.pushState;
  history.pushState = function() {
    origPushState.apply(this, arguments);
    setTimeout(function() { AiCRM.pageview(); }, 100);
  };
  window.addEventListener('popstate', function() {
    setTimeout(function() { AiCRM.pageview(); }, 100);
  });

  // ─── Expose globally ───
  window.AiCRM = AiCRM;

  if (API_KEY) {
    console.log('[AiCRM] SDK loaded. Session:', SESSION_ID);
  } else {
    console.warn('[AiCRM] No API key provided. Add ?key=sk_live_xxx to the script URL.');
  }

})(window);
`;
