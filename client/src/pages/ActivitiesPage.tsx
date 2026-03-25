import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { Plus, CheckCircle, Circle, Clock, Phone, Mail, Calendar, FileText, ArrowRight, StickyNote } from 'lucide-react';

const TYPE_ICONS: Record<string, any> = {
  CALL: Phone, EMAIL: Mail, MEETING: Calendar, TASK: FileText, NOTE: StickyNote, FOLLOW_UP: ArrowRight,
};

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  TODO: { bg: 'bg-gray-100', text: 'text-gray-700' },
  IN_PROGRESS: { bg: 'bg-blue-100', text: 'text-blue-700' },
  DONE: { bg: 'bg-green-100', text: 'text-green-700' },
  CANCELLED: { bg: 'bg-red-100', text: 'text-red-700' },
};

export function ActivitiesPage() {
  const [searchParams] = useSearchParams();
  const [activities, setActivities] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterProject, setFilterProject] = useState(searchParams.get('projectId') || '');
  const [filterStatus, setFilterStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    type: 'TASK', subject: '', description: '', dueDate: '', contactId: '', dealId: '', projectId: '',
  });

  const fetchActivities = () => {
    const params = new URLSearchParams();
    if (filterProject) params.set('projectId', filterProject);
    if (filterStatus) params.set('status', filterStatus);
    api.getActivities(params.toString()).then((data: any) => { setActivities(data); setLoading(false); });
  };

  useEffect(() => { fetchActivities(); }, [filterProject, filterStatus]);
  useEffect(() => {
    api.getProjects().then((p: any) => setProjects(p));
    api.getContacts().then((c: any) => setContacts(c.contacts || c));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.createActivity({
      ...form,
      contactId: form.contactId || null,
      dealId: form.dealId || null,
      projectId: form.projectId || null,
      dueDate: form.dueDate || null,
    });
    setShowCreate(false);
    setForm({ type: 'TASK', subject: '', description: '', dueDate: '', contactId: '', dealId: '', projectId: '' });
    fetchActivities();
  };

  const toggleDone = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'DONE' ? 'TODO' : 'DONE';
    await api.updateActivity(id, { status: newStatus });
    fetchActivities();
  };

  const overdue = (dueDate: string | null) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date() && new Date(dueDate).toDateString() !== new Date().toDateString();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Activities</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Activity
        </button>
      </div>

      <div className="flex gap-3 mb-4">
        <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} className="input-field w-auto">
          <option value="">All Projects</option>
          {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input-field w-auto">
          <option value="">All Statuses</option>
          {['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
      </div>

      {loading ? <div className="text-gray-500">Loading...</div> : activities.length === 0 ? (
        <div className="card text-center text-gray-500 py-12">No activities found.</div>
      ) : (
        <div className="space-y-2">
          {activities.map((a) => {
            const Icon = TYPE_ICONS[a.type] || FileText;
            const style = STATUS_STYLES[a.status] || STATUS_STYLES.TODO;
            const isOverdue = a.status !== 'DONE' && a.status !== 'CANCELLED' && overdue(a.dueDate);

            return (
              <div key={a.id} className={`card flex items-center gap-4 ${isOverdue ? 'border-red-300 bg-red-50/30' : ''}`}>
                {/* Toggle complete */}
                <button onClick={() => toggleDone(a.id, a.status)} className="flex-shrink-0">
                  {a.status === 'DONE' ? (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  ) : (
                    <Circle className="w-5 h-5 text-gray-300 hover:text-green-400 transition-colors" />
                  )}
                </button>

                {/* Type icon */}
                <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className={`font-medium text-sm ${a.status === 'DONE' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                    {a.subject}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                    {a.contact && <span>{a.contact.firstName} {a.contact.lastName}</span>}
                    {a.deal && <span>Deal: {a.deal.title}</span>}
                    {a.assignee && <span>Assigned: {a.assignee.name}</span>}
                    {a.project && (
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: a.project.color }} />
                        {a.project.name}
                      </span>
                    )}
                  </div>
                </div>

                {/* Meta */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {a.dueDate && (
                    <span className={`flex items-center gap-1 text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(a.dueDate).toLocaleDateString()}
                    </span>
                  )}
                  <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${style.bg} ${style.text}`}>
                    {a.type}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleCreate} className="bg-white rounded-xl p-6 w-full max-w-md space-y-3">
            <h2 className="text-lg font-bold">New Activity</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Subject</label>
                <input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} className="input-field" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="input-field">
                  {['TASK', 'CALL', 'EMAIL', 'MEETING', 'NOTE', 'FOLLOW_UP'].map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Due Date</label>
                <input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Contact</label>
                <select value={form.contactId} onChange={(e) => setForm((f) => ({ ...f, contactId: e.target.value }))} className="input-field">
                  <option value="">None</option>
                  {contacts.map((c: any) => <option key={c.id} value={c.id}>{c.firstName} {c.lastName}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Project</label>
                <select value={form.projectId} onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))} className="input-field">
                  <option value="">None</option>
                  {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="input-field" rows={2} />
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
              <button type="submit" className="btn-primary">Create</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
