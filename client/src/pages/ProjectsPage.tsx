import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';
import {
  Plus, FolderOpen, Users, Ticket, Activity, Search, DollarSign,
  UserCircle, Lock, Clock, CheckCircle2, XCircle, Loader2, Send,
} from 'lucide-react';
import { StatusBadge, Modal, EmptyState, PageHeader, SkeletonCard, useToast } from '../components/shared';
import { PROJECT_STATUS_COLORS, PROJECT_COLORS, formatDate } from '../constants';

function deadlineBadge(deadline: string | null) {
  if (!deadline) return null;
  const diff = new Date(deadline).getTime() - Date.now();
  const days = Math.ceil(diff / 86400000);
  const label = days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Due today' : `${days}d left`;
  const cls = days < 0 ? 'bg-red-100 text-red-700' : days <= 7 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700';
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${cls}`}>{label}</span>;
}

function JoinRequestBadge({ status }: { status: string }) {
  if (status === 'PENDING') return (
    <span className="flex items-center gap-1 text-[10px] bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">
      <Clock className="w-3 h-3" /> Pending
    </span>
  );
  if (status === 'REJECTED') return (
    <span className="flex items-center gap-1 text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
      <XCircle className="w-3 h-3" /> Declined
    </span>
  );
  return null;
}

export function ProjectsPage() {
  const { isAdmin, user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', description: '', color: '#3b82f6', totalBudget: '', deadline: '' });

  // Join request modal
  const [requestProject, setRequestProject] = useState<any>(null);
  const [requestMessage, setRequestMessage] = useState('');
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    api.getProjects().then((data: any) => { setProjects(data); setLoading(false); });
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const project: any = await api.createProject({
        name: form.name, description: form.description, color: form.color,
        totalBudget: form.totalBudget || undefined, deadline: form.deadline || undefined,
      });
      setProjects((prev) => [{ ...project, isMember: true, myRole: 'OWNER', myJoinRequest: null }, ...prev]);
      setShowCreate(false);
      setForm({ name: '', description: '', color: '#3b82f6', totalBudget: '', deadline: '' });
      toast.success('Project created');
      navigate(`/projects/${project.id}`);
    } catch (e: any) { toast.error(e.message || 'Failed to create project'); }
  };

  const handleRequestAccess = async () => {
    if (!requestProject) return;
    setRequesting(true);
    try {
      await api.requestProjectAccess(requestProject.id, requestMessage || undefined);
      setProjects((prev) => prev.map((p) =>
        p.id === requestProject.id
          ? { ...p, myJoinRequest: { status: 'PENDING', createdAt: new Date().toISOString() } }
          : p
      ));
      toast.success('Access request sent to admin');
      setRequestProject(null);
      setRequestMessage('');
    } catch (e: any) { toast.error(e.message || 'Failed to send request'); }
    finally { setRequesting(false); }
  };

  const filtered = search
    ? projects.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()) || p.description?.toLowerCase().includes(search.toLowerCase()))
    : projects;

  const myProjects = filtered.filter((p) => p.isMember);
  const otherProjects = filtered.filter((p) => !p.isMember);

  return (
    <div className="animate-page-in">
      <PageHeader
        title="Projects"
        subtitle="Track project budgets, costs, invoices and team"
        action={isAdmin ? { label: 'New Project', icon: Plus, onClick: () => setShowCreate(true) } : undefined}
      />

      {projects.length > 0 && (
        <div className="relative max-w-xs mb-6 mt-4">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search projects..." className="input-field pl-9" />
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={FolderOpen} title="No projects found"
          subtitle={projects.length ? 'Try a different search.' : 'Create your first project.'}
          action={isAdmin && projects.length === 0 ? { label: 'Create Project', onClick: () => setShowCreate(true) } : undefined} />
      ) : (
        <div className="space-y-8">
          {/* My Projects */}
          {myProjects.length > 0 && (
            <div>
              {otherProjects.length > 0 && (
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> My Projects
                </h2>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {myProjects.map((p) => (
                  <div key={p.id} onClick={() => navigate(`/projects/${p.id}`)}
                    className="card cursor-pointer group hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                      <h3 className="font-semibold text-gray-900 group-hover:text-sky-600 transition-colors truncate flex-1">{p.name}</h3>
                      <StatusBadge status={p.status} colorMap={PROJECT_STATUS_COLORS} />
                    </div>
                    {p.description && <p className="text-sm text-gray-500 mb-3 line-clamp-2">{p.description}</p>}
                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                      {p.totalBudget && (
                        <span className="flex items-center gap-1 text-xs text-gray-600 bg-sky-50 px-2 py-0.5 rounded-full">
                          <DollarSign className="w-3 h-3" />{p.currency} {p.totalBudget.toLocaleString()}
                        </span>
                      )}
                      {p.deadline && deadlineBadge(p.deadline)}
                      {p.clientContact && (
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <UserCircle className="w-3 h-3" />{p.clientContact.firstName} {p.clientContact.lastName}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-4 text-xs text-gray-400 pt-3 border-t border-gray-100">
                      <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {p._count?.members || 0}</span>
                      <span className="flex items-center gap-1"><Ticket className="w-3.5 h-3.5" /> {p._count?.tickets || 0}</span>
                      <span className="flex items-center gap-1"><Activity className="w-3.5 h-3.5" /> {p._count?.activities || 0}</span>
                      {p._count?.invoices > 0 && (
                        <span className="flex items-center gap-1 text-sky-400"><DollarSign className="w-3.5 h-3.5" /> {p._count.invoices}</span>
                      )}
                      {p.myRole && (
                        <span className="ml-auto text-[10px] text-sky-600 font-medium uppercase">{p.myRole}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Other Projects (not a member) */}
          {otherProjects.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-2">
                <Lock className="w-3.5 h-3.5" /> Other Projects — Request access to join
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {otherProjects.map((p) => {
                  const req = p.myJoinRequest;
                  const isPending = req?.status === 'PENDING';
                  const isRejected = req?.status === 'REJECTED';

                  return (
                    <div key={p.id} className="card relative opacity-75">
                      {/* Lock overlay */}
                      <div className="absolute top-3 right-3">
                        <Lock className="w-4 h-4 text-gray-400" />
                      </div>

                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                        <h3 className="font-semibold text-gray-700 truncate flex-1 pr-6">{p.name}</h3>
                        <StatusBadge status={p.status} colorMap={PROJECT_STATUS_COLORS} />
                      </div>
                      {p.description && <p className="text-sm text-gray-400 mb-3 line-clamp-2">{p.description}</p>}

                      <div className="flex gap-4 text-xs text-gray-400 pt-3 border-t border-gray-100 mb-3">
                        <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {p._count?.members || 0} members</span>
                        <span className="flex items-center gap-1"><Ticket className="w-3.5 h-3.5" /> {p._count?.tickets || 0} tickets</span>
                      </div>

                      {isPending ? (
                        <div className="flex items-center justify-center gap-1.5 py-1.5 text-xs text-yellow-700 bg-yellow-50 rounded-lg border border-yellow-200">
                          <Clock className="w-3.5 h-3.5" /> Access request pending...
                        </div>
                      ) : (
                        <button
                          onClick={() => { setRequestProject(p); setRequestMessage(''); }}
                          className="w-full py-1.5 text-xs font-medium text-sky-600 bg-sky-50 hover:bg-sky-100 rounded-lg border border-sky-200 transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Send className="w-3.5 h-3.5" />
                          {isRejected ? 'Re-request Access' : 'Request Access'}
                        </button>
                      )}
                      {isRejected && <div className="mt-1.5 text-center"><JoinRequestBadge status="REJECTED" /></div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Request Access Modal */}
      <Modal open={!!requestProject} onClose={() => setRequestProject(null)} title={`Request access: ${requestProject?.name}`} maxWidth="max-w-md">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">Your request will be sent to the admin for approval.</p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Message (optional)</label>
            <textarea
              value={requestMessage}
              onChange={(e) => setRequestMessage(e.target.value)}
              rows={3}
              placeholder="Why do you need access to this project?"
              className="input-field"
            />
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setRequestProject(null)} className="btn-secondary">Cancel</button>
            <button onClick={handleRequestAccess} disabled={requesting} className="btn-primary flex items-center gap-2">
              {requesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send Request
            </button>
          </div>
        </div>
      </Modal>

      {/* Create Project Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Project" maxWidth="max-w-md">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Project Name *</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input-field" required placeholder="e.g. Client Portal v2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="input-field" rows={2} placeholder="What is this project about?" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Budget</label>
              <input type="number" min="0" value={form.totalBudget} onChange={(e) => setForm((f) => ({ ...f, totalBudget: e.target.value }))} className="input-field" placeholder="0.00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Deadline</label>
              <input type="date" value={form.deadline} onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))} className="input-field" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
            <div className="flex gap-2">
              {PROJECT_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setForm((f) => ({ ...f, color: c }))}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${form.color === c ? 'border-gray-900 scale-110' : 'border-transparent hover:scale-105'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Create Project</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
