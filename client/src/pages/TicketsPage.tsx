import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Plus, Search, Ticket, FolderOpen, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { StatusBadge, Modal, EmptyState, PageHeader, useToast } from '../components/shared';
import { STATUS_COLORS, PRIORITY_COLORS, PRIORITIES, formatDate } from '../constants';

export function TicketsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [tickets, setTickets] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]); // user's own projects
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', priority: 'MEDIUM', projectId: '' });
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([
      api.getTickets('limit=200'),
      api.getProjects(),
    ]).then(([ticketData, projectData]: any[]) => {
      setTickets(ticketData.tickets || []);
      // Only show projects the user is a member of in the create form
      setProjects((projectData || []).filter((p: any) => p.isMember));
      setLoading(false);
    }).catch(() => { toast.error('Failed to load'); setLoading(false); });
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.projectId) { toast.error('Please select a project'); return; }
    setCreating(true);
    try {
      const result: any = await api.createTicket(form);
      setShowCreate(false);
      setForm({ title: '', description: '', priority: 'MEDIUM', projectId: '' });
      navigate(`/tickets/${result.ticket.id}`);
    } catch (e: any) {
      toast.error(e.message || 'Failed to create ticket');
    } finally { setCreating(false); }
  };

  const toggleCollapse = (projectId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(projectId) ? next.delete(projectId) : next.add(projectId);
      return next;
    });
  };

  // Filter tickets
  const filtered = tickets.filter((t) => {
    if (statusFilter && t.status !== statusFilter) return false;
    if (priorityFilter && t.priority !== priorityFilter) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Group by project
  const grouped = filtered.reduce((acc: Record<string, { project: any; tickets: any[] }>, t) => {
    const pid = t.project?.id || '__none__';
    if (!acc[pid]) acc[pid] = { project: t.project || null, tickets: [] };
    acc[pid].tickets.push(t);
    return acc;
  }, {});

  // Sort groups: named projects first (by ticket count desc), then unassigned
  const groups = Object.values(grouped).sort((a, b) => {
    if (!a.project && b.project) return 1;
    if (a.project && !b.project) return -1;
    return b.tickets.length - a.tickets.length;
  });

  const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING_CLARIFICATION', 'RESOLVED', 'CLOSED'];

  return (
    <div className="animate-page-in">
      <PageHeader
        title="Tickets"
        subtitle="Support tickets organized by project"
        action={{ label: 'New Ticket', icon: Plus, onClick: () => setShowCreate(true) }}
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mt-4 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tickets..." className="input-field pl-9" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input-field w-auto">
          <option value="">All Statuses</option>
          {TICKET_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="input-field w-auto">
          <option value="">All Priorities</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} ticket{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-sky-600" /></div>
      ) : groups.length === 0 ? (
        <EmptyState icon={Ticket} title="No tickets found"
          subtitle={tickets.length > 0 ? 'Try adjusting your filters.' : 'Create your first ticket under a project.'}
          action={{ label: 'New Ticket', onClick: () => setShowCreate(true) }} />
      ) : (
        <div className="space-y-4">
          {groups.map(({ project, tickets: groupTickets }) => {
            const pid = project?.id || '__none__';
            const isCollapsed = collapsed.has(pid);

            return (
              <div key={pid} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Project header */}
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleCollapse(pid)}
                  onKeyDown={(e) => e.key === 'Enter' && toggleCollapse(pid)}
                  className="w-full flex items-center gap-3 px-5 py-3 bg-gray-50 border-b border-gray-100 hover:bg-gray-100 transition-colors cursor-pointer select-none"
                >
                  {project ? (
                    <>
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: project.color }} />
                      <span className="font-semibold text-sm text-gray-900">{project.name}</span>
                    </>
                  ) : (
                    <>
                      <FolderOpen className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                      <span className="font-semibold text-sm text-gray-500">Unassigned</span>
                    </>
                  )}
                  <span className="ml-1 text-xs text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">
                    {groupTickets.length}
                  </span>
                  {project && (
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/projects/${project.id}`); }}
                      className="ml-1 text-[11px] text-sky-500 hover:text-sky-700"
                    >
                      View project →
                    </button>
                  )}
                  <span className="ml-auto text-gray-400">
                    {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                  </span>
                </div>

                {/* Tickets */}
                {!isCollapsed && (
                  <div className="divide-y divide-gray-50">
                    {groupTickets.map((t) => (
                      <div key={t.id} onClick={() => navigate(`/tickets/${t.id}`)}
                        className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-gray-50 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-gray-900 truncate">{t.title}</div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {t.createdBy?.name} &middot; {formatDate(t.createdAt)}
                            {t.assignee && <span> &middot; Assigned to {t.assignee.name}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                          {t.confidence && <span className="text-xs text-gray-400 hidden sm:inline">{Math.round(t.confidence * 100)}%</span>}
                          <StatusBadge status={t.priority} colorMap={PRIORITY_COLORS} />
                          <StatusBadge status={t.status} colorMap={STATUS_COLORS} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Ticket Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Support Ticket">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Project *</label>
            {projects.length === 0 ? (
              <div className="text-sm text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
                You're not a member of any project yet. Request access from the Projects page.
              </div>
            ) : (
              <select
                value={form.projectId}
                onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}
                className="input-field"
                required
              >
                <option value="">Select a project...</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className="input-field" required placeholder="Brief summary of the issue" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="input-field min-h-[120px]" required placeholder="Describe the issue in detail..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
            <select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} className="input-field">
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={creating || projects.length === 0} className="btn-primary">
              {creating ? 'Analyzing...' : 'Create & Analyze'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
