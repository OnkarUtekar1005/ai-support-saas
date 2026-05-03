import { Router, Request, Response } from 'express';

export const widgetScriptRoutes = Router();

/**
 * Serve the embeddable chat widget.
 * Usage: <script src="http://localhost:3001/widget.js?key=sk_live_xxx"></script>
 */
widgetScriptRoutes.get('/widget.js', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.send(WIDGET_SCRIPT);
});

const WIDGET_SCRIPT = `
(function(window, document) {
  'use strict';

  // ─── Prevent double-init (React StrictMode double-mount) ───
  if (window._tvWidgetInit) return;
  window._tvWidgetInit = true;

  // ─── Extract config from script tag or window.TechViewConfig ───
  var scriptSrc = '';
  var scripts = document.getElementsByTagName('script');
  for (var i = scripts.length - 1; i >= 0; i--) {
    if (scripts[i].src && scripts[i].src.indexOf('widget.js') !== -1) {
      scriptSrc = scripts[i].src;
      break;
    }
  }
  var API_KEY = '';
  var BASE_URL = window.location.origin;
  if (scriptSrc) {
    try {
      var parsed = new URL(scriptSrc);
      API_KEY = parsed.searchParams.get('key') || '';
      BASE_URL = parsed.origin;
    } catch(e) {}
  }
  if (!API_KEY && window.TechViewConfig) {
    API_KEY = window.TechViewConfig.apiKey || '';
    BASE_URL = window.TechViewConfig.baseUrl || BASE_URL;
  }
  var API_URL = BASE_URL + '/api/widget';

  var sessionId = null;
  var config = {};
  var isOpen = false;
  var userInfo = { email: null, name: null };
  var VISITOR_ID = localStorage.getItem('_tv_vid') || ('v_' + Math.random().toString(36).substr(2, 12));
  localStorage.setItem('_tv_vid', VISITOR_ID);

  // ─── API helper ───
  function api(endpoint, method, data) {
    return fetch(API_URL + endpoint, {
      method: method || 'GET',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: data ? JSON.stringify(data) : undefined
    }).then(function(r) { return r.json(); });
  }

  function loadConfig() {
    return api('/config', 'GET').then(function(cfg) { config = cfg; return cfg; });
  }

  function startSession() {
    return api('/session', 'POST', {
      email: userInfo.email, name: userInfo.name,
      visitorId: VISITOR_ID, pageUrl: window.location.href
    }).then(function(res) {
      sessionId = res.sessionId;
      if (res.messages) {
        res.messages.forEach(function(m) { appendMessage(m.role, m.content); });
      }
    });
  }

  function sendMessage(content) {
    if (!content.trim() || !sessionId) return;
    appendMessage('user', content);
    showTyping();
    api('/message', 'POST', { sessionId: sessionId, content: content })
      .then(function(res) {
        hideTyping();
        if (res.aiMessage) appendMessage('assistant', res.aiMessage.content);
      })
      .catch(function() {
        hideTyping();
        appendMessage('assistant', 'Sorry, something went wrong. Please try again.');
      });
  }

  function createTicket(title, description) {
    return api('/ticket', 'POST', {
      title: title, description: description,
      email: userInfo.email, name: userInfo.name, sessionId: sessionId
    });
  }

  // ─── Inject CSS ───
  function injectStyles(primaryColor, position) {
    if (document.getElementById('tv-styles')) return;
    var pos = position === 'bottom-left' ? 'left: 20px;' : 'right: 20px;';
    var style = document.createElement('style');
    style.id = 'tv-styles';
    style.textContent = \`
      #tv-widget * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
      #tv-bubble {
        position: fixed; bottom: 20px; \${pos} width: 60px; height: 60px;
        border-radius: 50%; background: \${primaryColor}; color: white;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer; box-shadow: 0 4px 16px rgba(0,0,0,0.2);
        z-index: 2147483647; transition: transform 0.2s;
      }
      #tv-bubble:hover { transform: scale(1.1); }
      #tv-bubble svg { width: 28px; height: 28px; pointer-events: none; }
      #tv-panel {
        position: fixed; bottom: 90px; \${pos} width: 380px; height: 520px;
        background: white; border-radius: 16px; box-shadow: 0 8px 40px rgba(0,0,0,0.15);
        z-index: 2147483646; display: none; flex-direction: column; overflow: hidden;
      }
      #tv-panel.open { display: flex !important; }
      #tv-header {
        background: \${primaryColor}; color: white; padding: 16px 20px;
        display: flex; align-items: center; justify-content: space-between;
      }
      #tv-header-info { display: flex; align-items: center; gap: 10px; }
      #tv-header-info .name { font-weight: 600; font-size: 15px; }
      #tv-header-info .status { font-size: 11px; opacity: 0.85; }
      #tv-close { background: none; border: none; color: white; cursor: pointer; font-size: 20px; padding: 4px; }
      #tv-tabs { display: flex; border-bottom: 1px solid #e5e7eb; }
      #tv-tabs button {
        flex: 1; padding: 10px; font-size: 13px; font-weight: 500; border: none;
        background: white; cursor: pointer; color: #6b7280; border-bottom: 2px solid transparent;
      }
      #tv-tabs button.active { color: \${primaryColor}; border-bottom-color: \${primaryColor}; }
      #tv-messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
      .tv-msg {
        max-width: 80%; padding: 10px 14px; border-radius: 16px; font-size: 14px; line-height: 1.5;
        word-wrap: break-word; animation: tv-fade 0.3s ease;
      }
      @keyframes tv-fade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      .tv-msg.user { background: \${primaryColor}; color: white; border-bottom-right-radius: 4px; align-self: flex-end; }
      .tv-msg.assistant { background: #f3f4f6; color: #1f2937; border-bottom-left-radius: 4px; align-self: flex-start; }
      #tv-typing { display: none; align-self: flex-start; padding: 10px 14px; background: #f3f4f6; border-radius: 16px; }
      #tv-typing.show { display: flex; gap: 4px; }
      #tv-typing span { width: 6px; height: 6px; background: #9ca3af; border-radius: 50%; animation: tv-bounce 1.4s infinite; }
      #tv-typing span:nth-child(2) { animation-delay: 0.2s; }
      #tv-typing span:nth-child(3) { animation-delay: 0.4s; }
      @keyframes tv-bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }
      #tv-input-area { padding: 12px 16px; border-top: 1px solid #e5e7eb; display: flex; gap: 8px; }
      #tv-input {
        flex: 1; border: 1px solid #d1d5db; border-radius: 24px; padding: 10px 16px;
        font-size: 14px; outline: none; resize: none; height: 40px;
      }
      #tv-input:focus { border-color: \${primaryColor}; box-shadow: 0 0 0 2px \${primaryColor}33; }
      #tv-send {
        width: 40px; height: 40px; border-radius: 50%; border: none;
        background: \${primaryColor}; color: white; cursor: pointer; display: flex;
        align-items: center; justify-content: center; flex-shrink: 0;
      }
      #tv-send:disabled { opacity: 0.5; cursor: not-allowed; }
      #tv-ticket-form { padding: 16px; display: none; flex-direction: column; gap: 10px; flex: 1; overflow-y: auto; }
      #tv-ticket-form.active { display: flex; }
      #tv-ticket-form input, #tv-ticket-form textarea {
        width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; outline: none;
      }
      #tv-ticket-form textarea { min-height: 100px; resize: vertical; }
      #tv-ticket-form button[type="submit"] {
        padding: 10px; border-radius: 8px; border: none; background: \${primaryColor};
        color: white; font-weight: 600; cursor: pointer; font-size: 14px;
      }
      #tv-ticket-success { display: none; text-align: center; padding: 40px 20px; color: #059669; }
      #tv-email-gate { padding: 20px; display: none; flex-direction: column; gap: 12px; align-items: center; justify-content: center; flex: 1; }
      #tv-email-gate.active { display: flex; }
      #tv-email-gate input { width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; }
      #tv-email-gate button { padding: 10px 24px; border-radius: 8px; border: none; background: \${primaryColor}; color: white; font-weight: 600; cursor: pointer; }
      @media (max-width: 420px) {
        #tv-panel { width: calc(100vw - 20px); left: 10px; right: 10px; bottom: 80px; height: 70vh; }
      }
    \`;
    document.head.appendChild(style);
  }

  // ─── Build DOM ───
  // Element refs live in this scope so event handlers never need getElementById
  var elBubble, elPanel, elMessages, elTyping, elInput, elSend, elEmailGate, elTicketForm;

  function buildWidget() {
    var existing = document.getElementById('tv-widget');
    if (existing) existing.parentNode.removeChild(existing);

    var container = document.createElement('div');
    container.id = 'tv-widget';
    container.innerHTML = \`
      <div id="tv-bubble">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </div>
      <div id="tv-panel">
        <div id="tv-header">
          <div id="tv-header-info">
            <div>
              <div class="name">\${config.botName || 'TechView Support'}</div>
              <div class="status">Online — typically replies instantly</div>
            </div>
          </div>
          <button id="tv-close">&times;</button>
        </div>
        <div id="tv-tabs">
          <button class="active" data-tab="chat">Chat</button>
          \${config.enableTickets ? '<button data-tab="ticket">Create Ticket</button>' : ''}
        </div>
        <div id="tv-email-gate">
          <div style="font-size:15px;font-weight:600;color:#374151;">Before we start</div>
          <div style="font-size:13px;color:#6b7280;text-align:center;">Enter your email so we can follow up if needed</div>
          <input type="email" id="tv-email-input" placeholder="you@example.com" />
          <input type="text" id="tv-name-input" placeholder="Your name (optional)" />
          <button id="tv-email-submit">Start Chat</button>
        </div>
        <div id="tv-messages"></div>
        <div id="tv-typing"><span></span><span></span><span></span></div>
        <div id="tv-input-area">
          <input type="text" id="tv-input" placeholder="\${config.placeholderText || 'Type your message...'}" />
          <button id="tv-send" disabled>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
        <div id="tv-ticket-form">
          <div style="font-weight:600;font-size:15px;color:#374151;">Create a Support Ticket</div>
          <input type="text" id="tv-ticket-title" placeholder="Brief summary of the issue" />
          <textarea id="tv-ticket-desc" placeholder="Describe the issue in detail..."></textarea>
          <input type="email" id="tv-ticket-email" placeholder="Your email (optional)" />
          <button type="submit" id="tv-ticket-submit">Submit Ticket</button>
          <div id="tv-ticket-success">
            <div style="font-size:32px;margin-bottom:8px;">&#10003;</div>
            <div style="font-weight:600;">Ticket Created!</div>
            <div style="font-size:13px;color:#6b7280;margin-top:4px;">We'll get back to you soon.</div>
          </div>
        </div>
      </div>
    \`;
    document.body.appendChild(container);

    // Cache element refs — never use getElementById inside handlers
    elBubble     = container.querySelector('#tv-bubble');
    elPanel      = container.querySelector('#tv-panel');
    elMessages   = container.querySelector('#tv-messages');
    elTyping     = container.querySelector('#tv-typing');
    elInput      = container.querySelector('#tv-input');
    elSend       = container.querySelector('#tv-send');
    elEmailGate  = container.querySelector('#tv-email-gate');
    elTicketForm = container.querySelector('#tv-ticket-form');

    elBubble.addEventListener('click', togglePanel);
    container.querySelector('#tv-close').addEventListener('click', togglePanel);

    elInput.addEventListener('input', function() { elSend.disabled = !elInput.value.trim(); });
    elInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    });
    elSend.addEventListener('click', handleSend);

    container.querySelectorAll('#tv-tabs button').forEach(function(btn) {
      btn.addEventListener('click', function() {
        container.querySelectorAll('#tv-tabs button').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        var tab = btn.getAttribute('data-tab');
        elMessages.style.display = tab === 'chat' ? 'flex' : 'none';
        elTyping.style.display = 'none';
        elInput.parentElement.style.display = tab === 'chat' ? 'flex' : 'none';
        elTicketForm.classList.toggle('active', tab === 'ticket');
      });
    });

    container.querySelector('#tv-email-submit').addEventListener('click', function() {
      var emailVal = container.querySelector('#tv-email-input').value;
      var nameVal  = container.querySelector('#tv-name-input').value;
      if (!emailVal) return;
      userInfo.email = emailVal;
      userInfo.name  = nameVal;
      elEmailGate.classList.remove('active');
      elMessages.style.display = 'flex';
      elInput.parentElement.style.display = 'flex';
      startSession();
    });

    container.querySelector('#tv-ticket-submit').addEventListener('click', function() {
      var title = container.querySelector('#tv-ticket-title').value;
      var desc  = container.querySelector('#tv-ticket-desc').value;
      var email = container.querySelector('#tv-ticket-email').value;
      if (!title || !desc) return;
      userInfo.email = email || userInfo.email;
      createTicket(title, desc).then(function() {
        var success = container.querySelector('#tv-ticket-success');
        success.style.display = 'block';
        container.querySelector('#tv-ticket-title').value = '';
        container.querySelector('#tv-ticket-desc').value  = '';
        setTimeout(function() { success.style.display = 'none'; }, 3000);
      });
    });
  }

  function togglePanel() {
    isOpen = !isOpen;
    elPanel.classList.toggle('open', isOpen);
    if (isOpen && !sessionId) {
      if (config.requireEmail) {
        elEmailGate.classList.add('active');
        elMessages.style.display = 'none';
        elInput.parentElement.style.display = 'none';
      } else {
        startSession();
      }
    }
  }

  function handleSend() {
    var val = elInput.value.trim();
    if (!val) return;
    elInput.value = '';
    elSend.disabled = true;
    sendMessage(val);
  }

  function appendMessage(role, content) {
    var div = document.createElement('div');
    div.className = 'tv-msg ' + role;
    div.textContent = content;
    elMessages.appendChild(div);
    elMessages.scrollTop = elMessages.scrollHeight;
  }

  function showTyping() { elTyping.classList.add('show'); }
  function hideTyping() { elTyping.classList.remove('show'); }

  // ─── Init ───
  loadConfig().then(function() {
    injectStyles(config.primaryColor || '#3b82f6', config.position || 'bottom-right');
    buildWidget();
    console.log('[TechView Widget] Loaded —', config.botName);
  }).catch(function(err) {
    console.error('[TechView Widget] Failed to load:', err);
  });

  // ─── Public API ───
  window.TechViewWidget = {
    open:        function() { if (!isOpen) togglePanel(); },
    close:       function() { if (isOpen) togglePanel(); },
    identify:    function(email, name) { userInfo.email = email; userInfo.name = name; },
    sendMessage: sendMessage,
  };

})(window, document);
`;
