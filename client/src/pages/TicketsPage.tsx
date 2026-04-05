import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Plus, Search, Ticket } from 'lucide-react';
import { StatusBadge, Modal, EmptyState, PageHeader, SkeletonRow, useToast, Pagination } from '../components/shared';
import { STATUS_COLORS, PRIORITY_COLORS, ISSUE_CATEGORY_COLORS, TICKET_STATUSES, PRIORITIES, ISSUE_CATEGORIES, formatStatus, formatDate } from '../constants';

export function TicketsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', priority: 'MEDIUM' });
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState({ status: '', priority: '', search: '', issueCategory: '' });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchTickets = () => {
    const params = new URLSearchParams();
    if (filter.status) params.set('status', filter.status);
    if (filter.priority) params.set('priority', filter.priority);
    if (filter.issueCategory) params.set('issueCategory', filter.issueCategory);
    params.set('page', String(page));
    params.set('limit', '10');
    api.getTickets(params.toString()).then((data: any) => { setTickets(data.tickets); setTotal(data.total); setTotalPages(data.totalPages); setLoading(false); });
  };

  useEffect(() => { fetchTickets(); }, [filter.status, filter.priority, filter.issueCategory, page]);
  useEffect(() => { setPage(1); }, [filter.status, filter.priority, filter.issueCategory]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const result: any = await api.createTicket(form);
      setShowCreate(false);
      setForm({ title: '', description: '', priority: 'MEDIUM' });
      navigate(`/tickets/${result.ticket.id}`);
    } catch {
      toast.error('Failed to create ticket');
    } finally { setCreating(false); }
  };

  const filtered = filter.search
    ? tickets.filter(t => t.title.toLowerCase().includes(filter.search.toLowerCase()))
    : tickets;

  return (
    <div className="animate-page-in">
      <PageHeader title="Tickets" subtitle="Track and resolve support issues" action={{ label: 'New Ticket', icon: Plus, onClick: () => setShowCreate(true) }} />

      <div className="flex flex-wrap items-center gap-3 mt-4 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input value={filter.search} onChange={(e) => setFilter(f => ({ ...f, search: e.target.value }))} placeholder="Search tickets..." className="input-field pl-9" />
        </div>
        <select value={filter.status} onChange={(e) => setFilter(f => ({ ...f, status: e.target.value }))} className="input-field w-auto">
          <option value="">All Statuses</option>
          {TICKET_STATUSES.map(s => <option key={s} value={s}>{formatStatus(s)}</option>)}
        </select>
        <select value={filter.priority} onChange={(e) => setFilter(f => ({ ...f, priority: e.target.value }))} className="input-field w-auto">
          <option value="">All Priorities</option>
          {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={filter.issueCategory} onChange={(e) => setFilter(f => ({ ...f, issueCategory: e.target.value }))} className="input-field w-auto">
          <option value="">All Categories</option>
          {ISSUE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <SkeletonRow key={i} />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Ticket} title="No tickets found" subtitle={tickets.length > 0 ? 'Try adjusting your filters.' : 'Create your first support ticket.'} action={tickets.length === 0 ? { label: 'Create Ticket', onClick: () => setShowCreate(true) } : undefined} />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden stagger-children">
          {filtered.map((t) => (
            <div key={t.id} onClick={() => navigate(`/tickets/${t.id}`)} className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50 transition-colors animate-stagger-in">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-gray-900 truncate">{t.title}</div>
                <div className="text-xs text-gray-500 mt-1 line-clamp-1">{t.description}</div>
                <div className="text-xs text-gray-400 mt-1.5">{t.createdBy?.name} &middot; {formatDate(t.createdAt)}</div>
              </div>
              <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                {t.confidence && <span className="text-xs text-gray-400">{Math.round(t.confidence * 100)}%</span>}
                <StatusBadge status={t.priority} colorMap={PRIORITY_COLORS} />
                <StatusBadge status={t.status} colorMap={STATUS_COLORS} />
                {t.issueCategory && <StatusBadge status={t.issueCategory} colorMap={ISSUE_CATEGORY_COLORS} />}
              </div>
            </div>
          ))}
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} total={total} onPageChange={setPage} />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Support Ticket">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} className="input-field" required placeholder="Brief summary of the issue" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} className="input-field min-h-[120px]" required placeholder="Describe the issue in detail..." />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
            <select value={form.priority} onChange={(e) => setForm(f => ({ ...f, priority: e.target.value }))} className="input-field">
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
            <button type="submit" disabled={creating} className="btn-primary">{creating ? 'Analyzing...' : 'Create & Analyze'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
