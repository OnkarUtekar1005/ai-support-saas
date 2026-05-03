import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Pagination } from '../components/shared';
import {
  Play, CheckCircle, XCircle, Clock, GitBranch, Server, ChevronDown, ChevronUp,
  RefreshCw, Plus, Trash2, Zap, AlertTriangle, Rocket, Eye, Copy, Check,
} from 'lucide-react';

const STATUS_CONFIG: Record<string, { color: string; icon: any; label: string }> = {
  DETECTED: { color: 'bg-gray-100 text-gray-700', icon: AlertTriangle, label: 'Detected' },
  ANALYZING: { color: 'bg-sky-100 text-sky-700', icon: RefreshCw, label: 'Analyzing' },
  FIX_PROPOSED: { color: 'bg-purple-100 text-purple-700', icon: Eye, label: 'Fix Proposed' },
  AWAITING_APPROVAL: { color: 'bg-amber-100 text-amber-700', icon: Clock, label: 'Awaiting Approval' },
  APPROVED: { color: 'bg-green-100 text-green-700', icon: CheckCircle, label: 'Approved' },
  FIXING: { color: 'bg-sky-100 text-sky-700', icon: Zap, label: 'Fixing...' },
  TESTING: { color: 'bg-sky-100 text-sky-700', icon: Play, label: 'Testing' },
  COMMITTED: { color: 'bg-green-100 text-green-700', icon: CheckCircle, label: 'Fixed' },
  PR_CREATED: { color: 'bg-indigo-100 text-indigo-700', icon: GitBranch, label: 'PR Created' },
  DEPLOYING: { color: 'bg-orange-100 text-orange-700', icon: Rocket, label: 'Deploying' },
  DEPLOYED: { color: 'bg-green-100 text-green-700', icon: CheckCircle, label: 'Deployed' },
  TEST_FAILED: { color: 'bg-red-100 text-red-700', icon: XCircle, label: 'Tests Failed' },
  REGRESSION: { color: 'bg-red-100 text-red-700', icon: AlertTriangle, label: 'Regression' },
  FAILED: { color: 'bg-red-100 text-red-700', icon: XCircle, label: 'Failed' },
  REJECTED: { color: 'bg-red-100 text-red-700', icon: XCircle, label: 'Rejected' },
};

export function PipelinePage() {
  const [tab, setTab] = useState<'pipelines' | 'agents'>('pipelines');
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [copied, setCopied] = useState('');
  const [page, setPage] = useState(1);
  const [agentForm, setAgentForm] = useState({
    name: '', host: '', projectPath: '', gitBranch: 'main',
    buildCommand: 'npm run build', restartCommand: 'pm2 restart all', projectId: '',
  });

  useEffect(() => {
    Promise.all([api.getPipelines(), api.getVpsAgents(), api.getProjects()]).then(([p, a, pr]: any) => {
      setPipelines(p);
      setAgents(a);
      setProjects(pr);
      setLoading(false);
    });
  }, []);

  const refresh = () => {
    api.getPipelines().then((p: any) => setPipelines(p));
    api.getVpsAgents().then((a: any) => setAgents(a));
  };

  const viewDetail = async (id: string) => {
    if (expandedId === id) { setExpandedId(null); setDetail(null); return; }
    const data = await api.getPipeline(id);
    setDetail(data);
    setExpandedId(id);
  };

  const approve = async (id: string) => {
    await api.approvePipeline(id);
    refresh();
  };

  const reject = async (id: string) => {
    const reason = prompt('Reason for rejection:');
    if (reason === null) return;
    await api.rejectPipeline(id, reason);
    refresh();
  };

  const retry = async (id: string) => {
    await api.retryPipeline(id);
    refresh();
  };

  const deletePipeline = async (id: string) => {
    if (!confirm('Delete this pipeline log?')) return;
    await api.deletePipeline(id);
    setExpandedId(null);
    setDetail(null);
    refresh();
  };

  const addAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    const agent: any = await api.createVpsAgent({ ...agentForm, projectId: agentForm.projectId || null });
    setAgents((prev) => [...prev, agent]);
    setShowAddAgent(false);
    setCopied('');
    // Show the agent key
    alert(`Agent created!\n\nAgent Key (save this):\n${agent.agentKey}\n\nSet this as AGENT_KEY environment variable on your VPS.`);
  };

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  };

  const PAGE_SIZE = 10;
  const pagedPipelines = pipelines.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pipelineTotalPages = Math.max(1, Math.ceil(pipelines.length / PAGE_SIZE));

  // Pipeline stage progress bar
  const stages = ['DETECTED', 'ANALYZING', 'FIX_PROPOSED', 'AWAITING_APPROVAL', 'APPROVED', 'FIXING', 'COMMITTED', 'DEPLOYING', 'DEPLOYED'];
  const getProgress = (status: string) => {
    const idx = stages.indexOf(status);
    if (status === 'FAILED' || status === 'REJECTED') return -1;
    return idx >= 0 ? idx : 0;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Auto-Fix Pipeline</h1>
          <p className="text-sm text-gray-500 mt-0.5">Error → Claude Code → Fix → Deploy</p>
        </div>
        <button onClick={refresh} className="btn-secondary flex items-center gap-2 text-sm">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {[
          { key: 'pipelines', label: 'Pipelines', icon: Zap },
          { key: 'agents', label: 'VPS Agents', icon: Server },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key ? 'border-sky-600 text-sky-600' : 'border-transparent text-gray-500'
            }`}
          >
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* ─── Pipelines Tab ─── */}
      {tab === 'pipelines' && (
        loading ? <div className="text-gray-500 text-sm">Loading...</div> : pipelines.length === 0 ? (
          <div className="card-static text-center py-16 text-gray-500">
            <Zap className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="text-sm">No pipelines yet. Trigger one from Error Logs → "Auto-Fix" button.</p>
          </div>
        ) : (
          <>
          <div className="space-y-3">
            {pagedPipelines.map((p) => {
              const cfg = STATUS_CONFIG[p.status] || STATUS_CONFIG.DETECTED;
              const Icon = cfg.icon;
              const progress = getProgress(p.status);

              return (
                <div key={p.id} className="card-static overflow-hidden">
                  <div className="flex items-center gap-3 cursor-pointer" onClick={() => viewDetail(p.id)}>
                    <Icon className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-900 truncate">{p.errorMessage}</div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                        <span>{p.errorSource}</span>
                        {p.project && (
                          <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.project.color }} />
                            {p.project.name}
                          </span>
                        )}
                        <span>{new Date(p.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                    <span className={`badge ${cfg.color} flex-shrink-0`}>{cfg.label}</span>
                    {expandedId === p.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>

                  {/* Progress bar */}
                  {progress >= 0 && (
                    <div className="flex gap-0.5 mt-3">
                      {stages.map((s, i) => (
                        <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= progress ? 'bg-sky-600' : 'bg-gray-200'}`} />
                      ))}
                    </div>
                  )}

                  {/* Expanded detail */}
                  {expandedId === p.id && detail && (
                    <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
                      {/* Error info */}
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <div className="text-xs font-medium text-gray-500 mb-1">Error</div>
                          <div className="text-sm bg-red-50 p-3 rounded-lg text-red-800">{detail.errorMessage}</div>
                          {detail.errorStack && (
                            <pre className="text-xs bg-gray-900 text-green-400 p-3 rounded-lg mt-2 overflow-x-auto max-h-32 whitespace-pre-wrap">{detail.errorStack}</pre>
                          )}
                        </div>
                        <div>
                          {detail.geminiAnalysis && (
                            <div className="mb-3">
                              <div className="text-xs font-medium text-gray-500 mb-1">Gemini Analysis</div>
                              <div className="text-sm bg-sky-50 p-3 rounded-lg text-sky-800">{detail.geminiAnalysis}</div>
                            </div>
                          )}
                          {detail.vpsAgent && (
                            <div className="text-xs text-gray-500">
                              VPS: {detail.vpsAgent.name} ({detail.vpsAgent.host}) — {detail.vpsAgent.isOnline ? '🟢 Online' : '🔴 Offline'}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Claude output */}
                      {detail.claudeOutput && (
                        <div>
                          <div className="text-xs font-medium text-gray-500 mb-1">Claude Code Output</div>
                          <pre className="text-xs bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto max-h-60 whitespace-pre-wrap">{detail.claudeOutput}</pre>
                        </div>
                      )}

                      {detail.claudeFixSummary && !detail.claudeOutput && (
                        <div>
                          <div className="text-xs font-medium text-gray-500 mb-1">Proposed Fix</div>
                          <div className="text-sm bg-green-50 p-3 rounded-lg text-green-800 whitespace-pre-wrap">{detail.claudeFixSummary}</div>
                        </div>
                      )}

                      {/* Files changed */}
                      {detail.filesChanged?.length > 0 && (
                        <div>
                          <div className="text-xs font-medium text-gray-500 mb-1">Files Changed ({detail.filesChanged.length})</div>
                          <div className="flex flex-wrap gap-1">
                            {detail.filesChanged.map((f: string) => (
                              <span key={f} className="badge badge-gray font-mono">{f}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Git info */}
                      {(detail.branchName || detail.commitHash) && (
                        <div className="flex gap-4 text-xs text-gray-600">
                          {detail.branchName && <span className="flex items-center gap-1"><GitBranch className="w-3.5 h-3.5" /> {detail.branchName}</span>}
                          {detail.commitHash && <span>Commit: <code>{detail.commitHash}</code></span>}
                          {detail.prUrl && <a href={detail.prUrl} target="_blank" className="text-sky-600 underline">View PR</a>}
                        </div>
                      )}

                      {/* Deploy log */}
                      {detail.deployLog && (
                        <div>
                          <div className="text-xs font-medium text-gray-500 mb-1">Deploy Log</div>
                          <pre className="text-xs bg-gray-900 text-green-400 p-3 rounded-lg overflow-x-auto max-h-40 whitespace-pre-wrap">{detail.deployLog}</pre>
                        </div>
                      )}

                      {/* Pipeline logs timeline */}
                      {detail.logs?.length > 0 && (
                        <div>
                          <div className="text-xs font-medium text-gray-500 mb-2">Timeline</div>
                          <div className="space-y-1.5">
                            {detail.logs.map((log: any) => {
                              const logCfg = STATUS_CONFIG[log.stage] || { color: 'badge-gray' };
                              return (
                                <div key={log.id} className="flex items-start gap-2 text-xs">
                                  <span className="text-gray-400 w-36 flex-shrink-0">{new Date(log.createdAt).toLocaleString()}</span>
                                  <span className={`badge ${logCfg.color} flex-shrink-0`}>{log.stage}</span>
                                  <span className="text-gray-700">{log.message}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex gap-2 pt-2">
                        {(p.status === 'FIX_PROPOSED' || p.status === 'AWAITING_APPROVAL') && (
                          <>
                            <button onClick={() => approve(p.id)} className="btn-primary flex items-center gap-2">
                              <CheckCircle className="w-4 h-4" /> Approve & Fix
                            </button>
                            <button onClick={() => reject(p.id)} className="btn-danger flex items-center gap-2">
                              <XCircle className="w-4 h-4" /> Reject
                            </button>
                          </>
                        )}
                        {['FAILED', 'REJECTED', 'TEST_FAILED', 'REGRESSION'].includes(p.status) && (
                          <button onClick={() => retry(p.id)} className="btn-primary flex items-center gap-2">
                            <RefreshCw className="w-4 h-4" /> Retry
                          </button>
                        )}
                        <button onClick={() => deletePipeline(p.id)} className="btn-ghost text-red-500 flex items-center gap-2 text-xs">
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <Pagination page={page} totalPages={pipelineTotalPages} total={pipelines.length} onPageChange={setPage} />
          </>
        )
      )}

      {/* ─── Agents Tab ─── */}
      {tab === 'agents' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowAddAgent(true)} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> Register Agent
            </button>
          </div>

          {agents.length === 0 ? (
            <div className="card-static text-center py-12 text-gray-500">
              <Server className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p className="text-sm mb-3">No VPS agents registered.</p>
              <p className="text-xs text-gray-400 max-w-md mx-auto">
                Register an agent for each VPS/server running your application. The agent runs alongside your app and executes Claude Code when triggered.
              </p>
            </div>
          ) : (
            agents.map((a) => (
              <div key={a.id} className="card-static">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Server className="w-5 h-5 text-gray-400" />
                    <div>
                      <div className="font-semibold text-sm flex items-center gap-2">
                        {a.name}
                        {a.isOnline
                          ? <span className="badge badge-green text-[10px]">Online</span>
                          : <span className="badge badge-red text-[10px]">Offline</span>
                        }
                      </div>
                      <div className="text-xs text-gray-500 flex items-center gap-3 mt-0.5">
                        <span>{a.host}</span>
                        <span>{a.projectPath}</span>
                        {a.project && (
                          <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: a.project.color }} />
                            {a.project.name}
                          </span>
                        )}
                        {a.lastHeartbeat && <span>Last seen: {new Date(a.lastHeartbeat).toLocaleString()}</span>}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => { if (confirm('Delete this agent?')) api.deleteVpsAgent(a.id).then(refresh); }} className="p-2 text-gray-400 hover:text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Setup instructions */}
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="text-xs font-medium text-gray-500 mb-2">Run on your VPS:</div>
                  <div className="bg-gray-900 text-green-400 p-3 rounded-lg text-xs font-mono relative">
                    <pre>{`export CRM_URL=${window.location.origin.replace(':5173', ':3001')}
export AGENT_KEY=${a.agentKey}
export PROJECT_PATH=${a.projectPath}
node agent.js`}</pre>
                    <button
                      onClick={() => copyText(`export CRM_URL=${window.location.origin.replace(':5173', ':3001')}\nexport AGENT_KEY=${a.agentKey}\nexport PROJECT_PATH=${a.projectPath}\nnode agent.js`, a.id)}
                      className="absolute top-2 right-2 text-gray-500 hover:text-white"
                    >
                      {copied === a.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}

          {/* Add agent modal */}
          {showAddAgent && (
            <div className="modal-backdrop">
              <form onSubmit={addAgent} className="modal-content max-w-md space-y-3">
                <h2 className="text-lg font-bold">Register VPS Agent</h2>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Agent Name</label>
                  <input value={agentForm.name} onChange={(e) => setAgentForm((f) => ({ ...f, name: e.target.value }))} className="input-field" placeholder="e.g. Production Server" required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Hostname / IP</label>
                  <input value={agentForm.host} onChange={(e) => setAgentForm((f) => ({ ...f, host: e.target.value }))} className="input-field" placeholder="e.g. 203.0.113.10 or server.example.com" required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Project Path (on VPS)</label>
                  <input value={agentForm.projectPath} onChange={(e) => setAgentForm((f) => ({ ...f, projectPath: e.target.value }))} className="input-field" placeholder="/home/deploy/myapp" required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Git Branch</label>
                    <input value={agentForm.gitBranch} onChange={(e) => setAgentForm((f) => ({ ...f, gitBranch: e.target.value }))} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Project</label>
                    <select value={agentForm.projectId} onChange={(e) => setAgentForm((f) => ({ ...f, projectId: e.target.value }))} className="input-field">
                      <option value="">None</option>
                      {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Build Command</label>
                  <input value={agentForm.buildCommand} onChange={(e) => setAgentForm((f) => ({ ...f, buildCommand: e.target.value }))} className="input-field" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Restart Command</label>
                  <input value={agentForm.restartCommand} onChange={(e) => setAgentForm((f) => ({ ...f, restartCommand: e.target.value }))} className="input-field" />
                </div>
                <div className="flex gap-3 justify-end pt-2">
                  <button type="button" onClick={() => setShowAddAgent(false)} className="btn-secondary">Cancel</button>
                  <button type="submit" className="btn-primary">Register Agent</button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
