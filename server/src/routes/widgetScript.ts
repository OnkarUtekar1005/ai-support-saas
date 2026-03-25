import { Router, Request, Response } from 'express';

export const widgetScriptRoutes = Router();

/**
 * Serve the embeddable chat widget.
 * Usage: <script src="http://localhost:3001/widget.js?key=sk_live_xxx"></script>
 */
widgetScriptRoutes.get('/widget.js', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(WIDGET_SCRIPT);
});

const WIDGET_SCRIPT = `
(function(window, document) {
  'use strict';

  // ─── Extract config from script tag ───
  var scripts = document.getElementsByTagName('script');
  var currentScript = scripts[scripts.length - 1];
  var scriptSrc = currentScript.src;
  var urlParams = new URL(scriptSrc).searchParams;
  var API_KEY = urlParams.get('key') || '';
  var BASE_URL = new URL(scriptSrc).origin;
  var API_URL = BASE_URL + '/api/widget';

  var sessionId = null;
  var config = {};
  var isOpen = false;
  var userInfo = { email: null, name: null };
  var VISITOR_ID = localStorage.getItem('_acrm_vid') || ('v_' + Math.random().toString(36).substr(2, 12));
  localStorage.setItem('_acrm_vid', VISITOR_ID);

  // ─── API helper ───
  function api(endpoint, method, data) {
    return fetch(API_URL + endpoint, {
      method: method || 'GET',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: data ? JSON.stringify(data) : undefined
    }).then(function(r) { return r.json(); });
  }

  // ─── Load config from server ───
  function loadConfig() {
    return api('/config', 'GET').then(function(cfg) {
      config = cfg;
      return cfg;
    });
  }

  // ─── Create chat session ───
  function startSession() {
    return api('/session', 'POST', {
      email: userInfo.email,
      name: userInfo.name,
      visitorId: VISITOR_ID,
      pageUrl: window.location.href
    }).then(function(res) {
      sessionId = res.sessionId;
      if (res.messages) {
        res.messages.forEach(function(m) { appendMessage(m.role, m.content); });
      }
    });
  }

  // ─── Send message ───
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

  // ─── Create ticket ───
  function createTicket(title, description) {
    return api('/ticket', 'POST', {
      title: title,
      description: description,
      email: userInfo.email,
      name: userInfo.name,
      sessionId: sessionId
    });
  }

  // ─── Inject CSS ───
  function injectStyles(primaryColor, position) {
    var pos = position === 'bottom-left' ? 'left: 20px;' : 'right: 20px;';
    var style = document.createElement('style');
    style.textContent = \`
      #acrm-widget * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
      #acrm-bubble {
        position: fixed; bottom: 20px; \${pos} width: 60px; height: 60px;
        border-radius: 50%; background: \${primaryColor}; color: white;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer; box-shadow: 0 4px 16px rgba(0,0,0,0.2);
        z-index: 99999; transition: transform 0.2s;
      }
      #acrm-bubble:hover { transform: scale(1.1); }
      #acrm-bubble svg { width: 28px; height: 28px; }
      #acrm-panel {
        position: fixed; bottom: 90px; \${pos} width: 380px; height: 520px;
        background: white; border-radius: 16px; box-shadow: 0 8px 40px rgba(0,0,0,0.15);
        z-index: 99999; display: none; flex-direction: column; overflow: hidden;
      }
      #acrm-panel.open { display: flex; }
      #acrm-header {
        background: \${primaryColor}; color: white; padding: 16px 20px;
        display: flex; align-items: center; justify-content: space-between;
      }
      #acrm-header-info { display: flex; align-items: center; gap: 10px; }
      #acrm-header-info .name { font-weight: 600; font-size: 15px; }
      #acrm-header-info .status { font-size: 11px; opacity: 0.85; }
      #acrm-close { background: none; border: none; color: white; cursor: pointer; font-size: 20px; padding: 4px; }
      #acrm-tabs { display: flex; border-bottom: 1px solid #e5e7eb; }
      #acrm-tabs button {
        flex: 1; padding: 10px; font-size: 13px; font-weight: 500; border: none;
        background: white; cursor: pointer; color: #6b7280; border-bottom: 2px solid transparent;
      }
      #acrm-tabs button.active { color: \${primaryColor}; border-bottom-color: \${primaryColor}; }
      #acrm-messages {
        flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 8px;
      }
      .acrm-msg {
        max-width: 80%; padding: 10px 14px; border-radius: 16px; font-size: 14px; line-height: 1.5;
        word-wrap: break-word; animation: acrm-fade 0.3s ease;
      }
      @keyframes acrm-fade { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      .acrm-msg.user { background: \${primaryColor}; color: white; border-bottom-right-radius: 4px; align-self: flex-end; }
      .acrm-msg.assistant { background: #f3f4f6; color: #1f2937; border-bottom-left-radius: 4px; align-self: flex-start; }
      #acrm-typing { display: none; align-self: flex-start; padding: 10px 14px; background: #f3f4f6; border-radius: 16px; }
      #acrm-typing.show { display: flex; gap: 4px; }
      #acrm-typing span { width: 6px; height: 6px; background: #9ca3af; border-radius: 50%; animation: acrm-bounce 1.4s infinite; }
      #acrm-typing span:nth-child(2) { animation-delay: 0.2s; }
      #acrm-typing span:nth-child(3) { animation-delay: 0.4s; }
      @keyframes acrm-bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }
      #acrm-input-area { padding: 12px 16px; border-top: 1px solid #e5e7eb; display: flex; gap: 8px; }
      #acrm-input {
        flex: 1; border: 1px solid #d1d5db; border-radius: 24px; padding: 10px 16px;
        font-size: 14px; outline: none; resize: none; height: 40px;
      }
      #acrm-input:focus { border-color: \${primaryColor}; box-shadow: 0 0 0 2px \${primaryColor}33; }
      #acrm-send {
        width: 40px; height: 40px; border-radius: 50%; border: none;
        background: \${primaryColor}; color: white; cursor: pointer; display: flex;
        align-items: center; justify-content: center; flex-shrink: 0;
      }
      #acrm-send:disabled { opacity: 0.5; cursor: not-allowed; }
      /* Ticket form */
      #acrm-ticket-form { padding: 16px; display: none; flex-direction: column; gap: 10px; flex: 1; overflow-y: auto; }
      #acrm-ticket-form.active { display: flex; }
      #acrm-ticket-form input, #acrm-ticket-form textarea {
        width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; outline: none;
      }
      #acrm-ticket-form textarea { min-height: 100px; resize: vertical; }
      #acrm-ticket-form button[type="submit"] {
        padding: 10px; border-radius: 8px; border: none; background: \${primaryColor};
        color: white; font-weight: 600; cursor: pointer; font-size: 14px;
      }
      #acrm-ticket-success { display: none; text-align: center; padding: 40px 20px; color: #059669; }
      /* Email gate */
      #acrm-email-gate { padding: 20px; display: none; flex-direction: column; gap: 12px; align-items: center; justify-content: center; flex: 1; }
      #acrm-email-gate.active { display: flex; }
      #acrm-email-gate input { width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; }
      #acrm-email-gate button { padding: 10px 24px; border-radius: 8px; border: none; background: \${primaryColor}; color: white; font-weight: 600; cursor: pointer; }
      @media (max-width: 420px) {
        #acrm-panel { width: calc(100vw - 20px); left: 10px; right: 10px; bottom: 80px; height: 70vh; }
      }
    \`;
    document.head.appendChild(style);
  }

  // ─── Build DOM ───
  function buildWidget() {
    var container = document.createElement('div');
    container.id = 'acrm-widget';

    // Chat bubble
    container.innerHTML = \`
      <div id="acrm-bubble">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </div>
      <div id="acrm-panel">
        <div id="acrm-header">
          <div id="acrm-header-info">
            <div>
              <div class="name">\${config.botName || 'AI Support'}</div>
              <div class="status">Online — typically replies instantly</div>
            </div>
          </div>
          <button id="acrm-close">&times;</button>
        </div>
        <div id="acrm-tabs">
          <button class="active" data-tab="chat">Chat</button>
          \${config.enableTickets ? '<button data-tab="ticket">Create Ticket</button>' : ''}
        </div>
        <div id="acrm-email-gate">
          <div style="font-size:15px;font-weight:600;color:#374151;">Before we start</div>
          <div style="font-size:13px;color:#6b7280;text-align:center;">Enter your email so we can follow up if needed</div>
          <input type="email" id="acrm-email-input" placeholder="you@example.com" />
          <input type="text" id="acrm-name-input" placeholder="Your name (optional)" />
          <button id="acrm-email-submit">Start Chat</button>
        </div>
        <div id="acrm-messages"></div>
        <div id="acrm-typing"><span></span><span></span><span></span></div>
        <div id="acrm-input-area">
          <input type="text" id="acrm-input" placeholder="\${config.placeholderText || 'Type your message...'}" />
          <button id="acrm-send" disabled>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>
        <div id="acrm-ticket-form">
          <div style="font-weight:600;font-size:15px;color:#374151;">Create a Support Ticket</div>
          <input type="text" id="acrm-ticket-title" placeholder="Brief summary of the issue" />
          <textarea id="acrm-ticket-desc" placeholder="Describe the issue in detail..."></textarea>
          <input type="email" id="acrm-ticket-email" placeholder="Your email (optional)" value="" />
          <button type="submit" id="acrm-ticket-submit">Submit Ticket</button>
          <div id="acrm-ticket-success">
            <div style="font-size:32px;margin-bottom:8px;">&#10003;</div>
            <div style="font-weight:600;">Ticket Created!</div>
            <div style="font-size:13px;color:#6b7280;margin-top:4px;">We'll get back to you soon.</div>
          </div>
        </div>
      </div>
    \`;

    document.body.appendChild(container);

    // ─── Event listeners ───
    document.getElementById('acrm-bubble').onclick = togglePanel;
    document.getElementById('acrm-close').onclick = togglePanel;

    var input = document.getElementById('acrm-input');
    var sendBtn = document.getElementById('acrm-send');
    input.addEventListener('input', function() { sendBtn.disabled = !input.value.trim(); });
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    });
    sendBtn.onclick = handleSend;

    // Tabs
    document.querySelectorAll('#acrm-tabs button').forEach(function(btn) {
      btn.onclick = function() {
        document.querySelectorAll('#acrm-tabs button').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        var tab = btn.getAttribute('data-tab');
        document.getElementById('acrm-messages').style.display = tab === 'chat' ? 'flex' : 'none';
        document.getElementById('acrm-typing').style.display = 'none';
        document.getElementById('acrm-input-area').style.display = tab === 'chat' ? 'flex' : 'none';
        document.getElementById('acrm-ticket-form').classList.toggle('active', tab === 'ticket');
      };
    });

    // Email gate
    document.getElementById('acrm-email-submit').onclick = function() {
      var emailVal = document.getElementById('acrm-email-input').value;
      var nameVal = document.getElementById('acrm-name-input').value;
      if (!emailVal) return;
      userInfo.email = emailVal;
      userInfo.name = nameVal;
      document.getElementById('acrm-email-gate').classList.remove('active');
      document.getElementById('acrm-messages').style.display = 'flex';
      document.getElementById('acrm-input-area').style.display = 'flex';
      startSession();
    };

    // Ticket submit
    document.getElementById('acrm-ticket-submit').onclick = function() {
      var title = document.getElementById('acrm-ticket-title').value;
      var desc = document.getElementById('acrm-ticket-desc').value;
      var email = document.getElementById('acrm-ticket-email').value;
      if (!title || !desc) return;
      userInfo.email = email || userInfo.email;
      createTicket(title, desc).then(function() {
        document.getElementById('acrm-ticket-success').style.display = 'block';
        document.getElementById('acrm-ticket-title').value = '';
        document.getElementById('acrm-ticket-desc').value = '';
        setTimeout(function() { document.getElementById('acrm-ticket-success').style.display = 'none'; }, 3000);
      });
    };
  }

  function togglePanel() {
    isOpen = !isOpen;
    var panel = document.getElementById('acrm-panel');
    panel.classList.toggle('open', isOpen);

    if (isOpen && !sessionId) {
      if (config.requireEmail) {
        document.getElementById('acrm-email-gate').classList.add('active');
        document.getElementById('acrm-messages').style.display = 'none';
        document.getElementById('acrm-input-area').style.display = 'none';
      } else {
        startSession();
      }
    }
  }

  function handleSend() {
    var input = document.getElementById('acrm-input');
    var val = input.value.trim();
    if (!val) return;
    input.value = '';
    document.getElementById('acrm-send').disabled = true;
    sendMessage(val);
  }

  function appendMessage(role, content) {
    var container = document.getElementById('acrm-messages');
    var div = document.createElement('div');
    div.className = 'acrm-msg ' + role;
    div.textContent = content;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function showTyping() { document.getElementById('acrm-typing').classList.add('show'); }
  function hideTyping() { document.getElementById('acrm-typing').classList.remove('show'); }

  // ─── Init ───
  loadConfig().then(function() {
    injectStyles(config.primaryColor || '#3b82f6', config.position || 'bottom-right');
    buildWidget();
    console.log('[AiCRM Widget] Loaded —', config.botName);
  }).catch(function(err) {
    console.error('[AiCRM Widget] Failed to load:', err);
  });

  // ─── Public API ───
  window.AiCRMWidget = {
    open: function() { if (!isOpen) togglePanel(); },
    close: function() { if (isOpen) togglePanel(); },
    identify: function(email, name) { userInfo.email = email; userInfo.name = name; },
    sendMessage: sendMessage,
  };

})(window, document);
`;
