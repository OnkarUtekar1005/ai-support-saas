import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Plus, Database, Trash2, Play, CheckCircle, XCircle, Loader2 } from 'lucide-react';

export function DatabasesPage() {
  const [connections, setConnections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [showQuery, setShowQuery] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [queryResult, setQueryResult] = useState<any>(null);
  const [querying, setQuerying] = useState(false);
  const [queryError, setQueryError] = useState('');
  const [nlQuery, setNlQuery] = useState('');
  const [generating, setGenerating] = useState(false);
  const [form, setForm] = useState({
    name: '', host: '', port: '1433', database: '', username: '', password: '', dbType: 'mssql',
  });
  const [addError, setAddError] = useState('');

  useEffect(() => {
    api.getConnections().then((data: any) => { setConnections(data); setLoading(false); });
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    setAddError('');
    try {
      const conn: any = await api.addConnection({ ...form, port: Number(form.port) });
      setConnections((prev) => [...prev, conn]);
      setShowAdd(false);
      setForm({ name: '', host: '', port: '1433', database: '', username: '', password: '', dbType: 'mssql' });
    } catch (err: any) {
      setAddError(err.message || 'Failed to connect');
    } finally {
      setAdding(false);
    }
  };

  const runQuery = async (connId: string) => {
    if (!query.trim()) return;
    setQuerying(true);
    setQueryError('');
    setQueryResult(null);
    try {
      const result = await api.executeQuery(connId, query);
      setQueryResult(result);
    } catch (err: any) {
      setQueryError(err.message || 'Query failed');
    } finally {
      setQuerying(false);
    }
  };

  const generateSql = async (connId: string) => {
    if (!nlQuery.trim()) return;
    setGenerating(true);
    try {
      const result: any = await api.generateSql(connId, nlQuery);
      setQuery(result.query);
      setNlQuery('');
    } catch {
      setQueryError('Failed to generate SQL');
    } finally {
      setGenerating(false);
    }
  };

  const deleteConn = async (id: string) => {
    if (!confirm('Delete this database connection?')) return;
    try {
      await fetch(`/api/db-connections/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      setConnections((prev) => prev.filter((c) => c.id !== id));
    } catch {}
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Database Connections</h1>
          <p className="text-sm text-gray-500 mt-0.5">Connect your application databases for AI-powered queries</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Database
        </button>
      </div>

      {loading ? <div className="text-gray-500 text-sm">Loading...</div> : connections.length === 0 ? (
        <div className="card text-center text-gray-500 py-16">
          <Database className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="text-sm">No database connections. Add one to enable AI-powered SQL queries.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {connections.map((c) => (
            <div key={c.id} className="card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Database className="w-5 h-5 text-sky-600" />
                  <div>
                    <div className="font-semibold text-sm">{c.name}</div>
                    <div className="text-xs text-gray-500">{c.host}:{c.port} / {c.database} ({c.dbType})</div>
                  </div>
                  {c.isActive ? (
                    <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle className="w-3.5 h-3.5" /> Connected</span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-red-500"><XCircle className="w-3.5 h-3.5" /> Inactive</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setShowQuery(showQuery === c.id ? null : c.id)} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1">
                    <Play className="w-3.5 h-3.5" /> Query
                  </button>
                  <button onClick={() => deleteConn(c.id)} className="p-2 text-gray-400 hover:text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Query panel */}
              {showQuery === c.id && (
                <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                  {/* Natural language query */}
                  <div className="flex gap-2">
                    <input
                      value={nlQuery}
                      onChange={(e) => setNlQuery(e.target.value)}
                      placeholder="Ask in plain English: e.g. 'Get top 10 customers by revenue'"
                      className="input-field flex-1"
                      onKeyDown={(e) => { if (e.key === 'Enter') generateSql(c.id); }}
                    />
                    <button onClick={() => generateSql(c.id)} disabled={generating || !nlQuery.trim()} className="btn-primary text-xs px-3">
                      {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Generate SQL'}
                    </button>
                  </div>

                  {/* SQL editor */}
                  <div className="flex gap-2">
                    <textarea
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="SELECT * FROM ..."
                      className="input-field flex-1 font-mono text-xs min-h-[60px]"
                    />
                    <button onClick={() => runQuery(c.id)} disabled={querying || !query.trim()} className="btn-primary text-xs px-3 self-end">
                      {querying ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Run'}
                    </button>
                  </div>

                  {queryError && <div className="text-red-600 text-xs bg-red-50 p-2 rounded">{queryError}</div>}

                  {/* Results table */}
                  {queryResult && (
                    <div className="overflow-auto max-h-[300px] border border-gray-200 rounded-lg">
                      <div className="text-xs text-gray-500 p-2 bg-gray-50 border-b">{queryResult.rowCount} rows</div>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50">
                            {queryResult.columns.map((col: string) => (
                              <th key={col} className="px-3 py-2 text-left font-medium text-gray-600 border-b">{col}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {queryResult.rows.map((row: any, i: number) => (
                            <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                              {queryResult.columns.map((col: string) => (
                                <td key={col} className="px-3 py-1.5 text-gray-700">{String(row[col] ?? '')}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleAdd} className="bg-white rounded-xl p-6 w-full max-w-md space-y-3">
            <h2 className="text-lg font-bold text-gray-900">Add Database Connection</h2>
            {addError && <div className="text-red-600 text-xs bg-red-50 p-2 rounded">{addError}</div>}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Connection Name</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input-field" placeholder="e.g. Production DB" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Database Type</label>
              <select value={form.dbType} onChange={(e) => setForm((f) => ({ ...f, dbType: e.target.value }))} className="input-field">
                <option value="mssql">SQL Server (MSSQL)</option>
                <option value="postgresql">PostgreSQL</option>
                <option value="mysql">MySQL</option>
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Host</label>
                <input value={form.host} onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))} className="input-field" placeholder="localhost" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Port</label>
                <input value={form.port} onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))} className="input-field" required />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Database Name</label>
              <input value={form.database} onChange={(e) => setForm((f) => ({ ...f, database: e.target.value }))} className="input-field" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Username</label>
                <input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} className="input-field" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
                <input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} className="input-field" required />
              </div>
            </div>
            <p className="text-xs text-gray-500">Connection will be tested before saving. Only SELECT queries are allowed.</p>
            <div className="flex gap-3 justify-end pt-2">
              <button type="button" onClick={() => setShowAdd(false)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={adding} className="btn-primary">
                {adding ? 'Testing & Saving...' : 'Connect'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
