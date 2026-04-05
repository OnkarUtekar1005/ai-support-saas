import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import {
  ArrowLeft, Users, DollarSign, Building2, UserCircle, Activity,
  Ticket, Settings, LayoutDashboard, Clock, CheckCircle, Save, Zap,
  AlertTriangle, ChevronDown, ChevronRight,
} from 'lucide-react';
import { StatusBadge, Modal, EmptyState, SkeletonTable, ConfirmDialog, useToast } from '../components/shared';
import {
  PRIORITY_COLORS, STATUS_COLORS, LEVEL_COLORS, PROJECT_STATUS_COLORS,
  PROJECT_COLORS, ACTIVITY_STATUS_COLORS, formatDate, formatStatus,
} from '../constants';

type Tab = 'overview' | 'tickets' | 'contacts' | 'deals' | 'activities' | 'errors' | 'settings';

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'tickets', label: 'Tickets', icon: Ticket },
  { key: 'contacts', label: 'Contacts', icon: UserCircle },
  { key: 'deals', label: 'Deals', icon: DollarSign },
  { key: 'activities', label: 'Activities', icon: Activity },
  { key: 'errors', label: 'Errors', icon: AlertTriangle },
  { key: 'settings', label: 'Settings', icon: Settings },
];

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isSuperAdmin } = useAuth();
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [tickets, setTickets] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [deals, setDeals] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [errorLogs, setErrorLogs] = useState<any[]>([]);
  const [expandedError, setExpandedError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', description: '', color: '#3b82f6', status: 'ACTIVE' });
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.getProject(id).then((data: any) => {
      setProject(data);
      setEditForm({ name: data.name, description: data.description || '', color: data.color || '#3b82f6', status: data.status });
      setLoading(false);
    });
  }, [id]);

  useEffect(() => {
    if (!id || activeTab === 'overview') return;
    if (activeTab === 'settings') { setShowSettings(true); return; }
    setTabLoading(true);
    const loaders: Record<string, () => Promise<void>> = {
      tickets: () => api.getTickets(`projectId=${id}`).then((d: any) => setTickets(d.tickets || [])).catch(() => setTickets([])),
      contacts: () => api.getContacts(`projectId=${id}`).then((d: any) => setContacts(d.contacts || [])).catch(() => setContacts([])),
      deals: () => api.getDealPipeline(id).then((d: any) => setDeals((d || []).flatMap((s: any) => s.deals || []))).catch(() => setDeals([])),
      activities: () => api.getActivities(`projectId=${id}`).then((d: any) => setActivities(d || [])).catch(() => setActivities([])),
      errors: () => api.getErrorLogs(`projectId=${id}`).then((d: any) => setErrorLogs(d.logs || d || [])).catch(() => setErrorLogs([])),
    };
    loaders[activeTab]?.().finally(() => setTabLoading(false));
  }, [id, activeTab]);

  const handleSaveSettings = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const updated: any = await api.updateProject(id, editForm);
      setProject((p: any) => ({ ...p, ...updated }));
      toast('Project settings saved');
      setShowSettings(false);
    } catch { toast('Failed to save settings', 'error'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /></div>;
  if (!project) return <EmptyState icon={AlertTriangle} title="Project not found" subtitle="This project may have been deleted." />;

  const counts = project._count || {};

  const renderOverview = () => (
    <div className="space-y-6 stagger-children">
      {project.description && <p className="text-gray-600 text-sm leading-relaxed">{project.description}</p>}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { icon: Ticket, label: 'Tickets', value: counts.tickets || 0, tab: 'tickets' as Tab },
          { icon: UserCircle, label: 'Contacts', value: counts.contacts || 0, tab: 'contacts' as Tab },
          { icon: Building2, label: 'Companies', value: counts.companies || 0 },
          { icon: DollarSign, label: 'Deals', value: counts.deals || 0, tab: 'deals' as Tab },
          { icon: Users, label: 'Members', value: counts.members || project.members?.length || 0 },
        ].map((s) => (
          <button key={s.label} onClick={() => s.tab && setActiveTab(s.tab)}
            className={`bg-white rounded-xl border border-gray-200 p-4 text-center transition-all ${s.tab ? 'cursor-pointer hover:shadow-md' : ''}`}>
            <s.icon className="w-5 h-5 mx-auto text-gray-400 mb-1.5" />
            <div className="text-2xl font-bold text-gray-900">{s.value}</div>
            <div className="text-xs text-gray-500">{s.label}</div>
          </button>
        ))}
      </div>
      {project.dealsByStage?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Deal Pipeline</h2>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {project.dealsByStage.map((s: any) => (
              <div key={s.stage} className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-lg font-bold text-gray-900">{s._count}</div>
                <div className="text-[10px] text-gray-500 uppercase tracking-wide">{formatStatus(s.stage)}</div>
                <div className="text-xs text-green-600 font-semibold mt-0.5">${(s._sum?.value || 0).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {project.members?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-3">Team Members</h2>
          <div className="stagger-children">
            {project.members.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between py-2.5 px-3 -mx-3 rounded-lg hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-900 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">{m.user?.name?.charAt(0).toUpperCase()}</span>
                  </div>
                  <div><span className="font-medium text-sm text-gray-900">{m.user?.name}</span><span className="text-xs text-gray-400 ml-2">{m.user?.email}</span></div>
                </div>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{m.role}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderTickets = () => {
    if (tabLoading) return <SkeletonTable rows={5} />;
    if (!tickets.length) return <EmptyState icon={Ticket} title="No tickets" subtitle="This project has no tickets yet." />;
    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-100 bg-gray-50/50">
            <th className="text-left px-4 py-3 font-medium text-gray-500">Title</th>
            <th className="text-left px-4 py-3 font-medium text-gray-500 hidden md:table-cell">Priority</th>
            <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
            <th className="text-left px-4 py-3 font-medium text-gray-500 hidden lg:table-cell">Assignee</th>
            <th className="text-left px-4 py-3 font-medium text-gray-500 hidden sm:table-cell">Date</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-100 stagger-children">
            {tickets.map((t) => (
              <tr key={t.id} onClick={() => navigate(`/tickets/${t.id}`)} className="hover:bg-gray-50 cursor-pointer transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900 max-w-xs truncate">{t.title}</td>
                <td className="px-4 py-3 hidden md:table-cell"><StatusBadge status={t.priority} colorMap={PRIORITY_COLORS} /></td>
                <td className="px-4 py-3"><StatusBadge status={t.status} colorMap={STATUS_COLORS} /></td>
                <td className="px-4 py-3 text-gray-500 hidden lg:table-cell">{t.assignee?.name || '--'}</td>
                <td className="px-4 py-3 text-gray-400 hidden sm:table-cell">{formatDate(t.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderContacts = () => {
    if (tabLoading) return <SkeletonTable rows={5} />;
    if (!contacts.length) return <EmptyState icon={UserCircle} title="No contacts" subtitle="This project has no contacts yet." />;
    return (
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-100 bg-gray-50/50">
            <th className="text-left px-4 py-3 font-medium text-gray-500">Name</th>
            <th className="text-left px-4 py-3 font-medium text-gray-500 hidden sm:table-cell">Email</th>
            <th className="text-left px-4 py-3 font-medium text-gray-500 hidden md:table-cell">Company</th>
            <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-100 stagger-children">
            {contacts.map((c) => (
              <tr key={c.id} onClick={() => navigate(`/contacts?search=${c.email || ''}`)} className="hover:bg-gray-50 cursor-pointer transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900">{c.firstName} {c.lastName}</td>
                <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{c.email || '--'}</td>
                <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{c.company?.name || '--'}</td>
                <td className="px-4 py-3"><StatusBadge status={c.status || 'ACTIVE'} colorMap={STATUS_COLORS} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderDeals = () => {
    if (tabLoading) return <SkeletonTable rows={5} />;
    if (!deals.length) return <EmptyState icon={DollarSign} title="No deals" subtitle="This project has no deals yet." />;
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 stagger-children">
        {deals.map((d) => (
          <div key={d.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
            <div className="font-medium text-gray-900 truncate mb-2">{d.title}</div>
            <div className="text-xl font-bold text-green-600 mb-2">${(d.value || 0).toLocaleString()}</div>
            <div className="flex items-center justify-between text-xs">
              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{formatStatus(d.stage || '')}</span>
              {d.contact && <span className="text-gray-400">{d.contact.firstName} {d.contact.lastName}</span>}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderActivities = () => {
    if (tabLoading) return <SkeletonTable rows={5} />;
    if (!activities.length) return <EmptyState icon={Activity} title="No activities" subtitle="This project has no activities yet." />;
    const active = activities.filter((a) => a.status !== 'DONE' && a.status !== 'CANCELLED');
    const done = activities.filter((a) => a.status === 'DONE' || a.status === 'CANCELLED');
    const renderGroup = (label: string, items: any[]) => items.length > 0 && (
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{label} ({items.length})</h3>
        <div className="space-y-2 stagger-children">
          {items.map((a) => (
            <div key={a.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
              {a.status === 'DONE' ? <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" /> : <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-gray-900 truncate">{a.subject}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">{a.type}</span>
                  <StatusBadge status={a.status} colorMap={ACTIVITY_STATUS_COLORS} />
                  {a.dueDate && <span className="text-[10px] text-gray-400">{formatDate(a.dueDate)}</span>}
                </div>
              </div>
              {a.assignee && <span className="text-xs text-gray-400 hidden sm:block">{a.assignee.name}</span>}
            </div>
          ))}
        </div>
      </div>
    );
    return <div className="space-y-6">{renderGroup('Active', active)}{renderGroup('Completed', done)}</div>;
  };

  const renderErrors = () => {
    if (tabLoading) return <SkeletonTable rows={5} />;
    if (!errorLogs.length) return <EmptyState icon={AlertTriangle} title="No error logs" subtitle="No errors have been logged for this project." />;
    return (
      <div className="space-y-2 stagger-children">
        {errorLogs.map((err) => {
          const open = expandedError === err.id;
          return (
            <div key={err.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <button onClick={() => setExpandedError(open ? null : err.id)} className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 transition-colors">
                {open ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                <StatusBadge status={err.level} colorMap={LEVEL_COLORS} />
                <span className="font-medium text-sm text-gray-900 truncate flex-1">{err.message}</span>
                {err.source && <span className="text-[10px] text-gray-400 hidden sm:block">{err.source}</span>}
                <span className="text-[10px] text-gray-400">{formatDate(err.createdAt)}</span>
              </button>
              {open && (
                <div className="border-t border-gray-100 p-4 space-y-4">
                  {err.stack && (
                    <div className="bg-gray-900 rounded-lg p-4 overflow-x-auto">
                      <pre className="text-sm text-green-400 font-mono whitespace-pre-wrap">{err.stack}</pre>
                    </div>
                  )}
                  {err.aiAnalysis && (
                    <div><h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">AI Analysis</h4><p className="text-sm text-gray-700 whitespace-pre-wrap">{err.aiAnalysis}</p></div>
                  )}
                  {err.aiSuggestion && (
                    <div className="bg-blue-50 rounded-lg p-3"><h4 className="text-xs font-semibold text-blue-800 mb-1">Suggestion</h4><p className="text-sm text-gray-700">{err.aiSuggestion}</p></div>
                  )}
                  <button onClick={() => {
                    api.triggerPipeline({ errorLogId: err.id, errorMessage: err.message, errorStack: err.stack, errorSource: err.source, projectId: id });
                    navigate('/pipeline');
                  }} className="btn-primary text-xs flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5" /> Auto-Fix
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const tabContent: Record<Tab, () => React.ReactNode> = {
    overview: renderOverview, tickets: renderTickets, contacts: renderContacts,
    deals: renderDeals, activities: renderActivities, errors: renderErrors,
    settings: () => null,
  };

  return (
    <div className="animate-page-in -m-4 lg:-m-6">
      {/* Top bar */}
      <div className="px-4 lg:px-6 py-3 border-b border-gray-200 bg-white flex items-center gap-4">
        <button onClick={() => navigate('/projects')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Projects
        </button>
        <div className="w-px h-5 bg-gray-200" />
        <div className="flex items-center gap-2.5">
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: project.color }} />
          <h1 className="font-semibold text-gray-900">{project.name}</h1>
          <StatusBadge status={project.status} colorMap={PROJECT_STATUS_COLORS} />
        </div>
      </div>

      {/* Horizontal tab bar */}
      <div className="bg-white border-b border-gray-200 px-4 lg:px-6 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {TABS.map((tab) => (
            <button key={tab.key} onClick={() => { setActiveTab(tab.key); if (tab.key === 'settings') setShowSettings(true); }}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300'
              }`}>
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {tab.key !== 'overview' && tab.key !== 'settings' && counts[tab.key] !== undefined && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab.key ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>
                  {counts[tab.key] || 0}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Full-width content */}
      <div className="p-4 lg:p-6 bg-gray-50 min-h-[calc(100vh-170px)]">
        {tabContent[activeTab]()}
      </div>

      {/* Settings Modal */}
      <Modal open={showSettings} onClose={() => setShowSettings(false)} title="Project Settings">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Project Name</label>
            <input value={editForm.name} onChange={(e) => setEditForm(f => ({ ...f, name: e.target.value }))} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={editForm.description} onChange={(e) => setEditForm(f => ({ ...f, description: e.target.value }))} className="input-field" rows={3} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
            <div className="flex gap-2">
              {PROJECT_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setEditForm(f => ({ ...f, color: c }))}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${editForm.color === c ? 'border-gray-900 scale-110' : 'border-transparent hover:scale-105'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select value={editForm.status} onChange={(e) => setEditForm(f => ({ ...f, status: e.target.value }))} className="input-field w-auto">
              {['ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex items-center justify-between pt-4 border-t border-gray-100">
            <button onClick={handleSaveSettings} disabled={saving} className="btn-primary flex items-center gap-2">
              <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Changes'}
            </button>
            {isSuperAdmin && (
              <button onClick={() => setShowDeleteConfirm(true)} className="btn-danger text-sm px-3 py-1.5">
                Delete Project
              </button>
            )}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={async () => {
          try {
            await api.deleteProject(id!);
            toast('Project deleted');
            navigate('/projects');
          } catch { toast('Failed to delete project', 'error'); }
        }}
        title="Delete Project"
        message={`Are you sure you want to delete "${project.name}"? This will permanently remove all associated tickets, contacts, deals, activities, and error logs. This action cannot be undone.`}
        confirmLabel="Delete Project"
        danger
      />
    </div>
  );
}
