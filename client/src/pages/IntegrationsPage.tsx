import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Plus, Key, Copy, Check, Trash2, Globe, Smartphone, Server, Eye, EyeOff, Code, BarChart3 } from 'lucide-react';

const PLATFORM_ICONS: Record<string, any> = { web: Globe, ios: Smartphone, android: Smartphone, server: Server };
const PLATFORM_LABELS: Record<string, string> = { web: 'Website / Web App', ios: 'iOS App', android: 'Android App', server: 'Backend Server' };

export function IntegrationsPage() {
  const [keys, setKeys] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showSnippet, setShowSnippet] = useState<string | null>(null);
  const [newKeyRevealed, setNewKeyRevealed] = useState<string | null>(null); // full key shown once
  const [copied, setCopied] = useState('');
  const [stats, setStats] = useState<Record<string, any>>({});
  const [form, setForm] = useState({
    name: '', platform: 'web', projectId: '',
    allowedOrigins: [''], permissions: ['contacts', 'tickets', 'errors', 'events'],
  });

  useEffect(() => {
    Promise.all([api.getApiKeys(), api.getProjects()]).then(([k, p]: any) => {
      setKeys(k);
      setProjects(p);
      setLoading(false);
    });
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      ...form,
      allowedOrigins: form.allowedOrigins.filter(Boolean),
      projectId: form.projectId || null,
    };
    const result: any = await api.createApiKey(data);
    setNewKeyRevealed(result.key); // Show full key once
    setKeys((prev) => [{ ...result, key: result.key.substring(0, 12) + '...' + result.key.slice(-4) }, ...prev]);
    setShowCreate(false);
    setForm({ name: '', platform: 'web', projectId: '', allowedOrigins: [''], permissions: ['contacts', 'tickets', 'errors', 'events'] });
  };

  const deleteKey = async (id: string) => {
    if (!confirm('Delete this API key? Any apps using it will stop working.')) return;
    await api.deleteApiKey(id);
    setKeys((prev) => prev.filter((k) => k.id !== id));
  };

  const toggleActive = async (id: string, isActive: boolean) => {
    await api.updateApiKey(id, { isActive: !isActive });
    setKeys((prev) => prev.map((k) => (k.id === id ? { ...k, isActive: !isActive } : k)));
  };

  const loadStats = async (id: string) => {
    if (stats[id]) { setStats((s) => { const n = { ...s }; delete n[id]; return n; }); return; }
    const data = await api.getApiKeyStats(id);
    setStats((s) => ({ ...s, [id]: data }));
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  };

  const CRM_URL = window.location.origin.replace(':5173', ':3001');

  const getSnippet = (key: string, platform: string) => {
    if (platform === 'web') {
      return `<!-- AI Support + CRM SDK -->
<script src="${CRM_URL}/sdk.js?key=${key}"></script>
<script>
  // Identify logged-in users (call after login)
  AiCRM.identify({
    email: 'user@example.com',
    firstName: 'John',
    lastName: 'Doe'
  });

  // Track custom events
  AiCRM.track('purchase_completed', { amount: 99.99, plan: 'pro' });

  // Create support ticket
  AiCRM.ticket({
    title: 'Bug report',
    description: 'Something is not working',
    priority: 'HIGH'
  });

  // Errors are auto-captured! No code needed.
</script>`;
    }
    if (platform === 'ios' || platform === 'android') {
      return `// AI Support + CRM — Mobile Integration
// Use REST API with x-api-key header

const CRM_URL = '${CRM_URL}/api/sdk';
const API_KEY = '${key}';

const headers = {
  'Content-Type': 'application/json',
  'x-api-key': API_KEY
};

// Identify user after login
fetch(CRM_URL + '/identify', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName
  })
});

// Log errors
fetch(CRM_URL + '/error', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    message: error.message,
    stack: error.stack,
    source: 'mobile-app',
    level: 'ERROR'
  })
});

// Create support ticket
fetch(CRM_URL + '/ticket', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    title: 'User reported issue',
    description: 'Details here...',
    email: user.email
  })
});`;
    }
    // Server
    return `// AI Support + CRM — Server Integration
const CRM_URL = '${CRM_URL}/api/sdk';
const API_KEY = '${key}';

async function crmRequest(endpoint, data) {
  const res = await fetch(CRM_URL + endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY
    },
    body: JSON.stringify(data)
  });
  return res.json();
}

// Auto-log errors from your app
process.on('uncaughtException', (err) => {
  crmRequest('/error', {
    message: err.message,
    stack: err.stack,
    source: 'your-app-name',
    level: 'FATAL'
  });
});

// Identify contacts
await crmRequest('/identify', {
  email: 'customer@example.com',
  firstName: 'Jane',
  lastName: 'Smith'
});

// Track events
await crmRequest('/track', {
  event: 'subscription_created',
  properties: { plan: 'pro', amount: 49.99 }
});

// Create tickets
await crmRequest('/ticket', {
  title: 'API Integration Error',
  description: 'Payment webhook failed',
  priority: 'HIGH',
  email: 'customer@example.com'
});`;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>
          <p className="text-sm text-gray-500 mt-1">Connect your websites, mobile apps, and servers to the CRM</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> New API Key
        </button>
      </div>

      {/* How it works */}
      <div className="card mb-6 bg-blue-50/50 border-blue-200">
        <h2 className="font-semibold text-blue-900 mb-2">How to connect your app</h2>
        <div className="grid md:grid-cols-3 gap-4 text-sm">
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">1</div>
            <div><strong>Create API Key</strong> — Choose your platform (web, mobile, server) and assign to a project</div>
          </div>
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">2</div>
            <div><strong>Add the snippet</strong> — Copy the code snippet into your app</div>
          </div>
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">3</div>
            <div><strong>Data flows in</strong> — Contacts, errors, events, and tickets appear in your CRM automatically</div>
          </div>
        </div>
      </div>

      {/* New key revealed banner */}
      {newKeyRevealed && (
        <div className="card mb-4 bg-green-50 border-green-300">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-green-800">API Key Created — Save it now!</h3>
              <p className="text-xs text-green-700 mt-1">This is the only time the full key will be shown.</p>
            </div>
            <button onClick={() => setNewKeyRevealed(null)} className="text-green-600 text-sm">Dismiss</button>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <code className="flex-1 bg-white px-3 py-2 rounded border border-green-300 text-sm font-mono select-all">{newKeyRevealed}</code>
            <button onClick={() => copyToClipboard(newKeyRevealed, 'key')} className="btn-primary text-sm px-3">
              {copied === 'key' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {/* API Keys list */}
      {loading ? <div className="text-gray-500">Loading...</div> : keys.length === 0 ? (
        <div className="card text-center text-gray-500 py-12">
          <Key className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>No API keys yet. Create one to connect your first app.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {keys.map((k) => {
            const Icon = PLATFORM_ICONS[k.platform] || Globe;
            return (
              <div key={k.id} className="card">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Icon className="w-5 h-5 text-gray-400" />
                    <div>
                      <div className="font-semibold text-sm flex items-center gap-2">
                        {k.name}
                        {!k.isActive && <span className="px-1.5 py-0.5 text-xs bg-red-100 text-red-700 rounded">Disabled</span>}
                      </div>
                      <div className="text-xs text-gray-500 flex items-center gap-3 mt-0.5">
                        <span>{PLATFORM_LABELS[k.platform] || k.platform}</span>
                        {k.project && (
                          <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: k.project.color }} />
                            {k.project.name}
                          </span>
                        )}
                        <span className="font-mono">{k.key}</span>
                        {k.lastUsedAt && <span>Last used: {new Date(k.lastUsedAt).toLocaleDateString()}</span>}
                        <span>{k.usageCount.toLocaleString()} events</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button onClick={() => loadStats(k.id)} className="p-2 text-gray-400 hover:text-blue-600" title="Stats">
                      <BarChart3 className="w-4 h-4" />
                    </button>
                    <button onClick={() => setShowSnippet(showSnippet === k.id ? null : k.id)} className="p-2 text-gray-400 hover:text-blue-600" title="Code snippet">
                      <Code className="w-4 h-4" />
                    </button>
                    <button onClick={() => toggleActive(k.id, k.isActive)} className="p-2 text-gray-400 hover:text-yellow-600" title={k.isActive ? 'Disable' : 'Enable'}>
                      {k.isActive ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <button onClick={() => deleteKey(k.id)} className="p-2 text-gray-400 hover:text-red-600" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Stats panel */}
                {stats[k.id] && (
                  <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-4 gap-3 text-center">
                    <div className="bg-gray-50 rounded p-2">
                      <div className="text-lg font-bold">{stats[k.id].total}</div>
                      <div className="text-xs text-gray-500">Total Events</div>
                    </div>
                    <div className="bg-gray-50 rounded p-2">
                      <div className="text-lg font-bold">{stats[k.id].last24h}</div>
                      <div className="text-xs text-gray-500">Last 24h</div>
                    </div>
                    <div className="bg-gray-50 rounded p-2">
                      <div className="text-lg font-bold">{stats[k.id].last7d}</div>
                      <div className="text-xs text-gray-500">Last 7d</div>
                    </div>
                    <div className="bg-gray-50 rounded p-2 text-xs text-left">
                      {Object.entries(stats[k.id].byType || {}).map(([t, c]: any) => (
                        <div key={t}>{t}: <strong>{c}</strong></div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Code snippet */}
                {showSnippet === k.id && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-gray-500">Integration Code ({PLATFORM_LABELS[k.platform]})</span>
                      <button
                        onClick={() => copyToClipboard(getSnippet('YOUR_API_KEY', k.platform), 'snippet-' + k.id)}
                        className="text-xs text-blue-600 flex items-center gap-1"
                      >
                        {copied === 'snippet-' + k.id ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                      </button>
                    </div>
                    <pre className="bg-gray-900 text-green-400 text-xs p-4 rounded-lg overflow-x-auto whitespace-pre">{getSnippet('YOUR_API_KEY', k.platform)}</pre>
                    <p className="text-xs text-gray-500 mt-2">Replace <code>YOUR_API_KEY</code> with your actual key shown above.</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleCreate} className="bg-white rounded-xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-bold">Create API Key</h2>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name (what app is this for?)</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input-field" placeholder="e.g. Production Website, Mobile App iOS" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Platform</label>
              <div className="grid grid-cols-4 gap-2">
                {(['web', 'ios', 'android', 'server'] as const).map((p) => {
                  const I = PLATFORM_ICONS[p];
                  return (
                    <button
                      key={p} type="button"
                      onClick={() => setForm((f) => ({ ...f, platform: p }))}
                      className={`p-3 rounded-lg border text-center text-xs font-medium transition-all ${
                        form.platform === p ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      <I className="w-5 h-5 mx-auto mb-1" />
                      {p === 'web' ? 'Web' : p === 'ios' ? 'iOS' : p === 'android' ? 'Android' : 'Server'}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Project (optional — scopes data to a project)</label>
              <select value={form.projectId} onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))} className="input-field">
                <option value="">All Projects</option>
                {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Allowed Origins (for web — leave empty to allow all)</label>
              {form.allowedOrigins.map((origin, i) => (
                <div key={i} className="flex gap-2 mb-1">
                  <input
                    value={origin}
                    onChange={(e) => {
                      const origins = [...form.allowedOrigins];
                      origins[i] = e.target.value;
                      setForm((f) => ({ ...f, allowedOrigins: origins }));
                    }}
                    className="input-field"
                    placeholder="https://myapp.com"
                  />
                  {form.allowedOrigins.length > 1 && (
                    <button type="button" onClick={() => setForm((f) => ({ ...f, allowedOrigins: f.allowedOrigins.filter((_, j) => j !== i) }))} className="text-red-500 text-sm">Remove</button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => setForm((f) => ({ ...f, allowedOrigins: [...f.allowedOrigins, ''] }))} className="text-blue-600 text-xs font-medium">+ Add origin</button>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Permissions</label>
              <div className="flex flex-wrap gap-2">
                {['contacts', 'tickets', 'errors', 'events'].map((p) => (
                  <label key={p} className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={form.permissions.includes(p)}
                      onChange={(e) => {
                        setForm((f) => ({
                          ...f,
                          permissions: e.target.checked ? [...f.permissions, p] : f.permissions.filter((x) => x !== p),
                        }));
                      }}
                      className="rounded"
                    />
                    <span className="text-sm capitalize">{p}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
              <button type="submit" className="btn-primary">Create API Key</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
