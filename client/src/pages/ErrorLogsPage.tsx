import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, RefreshCw, TrendingUp, ChevronDown, ChevronUp, Bot, Zap } from 'lucide-react';
import { StatusBadge, Modal, EmptyState, PageHeader, SkeletonRow, useToast, ProjectSelector, Pagination } from '../components/shared';
import { LEVEL_COLORS, ERROR_LEVELS, ERROR_CATEGORIES } from '../constants';

export function ErrorLogsPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [logs, setLogs] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [trendAnalysis, setTrendAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState({ level: '', analyzed: '', projectId: '', category: '' });
  const [projects, setProjects] = useState<any[]>([]);
  const [analyzingTrend, setAnalyzingTrend] = useState(false);
  const [reanalyzing, setReanalyzing] = useState<string | null>(null);
  const [showTrend, setShowTrend] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => { api.getProjects().then((p: any) => setProjects(p)); }, []);

  const fetchData = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter.level) params.set('level', filter.level);
    if (filter.analyzed) params.set('analyzed', filter.analyzed);
    if (filter.projectId) params.set('projectId', filter.projectId);
    if (filter.category) params.set('category', filter.category);
    params.set('page', String(page));
    params.set('limit', '10');
    try {
      const [logsData, statsData] = await Promise.all([
        api.getErrorLogs(params.toString()).catch(() => ({ logs: [], total: 0, page: 1, totalPages: 1 })),
        api.getErrorLogStats().catch(() => null),
      ]);
      setLogs((logsData as any).logs || []);
      setTotal((logsData as any).total || 0);
      setTotalPages((logsData as any).totalPages || 1);
      setStats(statsData);
    } catch { toast('Failed to load error logs', 'error'); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [filter.level, filter.analyzed, filter.projectId, filter.category, page]);
  useEffect(() => { setPage(1); }, [filter.level, filter.analyzed, filter.projectId, filter.category]);

  const runTrendAnalysis = async () => {
    setAnalyzingTrend(true);
    try {
      const result = await api.trendAnalysis(24);
      setTrendAnalysis(result);
      setShowTrend(true);
    } catch { toast('Trend analysis failed', 'error'); }
    finally { setAnalyzingTrend(false); }
  };

  const reanalyze = async (id: string) => {
    setReanalyzing(id);
    try {
      const updated: any = await api.reanalyzeError(id);
      setLogs((prev) => prev.map((l) => (l.id === id ? updated : l)));
      toast('AI analysis complete');
    } catch { toast('Re-analysis failed', 'error'); }
    finally { setReanalyzing(null); }
  };

  const triggerAutoFix = async (log: any) => {
    try {
      await api.triggerPipeline({
        errorLogId: log.id || undefined, fingerprint: log.fingerprint || undefined,
        errorMessage: log.message, errorStack: log.stack, errorSource: log.source,
        projectId: log.projectId || log.project?.id, geminiAnalysis: log.aiAnalysis, geminiSuggestion: log.aiSuggestion,
      });
      toast('Auto-fix pipeline triggered');
      navigate('/pipeline');
    } catch { toast('Failed to trigger pipeline', 'error'); }
  };

  const logId = (log: any) => log.id || log.fingerprint;

  return (
    <div className="animate-page-in">
      <PageHeader title="Error Logs" subtitle="Monitor and analyze application errors"
        action={{ label: analyzingTrend ? 'Analyzing...' : 'AI Trend Analysis', icon: TrendingUp, onClick: runTrendAnalysis }} />

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 mb-6 stagger-children">
          {[
            { label: 'Total Errors', value: stats.total, color: 'text-gray-900' },
            { label: 'Last 24h', value: stats.last24h, color: 'text-red-600' },
            { label: 'Last 7 Days', value: stats.last7d, color: 'text-orange-500' },
            { label: 'Unanalyzed', value: stats.unanalyzed, color: 'text-blue-600' },
          ].map((s) => (
            <div key={s.label} className="card-static py-3 text-center animate-stagger-in">
              <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-gray-500">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <select value={filter.level} onChange={(e) => setFilter((f) => ({ ...f, level: e.target.value }))} className="input-field w-auto">
          <option value="">All Levels</option>
          {ERROR_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <select value={filter.category} onChange={(e) => setFilter((f) => ({ ...f, category: e.target.value }))} className="input-field w-auto">
          <option value="">All Categories</option>
          {ERROR_CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
        </select>
        <ProjectSelector projects={projects} value={filter.projectId} onChange={(v: string) => setFilter((f) => ({ ...f, projectId: v }))} allowAll allLabel="All Systems" />
        <select value={filter.analyzed} onChange={(e) => setFilter((f) => ({ ...f, analyzed: e.target.value }))} className="input-field w-auto">
          <option value="">All</option>
          <option value="true">Analyzed</option>
          <option value="false">Unanalyzed</option>
        </select>
        <button onClick={fetchData} className="btn-secondary flex items-center gap-1.5 text-sm"><RefreshCw className="w-3.5 h-3.5" />Refresh</button>
      </div>

      {/* Error list */}
      {loading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <SkeletonRow key={i} />)}</div>
      ) : logs.length === 0 ? (
        <EmptyState icon={AlertTriangle} title="No error logs found" subtitle="Errors will appear here when they occur in your applications." />
      ) : (
        <div className="space-y-2 stagger-children">
          {logs.map((log, index) => (
            <div key={logId(log) || index} className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-stagger-in">
              <button onClick={() => setExpandedId(expandedId === logId(log) ? null : logId(log))}
                className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <StatusBadge status={log.level} colorMap={LEVEL_COLORS} size="sm" />
                  <span className="text-sm font-medium text-gray-900 truncate">{log.message}</span>
                  <span className="text-xs text-gray-400 flex-shrink-0 hidden sm:inline">{log.source}</span>
                  {log.category && <StatusBadge status={log.category.toUpperCase()} colorMap={{ [log.category.toUpperCase()]: 'bg-gray-100 text-gray-600' }} />}
                  {log.project && (
                    <span className="flex items-center gap-1 text-[10px] text-gray-400 flex-shrink-0 hidden md:flex">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: log.project.color }} />{log.project.name}
                    </span>
                  )}
                  {log.analyzed && <Bot className="w-4 h-4 text-green-500 flex-shrink-0" />}
                </div>
                <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                  <span className="text-xs text-gray-400 hidden sm:inline">{new Date(log.createdAt || log.timestamp).toLocaleString()}</span>
                  {expandedId === logId(log) ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>

              {expandedId === logId(log) && (
                <div className="border-t border-gray-200 p-4 space-y-3 bg-gray-50">
                  {log.stack && (
                    <div>
                      <div className="text-xs font-medium text-gray-500 mb-1">Stack Trace</div>
                      <pre className="text-xs bg-gray-900 text-green-400 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap">{log.stack}</pre>
                    </div>
                  )}
                  {log.endpoint && (
                    <div><span className="text-xs text-gray-500">Endpoint: </span><span className="text-xs font-mono">{log.endpoint}</span></div>
                  )}
                  {log.aiAnalysis ? (
                    <div className="bg-white border border-blue-200 rounded-lg p-4 space-y-2">
                      <div className="flex items-center gap-2 text-blue-700 font-medium text-sm"><Bot className="w-4 h-4" />AI Analysis</div>
                      <div><div className="text-xs font-medium text-gray-500">Root Cause</div><p className="text-sm text-gray-700">{log.aiAnalysis}</p></div>
                      <div><div className="text-xs font-medium text-gray-500">Suggested Fix</div><p className="text-sm text-gray-700">{log.aiSuggestion}</p></div>
                    </div>
                  ) : (
                    <button onClick={() => reanalyze(logId(log))} disabled={reanalyzing === logId(log)} className="btn-secondary text-sm flex items-center gap-2">
                      <Bot className="w-4 h-4" />{reanalyzing === logId(log) ? 'Analyzing...' : 'Analyze with AI'}
                    </button>
                  )}
                  <button onClick={() => triggerAutoFix(log)} className="btn-primary text-sm flex items-center gap-2 bg-purple-600 hover:bg-purple-700">
                    <Zap className="w-4 h-4" />Auto-Fix with Claude Code
                  </button>
                  {log.emailSent && <div className="text-xs text-green-600">Email notification sent to admin team</div>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />

      {/* Trend Analysis Modal */}
      <Modal open={showTrend && !!trendAnalysis} onClose={() => setShowTrend(false)} title="AI Trend Analysis (Last 24h)" maxWidth="max-w-2xl">
        {trendAnalysis && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-gray-500">Risk Level:</span>
              <StatusBadge status={trendAnalysis.riskLevel?.toUpperCase() || 'LOW'}
                colorMap={{ CRITICAL: 'bg-red-100 text-red-700', HIGH: 'bg-orange-100 text-orange-700', MEDIUM: 'bg-yellow-100 text-yellow-700', LOW: 'bg-green-100 text-green-700' }} size="sm" />
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
          </div>
        )}
      </Modal>
    </div>
  );
}
