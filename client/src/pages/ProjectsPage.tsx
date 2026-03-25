import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { Plus, FolderOpen, Users, DollarSign, Ticket, Activity } from 'lucide-react';

export function ProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', color: '#3b82f6' });

  useEffect(() => {
    api.getProjects().then((data: any) => { setProjects(data); setLoading(false); });
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const project: any = await api.createProject(form);
    setProjects((prev) => [project, ...prev]);
    setShowCreate(false);
    setForm({ name: '', description: '', color: '#3b82f6' });
    navigate(`/projects/${project.id}`);
  };

  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Project
        </button>
      </div>

      {loading ? (
        <div className="text-gray-500">Loading projects...</div>
      ) : projects.length === 0 ? (
        <div className="card text-center text-gray-500 py-12">
          <FolderOpen className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>No projects yet. Create your first project to organize your CRM.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <div
              key={p.id}
              onClick={() => navigate(`/projects/${p.id}`)}
              className="card cursor-pointer hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                <h3 className="font-semibold text-gray-900">{p.name}</h3>
                <span className={`ml-auto px-2 py-0.5 text-xs rounded-full font-medium ${
                  p.status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
                  p.status === 'PAUSED' ? 'bg-yellow-100 text-yellow-700' :
                  p.status === 'COMPLETED' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-700'
                }`}>{p.status}</span>
              </div>
              {p.description && (
                <p className="text-sm text-gray-500 mb-3 line-clamp-2">{p.description}</p>
              )}
              <div className="flex gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {p._count?.members || 0}</span>
                <span className="flex items-center gap-1"><Ticket className="w-3.5 h-3.5" /> {p._count?.contacts || 0} contacts</span>
                <span className="flex items-center gap-1"><DollarSign className="w-3.5 h-3.5" /> {p._count?.deals || 0} deals</span>
                <span className="flex items-center gap-1"><Activity className="w-3.5 h-3.5" /> {p._count?.activities || 0}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <form onSubmit={handleCreate} className="bg-white rounded-xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-lg font-bold">New Project</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Project Name</label>
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="input-field" rows={3} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
              <div className="flex gap-2">
                {colors.map((c) => (
                  <button
                    key={c} type="button"
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${form.color === c ? 'border-gray-900 scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">Cancel</button>
              <button type="submit" className="btn-primary">Create Project</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
