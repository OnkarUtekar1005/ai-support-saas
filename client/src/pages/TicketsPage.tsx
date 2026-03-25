import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Plus, Search } from 'lucide-react';

export function TicketsPage() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', priority: 'MEDIUM' });
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState({ status: '', priority: '' });

  const fetchTickets = () => {
    const params = new URLSearchParams();
    if (filter.status) params.set('status', filter.status);
    if (filter.priority) params.set('priority', filter.priority);
    api.getTickets(params.toString()).then((data: any) => {
      setTickets(data.tickets);
      setLoading(false);
    });
  };

  useEffect(() => { fetchTickets(); }, [filter.status, filter.priority]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const result: any = await api.createTicket(form);
      setShowCreate(false);
      setForm({ title: '', description: '', priority: 'MEDIUM' });
      navigate(`/tickets/${result.ticket.id}`);
    } catch {
      alert('Failed to create ticket');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Tickets</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Ticket
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <select
          value={filter.status}
          onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))}
          className="input-field w-auto"
        >
          <option value="">All Statuses</option>
          {['OPEN', 'IN_PROGRESS', 'WAITING_CLARIFICATION', 'RESOLVED', 'CLOSED'].map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <select
          value={filter.priority}
          onChange={(e) => setFilter((f) => ({ ...f, priority: e.target.value }))}
          className="input-field w-auto"
        >
          <option value="">All Priorities</option>
          {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      {/* Ticket list */}
      {loading ? (
        <div className="text-gray-500">Loading tickets...</div>
      ) : tickets.length === 0 ? (
        <div className="card text-center text-gray-500 py-12">No tickets found. Create your first ticket!</div>
      ) : (
        <div className="space-y-2">
          {tickets.map((t) => (
            <div
              key={t.id}
              onClick={() => navigate(`/tickets/${t.id}`)}
              className="card cursor-pointer hover:shadow-md transition-shadow flex items-center justify-between"
            >
              <div className="flex-1">
                <div className="font-medium text-gray-900">{t.title}</div>
                <div className="text-sm text-gray-500 mt-1 line-clamp-1">{t.description}</div>
                <div className="text-xs text-gray-400 mt-1">
                  {t.createdBy?.name} - {new Date(t.createdAt).toLocaleDateString()}
                </div>
              </div>
              <div className="flex items-center gap-2 ml-4">
                {t.confidence && (
                  <span className="text-xs text-gray-500">{Math.round(t.confidence * 100)}%</span>
                )}
                <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                  t.priority === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                  t.priority === 'HIGH' ? 'bg-orange-100 text-orange-700' :
                  t.priority === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-gray-100 text-gray-700'
                }`}>{t.priority}</span>
                <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                  t.status === 'RESOLVED' ? 'bg-green-100 text-green-700' :
                  t.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                  t.status === 'WAITING_CLARIFICATION' ? 'bg-amber-100 text-amber-700' :
                  'bg-gray-100 text-gray-700'
                }`}>{t.status.replace(/_/g, ' ')}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleCreate} className="bg-white rounded-xl p-6 w-full max-w-lg space-y-4">
            <h2 className="text-lg font-bold">New Support Ticket</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="input-field min-h-[120px]"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                className="input-field"
              >
                {['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={creating} className="btn-primary">
                {creating ? 'Analyzing...' : 'Create & Analyze'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
