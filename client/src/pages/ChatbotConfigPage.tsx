import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { Save, Bot, Eye, MessageSquare, X } from 'lucide-react';
import { ProjectSelector } from '../components/shared';

const DEFAULT_CONFIG = {
  botName: 'AI Support',
  welcomeMessage: 'Hi! How can I help you today?',
  systemPrompt: '',
  placeholderText: 'Type your message...',
  primaryColor: '#3b82f6',
  position: 'bottom-right',
  avatarUrl: '',
  enableChat: true,
  enableTickets: true,
  enableFileUpload: false,
  requireEmail: false,
  autoReply: true,
  offlineMessage: "We're offline right now. Leave a message and we'll get back to you.",
  knowledgeContext: '',
};

export function ChatbotConfigPage() {
  const [searchParams] = useSearchParams();
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState(searchParams.get('projectId') || '');
  const [config, setConfig] = useState<any>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState<'config' | 'conversations' | 'preview'>('config');
  const [sessions, setSessions] = useState<any[]>([]);
  const [viewSession, setViewSession] = useState<any>(null);

  useEffect(() => {
    api.getProjects().then((p: any) => {
      setProjects(p);
      if (!selectedProject && p.length > 0) setSelectedProject(p[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    setLoading(true);
    api.getChatbotConfig(selectedProject).then((data: any) => {
      if (data) {
        setConfig({ ...DEFAULT_CONFIG, ...data });
      } else {
        const proj = projects.find((p) => p.id === selectedProject);
        setConfig({
          ...DEFAULT_CONFIG,
          systemPrompt: `You are a helpful customer support assistant for ${proj?.name || 'our product'}. Be friendly, concise, and helpful. If you don't know the answer, suggest the user create a support ticket.`,
          primaryColor: proj?.color || '#3b82f6',
        });
      }
      setLoading(false);
    });
  }, [selectedProject]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.saveChatbotConfig(selectedProject, config);
      setMessage('Chatbot configuration saved!');
      setTimeout(() => setMessage(''), 3000);
    } catch {
      setMessage('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const loadSessions = async () => {
    const data: any = await api.getChatbotSessions(selectedProject);
    setSessions(data);
  };

  const viewConversation = async (sessionId: string) => {
    const data = await api.getChatbotSession(selectedProject, sessionId);
    setViewSession(data);
  };

  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#0f172a'];

  const CRM_URL = window.location.origin.replace(':5173', ':3001');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Chatbot Configuration</h1>
          <p className="text-sm text-gray-500 mt-1">Configure the AI chatbot for each project</p>
        </div>
        <div className="flex gap-2">
          <ProjectSelector projects={projects} value={selectedProject} onChange={setSelectedProject} />
        </div>
      </div>

      {message && <div className="bg-green-50 text-green-700 px-4 py-2 rounded-lg text-sm mb-4">{message}</div>}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {[
          { key: 'config', label: 'Configuration', icon: Bot },
          { key: 'conversations', label: 'Conversations', icon: MessageSquare },
          { key: 'preview', label: 'Embed Code', icon: Eye },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key as any); if (t.key === 'conversations') loadSessions(); }}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key ? 'border-sky-600 text-sky-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {loading ? <div className="text-gray-500">Loading...</div> : (
        <>
          {/* ─── Config Tab ─── */}
          {tab === 'config' && (
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                {/* Bot Identity */}
                <div className="card space-y-3">
                  <h2 className="font-semibold">Bot Identity</h2>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Bot Name</label>
                    <input value={config.botName} onChange={(e) => setConfig((c: any) => ({ ...c, botName: e.target.value }))} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Welcome Message</label>
                    <input value={config.welcomeMessage} onChange={(e) => setConfig((c: any) => ({ ...c, welcomeMessage: e.target.value }))} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Input Placeholder</label>
                    <input value={config.placeholderText} onChange={(e) => setConfig((c: any) => ({ ...c, placeholderText: e.target.value }))} className="input-field" />
                  </div>
                </div>

                {/* AI Behavior */}
                <div className="card space-y-3">
                  <h2 className="font-semibold">AI Behavior</h2>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">System Prompt (AI personality & instructions)</label>
                    <textarea
                      value={config.systemPrompt}
                      onChange={(e) => setConfig((c: any) => ({ ...c, systemPrompt: e.target.value }))}
                      className="input-field min-h-[120px]"
                      placeholder="You are a helpful support assistant for..."
                    />
                    <p className="text-xs text-gray-400 mt-1">This controls how the AI responds. Include product knowledge, tone, boundaries.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Knowledge Context (FAQs, product info fed to AI)</label>
                    <textarea
                      value={config.knowledgeContext}
                      onChange={(e) => setConfig((c: any) => ({ ...c, knowledgeContext: e.target.value }))}
                      className="input-field min-h-[100px]"
                      placeholder="Product X is a billing platform...\nPricing: Starter $10/mo, Pro $49/mo...\nCommon issues: ..."
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Offline Message</label>
                    <input value={config.offlineMessage || ''} onChange={(e) => setConfig((c: any) => ({ ...c, offlineMessage: e.target.value }))} className="input-field" />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {/* Theme */}
                <div className="card space-y-3">
                  <h2 className="font-semibold">Theme</h2>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Primary Color</label>
                    <div className="flex gap-2">
                      {colors.map((c) => (
                        <button
                          key={c} type="button"
                          onClick={() => setConfig((cfg: any) => ({ ...cfg, primaryColor: c }))}
                          className={`w-8 h-8 rounded-full border-2 transition-all ${config.primaryColor === c ? 'border-gray-900 scale-110' : 'border-transparent'}`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                      <input type="color" value={config.primaryColor} onChange={(e) => setConfig((c: any) => ({ ...c, primaryColor: e.target.value }))} className="w-8 h-8 rounded cursor-pointer" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Position</label>
                    <select value={config.position} onChange={(e) => setConfig((c: any) => ({ ...c, position: e.target.value }))} className="input-field">
                      <option value="bottom-right">Bottom Right</option>
                      <option value="bottom-left">Bottom Left</option>
                    </select>
                  </div>
                </div>

                {/* Features */}
                <div className="card space-y-3">
                  <h2 className="font-semibold">Features</h2>
                  {[
                    { key: 'enableChat', label: 'Enable AI Chat', desc: 'Users can chat with AI assistant' },
                    { key: 'enableTickets', label: 'Enable Ticket Creation', desc: 'Users can submit support tickets from widget' },
                    { key: 'autoReply', label: 'AI Auto-Reply', desc: 'AI automatically responds to messages' },
                    { key: 'requireEmail', label: 'Require Email', desc: 'Ask for email before starting chat' },
                  ].map((f) => (
                    <label key={f.key} className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config[f.key]}
                        onChange={(e) => setConfig((c: any) => ({ ...c, [f.key]: e.target.checked }))}
                        className="rounded mt-0.5"
                      />
                      <div>
                        <div className="text-sm font-medium">{f.label}</div>
                        <div className="text-xs text-gray-500">{f.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>

                {/* Live preview bubble */}
                <div className="card">
                  <h2 className="font-semibold mb-3">Preview</h2>
                  <div className="bg-gray-100 rounded-lg p-6 relative h-48 flex items-end justify-end">
                    <div
                      className="w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg cursor-pointer"
                      style={{ backgroundColor: config.primaryColor }}
                    >
                      <MessageSquare className="w-6 h-6" />
                    </div>
                    <div className="absolute top-4 right-4 bg-white rounded-xl shadow-lg p-4 w-56">
                      <div className="font-semibold text-sm" style={{ color: config.primaryColor }}>{config.botName}</div>
                      <div className="text-xs text-gray-500 mt-1">{config.welcomeMessage}</div>
                    </div>
                  </div>
                </div>

                <button onClick={handleSave} disabled={saving} className="btn-primary w-full flex items-center justify-center gap-2">
                  <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Configuration'}
                </button>
              </div>
            </div>
          )}

          {/* ─── Conversations Tab ─── */}
          {tab === 'conversations' && (
            <div className="flex gap-4 h-[600px]">
              <div className="w-80 bg-white border border-gray-200 rounded-xl overflow-auto">
                {sessions.length === 0 ? (
                  <div className="p-6 text-center text-gray-500 text-sm">No conversations yet</div>
                ) : sessions.map((s: any) => (
                  <button
                    key={s.id}
                    onClick={() => viewConversation(s.id)}
                    className={`w-full text-left p-3 border-b border-gray-100 hover:bg-gray-50 ${viewSession?.id === s.id ? 'bg-sky-50' : ''}`}
                  >
                    <div className="text-sm font-medium truncate">{s.visitorEmail || s.visitorName || 'Anonymous'}</div>
                    <div className="text-xs text-gray-500 truncate">{s.messages?.[0]?.content || 'No messages'}</div>
                    <div className="text-xs text-gray-400 mt-1">{new Date(s.updatedAt).toLocaleString()} — {s._count?.messages || 0} msgs</div>
                  </button>
                ))}
              </div>
              <div className="flex-1 bg-white border border-gray-200 rounded-xl flex flex-col">
                {!viewSession ? (
                  <div className="flex-1 flex items-center justify-center text-gray-400">Select a conversation</div>
                ) : (
                  <>
                    <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                      <div>
                        <div className="font-medium text-sm">{viewSession.visitorEmail || 'Anonymous'}</div>
                        <div className="text-xs text-gray-500">{viewSession.pageUrl}</div>
                      </div>
                      <button onClick={() => setViewSession(null)}><X className="w-4 h-4 text-gray-400" /></button>
                    </div>
                    <div className="flex-1 overflow-auto p-4 space-y-2">
                      {viewSession.messages?.map((m: any) => (
                        <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={m.role === 'user' ? 'chat-message-user' : 'chat-message-assistant'}>
                            {m.content}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ─── Embed Code Tab ─── */}
          {tab === 'preview' && (
            <div className="max-w-2xl space-y-4">
              <div className="card">
                <h2 className="font-semibold mb-3">Embed the Chat Widget</h2>
                <p className="text-sm text-gray-600 mb-4">
                  Add this single line of code to your website or web app. The chat widget will appear as a floating bubble.
                  Make sure you have an API key scoped to this project (create one in <strong>Integrations</strong>).
                </p>
                <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm">
                  {`<script src="${CRM_URL}/widget.js?key=YOUR_API_KEY"></script>`}
                </div>
                <p className="text-xs text-gray-500 mt-2">Replace <code>YOUR_API_KEY</code> with an API key scoped to this project.</p>
              </div>

              <div className="card">
                <h2 className="font-semibold mb-3">JavaScript API (optional)</h2>
                <p className="text-sm text-gray-600 mb-3">Control the widget programmatically after it loads:</p>
                <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-sm overflow-x-auto whitespace-pre">{`// Identify logged-in user (syncs to CRM contacts)
AiCRMWidget.identify('user@example.com', 'John Doe');

// Open chat programmatically
AiCRMWidget.open();

// Close chat
AiCRMWidget.close();

// Send a message on behalf of user
AiCRMWidget.sendMessage('I need help with billing');`}</pre>
              </div>

              <div className="card">
                <h2 className="font-semibold mb-3">For Mobile Apps</h2>
                <p className="text-sm text-gray-600 mb-3">Use the REST API directly with your API key:</p>
                <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-sm overflow-x-auto whitespace-pre">{`// 1. Get chatbot config
GET ${CRM_URL}/api/widget/config
Headers: { x-api-key: YOUR_API_KEY }

// 2. Start a session
POST ${CRM_URL}/api/widget/session
Body: { email, name, visitorId }

// 3. Send message & get AI response
POST ${CRM_URL}/api/widget/message
Body: { sessionId, content: "user's message" }
Response: { userMessage, aiMessage }

// 4. Create ticket
POST ${CRM_URL}/api/widget/ticket
Body: { title, description, email }`}</pre>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
