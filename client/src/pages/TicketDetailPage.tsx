import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { ArrowLeft, Clock, User, CheckCircle, MessageSquare, Zap, BookOpen, ThumbsUp, ThumbsDown, Save, UserPlus } from 'lucide-react';
import { StatusBadge, SkeletonCard, useToast } from '../components/shared';
import { STATUS_COLORS, PRIORITY_COLORS, ISSUE_CATEGORY_COLORS, TICKET_STATUSES, PRIORITIES, formatDate } from '../constants';

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isAdmin } = useAuth();
  const [ticket, setTicket] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [functionalResolution, setFunctionalResolution] = useState<any>(null);
  const [resolving, setResolving] = useState(false);
  const [manualResolution, setManualResolution] = useState('');
  const [savingResolution, setSavingResolution] = useState(false);
  const [projectMembers, setProjectMembers] = useState<any[]>([]);

  useEffect(() => {
    if (id) api.getTicket(id).then((d: any) => {
      setTicket(d);
      setManualResolution(d.resolution || '');
      setLoading(false);
      if (d.projectId) {
        api.getProject(d.projectId).then((p: any) => {
          setProjectMembers(p.members?.map((m: any) => m.user) || []);
        }).catch(() => {});
      }
    });
  }, [id]);

  if (loading) return <div className="animate-page-in space-y-4"><SkeletonCard /><SkeletonCard /></div>;
  if (!ticket) return <div className="text-red-500">Ticket not found</div>;

  const analysis = ticket.analysis as any;

  const updateTicket = async (data: any) => {
    try {
      const updated: any = await api.updateTicket(ticket.id, data);
      setTicket((t: any) => ({ ...t, ...updated }));
      toast('Ticket updated');
    } catch { toast('Failed to update', 'error'); }
  };

  const handleSaveResolution = async () => {
    setSavingResolution(true);
    try {
      await api.updateTicket(ticket.id, { resolution: manualResolution, status: 'RESOLVED' });
      setTicket((t: any) => ({ ...t, resolution: manualResolution, status: 'RESOLVED' }));
      toast('Resolution saved & ticket resolved');
    } catch { toast('Failed to save resolution', 'error'); }
    finally { setSavingResolution(false); }
  };

  const handleAutoFix = () => {
    api.triggerPipeline({ ticketId: ticket.id, errorMessage: ticket.title, description: ticket.description, projectId: ticket.projectId });
    navigate('/pipeline');
  };

  const handleResolveFunctional = async () => {
    setResolving(true);
    try {
      const result: any = await api.resolveFunctional({ ticketId: ticket.id, query: ticket.description, projectId: ticket.projectId });
      setFunctionalResolution(result);
    } catch { toast('Failed to resolve with knowledge base', 'error'); }
    finally { setResolving(false); }
  };

  const handleFeedback = async (feedback: string) => {
    if (!functionalResolution?.id) return;
    try {
      await api.submitResolutionFeedback(functionalResolution.id, feedback);
      setFunctionalResolution((r: any) => ({ ...r, feedback }));
      toast('Feedback submitted');
    } catch { toast('Failed to submit feedback', 'error'); }
  };

  return (
    <div className="animate-page-in">
      <button onClick={() => navigate('/tickets')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Tickets
      </button>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{ticket.title}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={ticket.status} colorMap={STATUS_COLORS} size="sm" />
          <StatusBadge status={ticket.priority} colorMap={PRIORITY_COLORS} size="sm" />
          {ticket.issueCategory && <StatusBadge status={ticket.issueCategory} colorMap={ISSUE_CATEGORY_COLORS} size="sm" />}
          {ticket.confidence && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" /> {Math.round(ticket.confidence * 100)}% confidence
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Main Content ── */}
        <div className="lg:col-span-2 space-y-5">
          {/* Description */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Description</h2>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{ticket.description}</p>
          </div>

          {/* AI Resolution */}
          {ticket.resolution && (
            <div className="bg-green-50 rounded-xl border border-green-200 p-5">
              <h2 className="text-sm font-semibold text-green-800 uppercase tracking-wider mb-3 flex items-center gap-2">
                <CheckCircle className="w-4 h-4" /> Resolution
              </h2>
              <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{ticket.resolution}</div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            {ticket.issueCategory === 'TECHNICAL' && isAdmin && (
              <button onClick={handleAutoFix} className="btn-primary flex items-center gap-2"><Zap className="w-4 h-4" /> Auto-Fix with Technical Agent</button>
            )}
            {ticket.issueCategory === 'FUNCTIONAL' && !functionalResolution && (
              <button onClick={handleResolveFunctional} disabled={resolving} className="btn-primary flex items-center gap-2">
                <BookOpen className="w-4 h-4" /> {resolving ? 'Resolving...' : 'Resolve with Knowledge Base'}
              </button>
            )}
          </div>

          {/* Functional Resolution */}
          {functionalResolution && (
            <div className="bg-teal-50 rounded-xl border border-teal-200 p-5 space-y-3">
              <h2 className="text-sm font-semibold text-teal-800 uppercase tracking-wider flex items-center gap-2"><BookOpen className="w-4 h-4" /> Functional Resolution</h2>
              {functionalResolution.rootCause && <div><span className="text-xs text-teal-600 font-medium">Root Cause</span><p className="text-sm text-gray-700 mt-0.5">{functionalResolution.rootCause}</p></div>}
              {functionalResolution.stepsAnalysis && <div><span className="text-xs text-teal-600 font-medium">Steps Analysis</span><p className="text-sm text-gray-700 mt-0.5 whitespace-pre-wrap">{functionalResolution.stepsAnalysis}</p></div>}
              {functionalResolution.solution && <div><span className="text-xs text-teal-600 font-medium">Solution</span><p className="text-sm text-gray-700 mt-0.5 whitespace-pre-wrap">{functionalResolution.solution}</p></div>}
              {functionalResolution.confidence !== undefined && (
                <div className="flex items-center gap-2"><span className="text-xs text-teal-600 font-medium">Confidence</span><span className="text-sm font-semibold text-teal-700">{Math.round(functionalResolution.confidence * 100)}%</span></div>
              )}
              {!functionalResolution.feedback ? (
                <div className="flex items-center gap-2 pt-2 border-t border-teal-200">
                  <span className="text-xs text-gray-500">Was this helpful?</span>
                  <button onClick={() => handleFeedback('positive')} className="p-1.5 rounded-lg hover:bg-teal-100 text-teal-600"><ThumbsUp className="w-4 h-4" /></button>
                  <button onClick={() => handleFeedback('negative')} className="p-1.5 rounded-lg hover:bg-red-100 text-red-500"><ThumbsDown className="w-4 h-4" /></button>
                </div>
              ) : <div className="text-xs text-teal-600 pt-2 border-t border-teal-200">Feedback: {functionalResolution.feedback === 'positive' ? 'Helpful' : 'Not helpful'}</div>}
            </div>
          )}

          {/* Manual Resolution (write/edit) */}
          {ticket.status !== 'CLOSED' && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Add / Edit Resolution</h2>
              <textarea
                value={manualResolution}
                onChange={(e) => setManualResolution(e.target.value)}
                className="input-field min-h-[120px]"
                placeholder="Write a resolution, attach solution steps, notes..."
              />
              <button onClick={handleSaveResolution} disabled={savingResolution || !manualResolution.trim()} className="btn-primary flex items-center gap-2 mt-3">
                <Save className="w-4 h-4" /> {savingResolution ? 'Saving...' : 'Save Resolution & Resolve'}
              </button>
            </div>
          )}

          {/* Chat History */}
          {ticket.chatSessions?.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Chat History</h2>
              {ticket.chatSessions.map((session: any) => (
                <div key={session.id} className="space-y-3">
                  {session.messages?.map((msg: any) => (
                    <div key={msg.id} className={msg.role === 'user' ? 'chat-message-user' : 'chat-message-assistant'}>{msg.content}</div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-4">
          {/* Status & Priority Controls */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Manage Ticket</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                <select
                  value={ticket.status}
                  onChange={(e) => updateTicket({ status: e.target.value })}
                  className="input-field"
                >
                  {TICKET_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Priority</label>
                <select
                  value={ticket.priority}
                  onChange={(e) => updateTicket({ priority: e.target.value })}
                  className="input-field"
                >
                  {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Assigned To</label>
                <select
                  value={ticket.assigneeId || ''}
                  onChange={(e) => updateTicket({ assigneeId: e.target.value || null })}
                  className="input-field"
                >
                  <option value="">Unassigned</option>
                  {projectMembers.map((m: any) => (
                    <option key={m.id} value={m.id}>{m.name} ({m.email})</option>
                  ))}
                </select>
                {ticket.assignee && (
                  <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                    <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-gray-500">{ticket.assignee.name?.charAt(0)}</span>
                    </div>
                    {ticket.assignee.name}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* AI Analysis */}
          {analysis && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">AI Analysis</h3>
              <div className="space-y-3 text-sm">
                <div><span className="text-xs text-gray-400">Issue Type</span><div className="font-medium text-gray-900 mt-0.5">{analysis.issueType}</div></div>
                <div><span className="text-xs text-gray-400">Summary</span><p className="text-gray-700 mt-0.5">{analysis.summary}</p></div>
                {analysis.entities?.errorMessages?.length > 0 && (
                  <div><span className="text-xs text-gray-400">Errors</span>
                    <ul className="mt-1 space-y-1">{analysis.entities.errorMessages.map((e: string, i: number) => <li key={i} className="text-red-600 text-xs font-mono bg-red-50 px-2.5 py-1.5 rounded-lg">{e}</li>)}</ul>
                  </div>
                )}
                {analysis.entities?.modules?.length > 0 && (
                  <div><span className="text-xs text-gray-400">Modules</span>
                    <div className="flex flex-wrap gap-1 mt-1">{analysis.entities.modules.map((m: string, i: number) => <span key={i} className="bg-sky-50 text-sky-700 px-2 py-0.5 rounded-lg text-xs">{m}</span>)}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Details */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Details</h3>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2"><User className="w-4 h-4 text-gray-400" /><span className="text-gray-500">Created by</span><span className="ml-auto font-medium text-gray-900">{ticket.createdBy?.name}</span></div>
              <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-gray-400" /><span className="text-gray-500">Created</span><span className="ml-auto text-gray-700">{formatDate(ticket.createdAt)}</span></div>
              <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-gray-400" /><span className="text-gray-500">Updated</span><span className="ml-auto text-gray-700">{formatDate(ticket.updatedAt)}</span></div>
              {ticket.project && (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 flex items-center justify-center"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ticket.project.color }} /></div>
                  <span className="text-gray-500">Project</span>
                  <span className="ml-auto text-gray-700">{ticket.project.name}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
