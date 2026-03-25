import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, RefreshCw, TrendingUp, ChevronDown, ChevronUp, Bot, Zap } from 'lucide-react';

export function ErrorLogsPage() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [trendAnalysis, setTrendAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState({ level: '', analyzed: '', projectId: '', category: '' });
  const [projects, setProjects] = useState<any[]>([]);
  const [analyzingTrend, setAnalyzingTrend] = useState(false);
  const [reanalyzing, setReanalyzing] = useState<string | null>(null);

  useEffect(() => { api.getProjects().then((p: any) => setProjects(p)); }, []);

  const fetchData = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter.level) params.set('level', filter.level);
    if (filter.analyzed) params.set('analyzed', filter.analyzed);
    if (filter.projectId) params.set('projectId', filter.projectId);
    if (filter.category) params.set('category', filter.category);

    const [logsData, statsData] = await Promise.all([
      api.getErrorLogs(params.toString()).catch(() => ({ logs: [] })),
      api.getErrorLogStats().catch(() => null),
    ]);

    setLogs((logsData as any).logs || []);
    setStats(statsData);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [filter.level, filter.analyzed, filter.projectId, filter.category]);

  const runTrendAnalysis = async () => {
    setAnalyzingTrend(true);
    try {
      const result = await api.trendAnalysis(24);
      setTrendAnalysis(result);
    } catch {
      alert('Trend analysis failed');
    } finally {
      setAnalyzingTrend(false);
    }
  };

  const reanalyze = async (id: string) => {
    setReanalyzing(id);
    try {
      const updated: any = await api.reanalyzeError(id);
      setLogs((prev) => prev.map((l) => (l.id === id ? updated : l)));
    } catch {
      alert('Re-analysis failed');
    } finally {
      setReanalyzing(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Error Logs</h1>
        <div className="flex gap-2">
          <button onClick={runTrendAnalysis} disabled={analyzingTrend} className="btn-secondary flex items-center gap-2 text-sm">
            <TrendingUp className="w-4 h-4" />
            {analyzingTrend ? 'Analyzing...' : 'AI Trend Analysis'}
          </button>
          <button onClick={fetchData} className="btn-secondary flex items-center gap-2 text-sm">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="card py-3 text-center">
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
            <div className="text-xs text-gray-500">Total Errors</div>
          </div>
          <div className="card py-3 text-center">
            <div className="text-2xl font-bold text-red-600">{stats.last24h}</div>
            <div className="text-xs text-gray-500">Last 24h</div>
          </div>
          <div className="card py-3 text-center">
            <div className="text-2xl font-bold text-orange-500">{stats.last7d}</div>
            <div className="text-xs text-gray-500">Last 7 Days</div>
          </div>
          <div className="card py-3 text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.unanalyzed}</div>
            <div className="text-xs text-gray-500">Unanalyzed</div>
          </div>
        </div>
      )}

      {/* Trend Analysis Result */}
      {trendAnalysis && (
        <div className="card mb-6 border-blue-200 bg-blue-50/30">
          <div className="flex items-center gap-2 mb-3">
            <Bot className="w-5 h-5 text-blue-600" />
            <h2 className="font-semibold text-blue-900">AI Trend Analysis (Last 24h)</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div>
              <h3 className="font-medium text-gray-700 mb-1">Patterns Detected</h3>
              <ul className="list-disc list-inside space-y-1 text-gray-600">
                {(trendAnalysis.patterns || []).map((p: string, i: number) => <li key={i}>{p}</li>)}
              </ul>
            </div>
            <div>
              <h3 className="font-medium text-gray-700 mb-1">Recommendations</h3>
              <ul className="list-disc list-inside space-y-1 text-gray-600">
                {(trendAnalysis.recommendations || []).map((r: string, i: number) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-gray-500">Risk Level:</span>
            <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
              trendAnalysis.riskLevel === 'critical' ? 'bg-red-100 text-red-700' :
              trendAnalysis.riskLevel === 'high' ? 'bg-orange-100 text-orange-700' :
              trendAnalysis.riskLevel === 'medium' ? 'bg-yellow-100 text-yellow-700' :
              'bg-green-100 text-green-700'
            }`}>{trendAnalysis.riskLevel}</span>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select value={filter.level} onChange={(e) => setFilter((f) => ({ ...f, level: e.target.value }))} className="input-field w-auto">
          <option value="">All Levels</option>
          {['INFO', 'WARN', 'ERROR', 'FATAL'].map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <select value={filter.category} onChange={(e) => setFilter((f) => ({ ...f, category: e.target.value }))} className="input-field w-auto">
          <option value="">All Categories</option>
          {['database', 'api', 'auth', 'cors', 'timeout', 'code', 'network', 'email', 'memory', 'validation', 'frontend', 'disk'].map((c) => (
            <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
          ))}
        </select>
        <select value={filter.projectId} onChange={(e) => setFilter((f) => ({ ...f, projectId: e.target.value }))} className="input-field w-auto">
          <option value="">All Systems</option>
          {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={filter.analyzed} onChange={(e) => setFilter((f) => ({ ...f, analyzed: e.target.value }))} className="input-field w-auto">
          <option value="">All</option>
          <option value="true">Analyzed</option>
          <option value="false">Unanalyzed</option>
        </select>
      </div>

      {/* Error log list */}
      {loading ? (
        <div className="text-gray-500">Loading logs...</div>
      ) : logs.length === 0 ? (
        <div className="card text-center text-gray-500 py-12">No error logs found.</div>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="card p-0 overflow-hidden">
              <button
                onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                className="w-full text-left p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className={`px-2 py-0.5 text-xs rounded font-mono font-bold ${
                    log.level === 'FATAL' ? 'bg-red-600 text-white' :
                    log.level === 'ERROR' ? 'bg-red-100 text-red-700' :
                    log.level === 'WARN' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>{log.level}</span>
                  <span className="text-sm font-medium text-gray-900 truncate">{log.message}</span>
                  <span className="text-xs text-gray-400 flex-shrink-0">{log.source}</span>
                  {log.category && <span className="badge badge-gray text-[10px] flex-shrink-0">{log.category}</span>}
                  {log.project && (
                    <span className="flex items-center gap-1 text-[10px] text-gray-400 flex-shrink-0">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: log.project.color }} />
                      {log.project.name}
                    </span>
                  )}
                  {log.analyzed && <Bot className="w-4 h-4 text-green-500 flex-shrink-0" title="AI Analyzed" />}
                </div>
                <div className="flex items-center gap-2 ml-2">
                  <span className="text-xs text-gray-400">{new Date(log.createdAt).toLocaleString()}</span>
                  {expandedId === log.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>

              {expandedId === log.id && (
                <div className="border-t border-gray-200 p-4 space-y-3 bg-gray-50">
                  {log.stack && (
                    <div>
                      <div className="text-xs font-medium text-gray-500 mb-1">Stack Trace</div>
                      <pre className="text-xs bg-gray-900 text-green-400 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap">{log.stack}</pre>
                    </div>
                  )}
                  {log.endpoint && (
                    <div>
                      <span className="text-xs text-gray-500">Endpoint: </span>
                      <span className="text-xs font-mono">{log.endpoint}</span>
                    </div>
                  )}

                  {log.aiAnalysis ? (
                    <div className="bg-white border border-blue-200 rounded-lg p-4 space-y-2">
                      <div className="flex items-center gap-2 text-blue-700 font-medium text-sm">
                        <Bot className="w-4 h-4" /> AI Analysis
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-500">Root Cause</div>
                        <p className="text-sm text-gray-700">{log.aiAnalysis}</p>
                      </div>
                      <div>
                        <div className="text-xs font-medium text-gray-500">Suggested Fix</div>
                        <p className="text-sm text-gray-700">{log.aiSuggestion}</p>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => reanalyze(log.id)}
                      disabled={reanalyzing === log.id}
                      className="btn-secondary text-sm flex items-center gap-2"
                    >
                      <Bot className="w-4 h-4" />
                      {reanalyzing === log.id ? 'Analyzing...' : 'Analyze with AI'}
                    </button>
                  )}

                  {/* Auto-Fix with Claude Code */}
                  <button
                    onClick={async () => {
                      try {
                        await api.triggerPipeline({ errorLogId: log.id });
                        navigate('/pipeline');
                      } catch { alert('Failed to trigger pipeline'); }
                    }}
                    className="btn-primary text-sm flex items-center gap-2 bg-purple-600 hover:bg-purple-700"
                  >
                    <Zap className="w-4 h-4" /> Auto-Fix with Claude Code
                  </button>

                  {log.emailSent && (
                    <div className="text-xs text-green-600">Email notification sent to admin team</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
