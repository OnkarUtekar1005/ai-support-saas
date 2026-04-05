import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Plus, FolderOpen, Users, DollarSign, Ticket, Activity, Search } from 'lucide-react';
import { StatusBadge, Modal, EmptyState, PageHeader, SkeletonCard, useToast } from '../components/shared';
import { PROJECT_STATUS_COLORS, PROJECT_COLORS } from '../constants';

export function ProjectsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ name: '', description: '', color: '#3b82f6' });

  useEffect(() => {
    api.getProjects().then((data: any) => { setProjects(data); setLoading(false); });
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const project: any = await api.createProject(form);
      setProjects((prev) => [project, ...prev]);
      setShowCreate(false);
      setForm({ name: '', description: '', color: '#3b82f6' });
      toast.success('Project created');
      navigate(`/projects/${project.id}`);
    } catch { toast.error('Failed to create project'); }
  };

  const filtered = search
    ? projects.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.description?.toLowerCase().includes(search.toLowerCase()))
    : projects;

  return (
    <div className="animate-page-in">
      <PageHeader title="Projects" subtitle="Organize your CRM data by project" action={{ label: 'New Project', icon: Plus, onClick: () => setShowCreate(true) }} />

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
        <EmptyState icon={FolderOpen} title="No projects found" subtitle={projects.length ? 'Try a different search.' : 'Create your first project to organize your CRM data.'} action={projects.length === 0 ? { label: 'Create Project', onClick: () => setShowCreate(true) } : undefined} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stagger-children">
          {filtered.map((p) => (
            <div key={p.id} onClick={() => navigate(`/projects/${p.id}`)} className="card cursor-pointer group animate-stagger-in">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors truncate">{p.name}</h3>
                <span className="ml-auto flex-shrink-0">
                  <StatusBadge status={p.status} colorMap={PROJECT_STATUS_COLORS} />
                </span>
              </div>
              {p.description && <p className="text-sm text-gray-500 mb-4 line-clamp-2">{p.description}</p>}
              <div className="flex gap-4 text-xs text-gray-400 pt-3 border-t border-gray-100">
                <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {p._count?.members || 0}</span>
                <span className="flex items-center gap-1"><Ticket className="w-3.5 h-3.5" /> {p._count?.contacts || 0}</span>
                <span className="flex items-center gap-1"><DollarSign className="w-3.5 h-3.5" /> {p._count?.deals || 0}</span>
                <span className="flex items-center gap-1"><Activity className="w-3.5 h-3.5" /> {p._count?.activities || 0}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Project" maxWidth="max-w-md">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Project Name</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input-field" required placeholder="e.g. Client Portal" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="input-field" rows={3} placeholder="What is this project about?" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
            <div className="flex gap-2">
              {PROJECT_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setForm((f) => ({ ...f, color: c }))} className={`w-8 h-8 rounded-full border-2 transition-all ${form.color === c ? 'border-gray-900 scale-110' : 'border-transparent hover:scale-105'}`} style={{ backgroundColor: c }} />
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
