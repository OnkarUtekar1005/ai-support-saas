import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { Plus, CheckCircle, Circle, Clock, Phone, Mail, Calendar, FileText, ArrowRight, StickyNote, Activity } from 'lucide-react';
import { StatusBadge, Modal, EmptyState, PageHeader, SkeletonRow, useToast, ProjectSelector, Pagination } from '../components/shared';
import { ACTIVITY_TYPES, ACTIVITY_STATUSES, ACTIVITY_STATUS_COLORS, formatDate } from '../constants';

const TYPE_ICONS: Record<string, any> = {
  CALL: Phone, EMAIL: Mail, MEETING: Calendar, TASK: FileText, NOTE: StickyNote, FOLLOW_UP: ArrowRight,
};

export function ActivitiesPage() {
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [activities, setActivities] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterProject, setFilterProject] = useState(searchParams.get('projectId') || '');
  const [filterStatus, setFilterStatus] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ type: 'TASK', subject: '', description: '', dueDate: '', contactId: '', dealId: '', projectId: '' });
  const [page, setPage] = useState(1);

  const fetchActivities = () => {
    const params = new URLSearchParams();
    if (filterProject) params.set('projectId', filterProject);
    if (filterStatus) params.set('status', filterStatus);
    api.getActivities(params.toString())
      .then((data: any) => { setActivities(data); setLoading(false); })
      .catch(() => { toast('Failed to load activities', 'error'); setLoading(false); });
  };

  useEffect(() => { fetchActivities(); }, [filterProject, filterStatus]);
  useEffect(() => { setPage(1); }, [filterProject, filterStatus]);
  useEffect(() => {
    api.getProjects().then((p: any) => setProjects(p));
    api.getContacts().then((c: any) => setContacts(c.contacts || c));
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createActivity({ ...form, contactId: form.contactId || null, dealId: form.dealId || null, projectId: form.projectId || null, dueDate: form.dueDate || null });
      setShowCreate(false);
      setForm({ type: 'TASK', subject: '', description: '', dueDate: '', contactId: '', dealId: '', projectId: '' });
      toast('Activity created');
      fetchActivities();
    } catch { toast('Failed to create activity', 'error'); }
  };

  const toggleDone = async (id: string, currentStatus: string) => {
    try {
      await api.updateActivity(id, { status: currentStatus === 'DONE' ? 'TODO' : 'DONE' });
      fetchActivities();
    } catch { toast('Failed to update activity', 'error'); }
  };

  const isOverdue = (dueDate: string | null) => dueDate ? new Date(dueDate) < new Date() && new Date(dueDate).toDateString() !== new Date().toDateString() : false;
  const PAGE_SIZE = 10;
  const paged = activities.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(activities.length / PAGE_SIZE));
  const activeItems = paged.filter(a => a.status === 'TODO' || a.status === 'IN_PROGRESS');
  const doneItems = paged.filter(a => a.status === 'DONE' || a.status === 'CANCELLED');

  const renderRow = (a: any, done: boolean) => {
    const Icon = TYPE_ICONS[a.type] || FileText;
    const overdue = !done && isOverdue(a.dueDate);
    return (
      <div key={a.id} className={`flex items-center gap-4 px-5 py-3.5 ${overdue ? 'bg-red-50/40' : 'hover:bg-gray-50'} transition-colors ${done ? 'opacity-60' : ''} animate-stagger-in`}>
        <button onClick={() => toggleDone(a.id, a.status)} className="flex-shrink-0">
          {done ? <CheckCircle className="w-5 h-5 text-green-500" /> : <Circle className="w-5 h-5 text-gray-300 hover:text-green-400 transition-colors" />}
        </button>
        <Icon className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className={`font-medium text-sm truncate ${done ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{a.subject}</div>
          {!done && (
            <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
              {a.contact && <span>{a.contact.firstName} {a.contact.lastName}</span>}
              {a.deal && <span>Deal: {a.deal.title}</span>}
              {a.project && (
                <span className="inline-flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: a.project.color }} />{a.project.name}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {a.dueDate && (
            <span className={`flex items-center gap-1 text-xs ${overdue ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
              <Clock className="w-3.5 h-3.5" />{formatDate(a.dueDate)}
            </span>
          )}
          <StatusBadge status={a.type} colorMap={{ TASK: 'bg-gray-100 text-gray-600', CALL: 'bg-blue-100 text-blue-700', EMAIL: 'bg-purple-100 text-purple-700', MEETING: 'bg-teal-100 text-teal-700', NOTE: 'bg-yellow-100 text-yellow-700', FOLLOW_UP: 'bg-orange-100 text-orange-700' }} />
        </div>
      </div>
    );
  };

  return (
    <div className="animate-page-in">
      <PageHeader title="Activities" subtitle="Tasks, calls, meetings, and follow-ups" action={{ label: 'New Activity', icon: Plus, onClick: () => setShowCreate(true) }} />

      <div className="flex flex-wrap items-center gap-3 mt-4 mb-5">
        <ProjectSelector projects={projects} value={filterProject} onChange={setFilterProject} allowAll />
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input-field w-auto">
          <option value="">All Statuses</option>
          {ACTIVITY_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        {activities.length > 0 && <span className="text-xs text-gray-400 ml-1">{activities.length} activit{activities.length !== 1 ? 'ies' : 'y'}</span>}
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <SkeletonRow key={i} />)}</div>
      ) : activities.length === 0 ? (
        <EmptyState icon={Activity} title="No activities found" subtitle="Create your first activity to track tasks and follow-ups." action={{ label: 'Create Activity', onClick: () => setShowCreate(true) }} />
      ) : (
        <div className="space-y-6 stagger-children">
          {activeItems.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500" />Active ({activeItems.length})
              </h2>
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
                {activeItems.map((a) => renderRow(a, false))}
              </div>
            </div>
          )}
          {doneItems.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500" />Completed ({doneItems.length})
              </h2>
              <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
                {doneItems.map((a) => renderRow(a, true))}
              </div>
            </div>
          )}
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} total={activities.length} onPageChange={setPage} />

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Activity" maxWidth="max-w-md">
        <form onSubmit={handleCreate} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Subject</label>
            <input value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} className="input-field" required placeholder="What needs to be done?" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
              <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} className="input-field">
                {ACTIVITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
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
      </Modal>
    </div>
  );
}
